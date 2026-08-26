# -*- coding: utf-8 -*-
"""Testes de integração do CRM por conexão (rodar manualmente).

Um card de crm_client passa a ser por (contato, conexão): mexer no funil de uma
instância não pode arrastar a conversa da outra.

Uso: python tests/test_crm_por_instancia.py [schema|invariantes|cascata|funcoes|all]
SQL vai pela Management API via curl (urllib toma 403 do Cloudflare).
"""
import json
import subprocess
import sys
import os

# Console Windows usa cp1252 — chars unicode nos prints quebravam o teste
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT = "swfshqvvbohnahdyndch"
SENTINEL = "00000000-0000-0000-0000-000000000000"


def _token():
    with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
        for line in f:
            if line.startswith("SUPABASE_ACCESS_TOKEN"):
                return line.split("=", 1)[1].strip().strip('"')
    raise RuntimeError("SUPABASE_ACCESS_TOKEN não encontrado no .env")


def sql(query):
    """Roda SQL na produção via Management API (curl)."""
    payload = json.dumps({"query": query})
    tmp = os.path.join(ROOT, "supabase", ".temp", "_test_query.json")
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(payload)
    out = subprocess.run(
        ["curl", "-s", "-X", "POST",
         f"https://api.supabase.com/v1/projects/{PROJECT}/database/query",
         "-H", f"Authorization: Bearer {_token()}",
         "-H", "Content-Type: application/json",
         "-d", f"@{tmp}"],
        capture_output=True, check=True)
    stdout = out.stdout.decode("utf-8", errors="replace")  # Windows: text=True usaria cp1252 (mojibake)
    try:
        data = json.loads(stdout)
    except json.JSONDecodeError:
        raise RuntimeError(f"Resposta não-JSON: {stdout[:500]}")
    if isinstance(data, dict):  # erro da Management API ({"message": ...})
        raise RuntimeError(f"SQL error: {data}")
    return data


def check(name, cond, extra=""):
    status = "OK " if cond else "FAIL"
    print(f"[{status}] {name}" + (f" — {extra}" if extra and not cond else ""))
    return cond


def test_schema():
    print("== Schema ==")
    ok = True
    cols = sql("""
        SELECT column_name, is_generated FROM information_schema.columns
        WHERE table_schema='public' AND table_name='crm_client'
          AND column_name IN ('instance_id','instagram_instance_id','channel_key')
    """)
    by_name = {c["column_name"]: c for c in cols}
    ok &= check("crm_client.instance_id", "instance_id" in by_name)
    ok &= check("crm_client.instagram_instance_id", "instagram_instance_id" in by_name)
    ok &= check("crm_client.channel_key é coluna gerada",
                by_name.get("channel_key", {}).get("is_generated") == "ALWAYS",
                f"{by_name.get('channel_key')}")

    idx = sql("""
        SELECT indexname, indexdef FROM pg_indexes
        WHERE tablename='crm_client' AND indexname LIKE 'uq_crm_client_one_active%'
    """)
    names = {i["indexname"] for i in idx}
    ok &= check("índice único novo (contact_id, channel_key)",
                "uq_crm_client_one_active_per_contact_channel" in names, f"{sorted(names)}")
    ok &= check("índice antigo (só contact_id) removido",
                "uq_crm_client_one_active_per_contact" not in names, f"{sorted(names)}")

    con = sql("""
        SELECT convalidated FROM pg_constraint WHERE conname='crm_client_single_channel_chk'
    """)
    ok &= check("CHECK de canal único validado", bool(con) and con[0]["convalidated"] is True)

    apt = sql("""
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='appointments' AND column_name='instance_id'
    """)
    ok &= check("appointments.instance_id", len(apt) == 1)
    return ok


def test_invariantes():
    print("== Invariantes ==")
    ok = True

    # P1 — no máximo um card ativo por (contato, conexão)
    dup = sql("""
        SELECT count(*) c FROM (
          SELECT contact_id, channel_key FROM crm_client WHERE is_active
          GROUP BY 1,2 HAVING count(*) > 1) t
    """)
    ok &= check("P1 nenhum (contato, conexão) com 2 cards ativos", dup[0]["c"] == 0, f"{dup[0]['c']} grupos")

    # P2 — canal inválido (WhatsApp e Instagram ao mesmo tempo)
    bad = sql("""
        SELECT count(*) c FROM crm_client
        WHERE instance_id IS NOT NULL AND instagram_instance_id IS NOT NULL
    """)
    ok &= check("P2 nenhum card com conexão dupla", bad[0]["c"] == 0, f"{bad[0]['c']} cards")

    # P3 — card na sentinela só é aceitável para contato cujas conversas também não
    # têm conexão (legado). Sentinela em contato com conversa de conexão = vazamento:
    # algum fluxo criou card sem gravar o canal.
    sent = sql(f"""
        SELECT count(*) c FROM crm_client cc
        WHERE cc.is_active AND cc.channel_key = '{SENTINEL}'
          AND EXISTS (SELECT 1 FROM conversations cv WHERE cv.contact_id = cc.contact_id
                      AND (cv.instance_id IS NOT NULL OR cv.instagram_instance_id IS NOT NULL))
    """)
    ok &= check("P3 nenhum card sem conexão em contato que tem conexão", sent[0]["c"] == 0, f"{sent[0]['c']} cards")

    # P4 — card ativo sem conversa nenhuma é proibido (invariante de 20260817130000)
    orf = sql("""
        SELECT count(*) c FROM crm_client cc
        WHERE cc.is_active AND NOT EXISTS (
          SELECT 1 FROM conversations cv WHERE cv.contact_id = cc.contact_id)
    """)
    ok &= check("P4 nenhum card ativo sem conversa", orf[0]["c"] == 0, f"{orf[0]['c']} cards")

    # P5 — split completo: conversa aberta COM conexão cujo contato já tem card ativo
    # precisa ter um card no canal dela. (Conversa legada sem conexão nenhuma e contato
    # sem card algum são condições pré-existentes, fora do escopo.)
    gap = sql("""
        SELECT count(*) c FROM conversations cv
        WHERE cv.status IN ('open','pending') AND cv.contact_id IS NOT NULL
          AND cv.group_id IS NULL
          AND (cv.instance_id IS NOT NULL OR cv.instagram_instance_id IS NOT NULL)
          AND EXISTS (SELECT 1 FROM crm_client cc WHERE cc.contact_id = cv.contact_id AND cc.is_active)
          AND NOT EXISTS (
            SELECT 1 FROM crm_client cc
            WHERE cc.contact_id = cv.contact_id AND cc.is_active
              AND cc.instance_id IS NOT DISTINCT FROM cv.instance_id
              AND cc.instagram_instance_id IS NOT DISTINCT FROM cv.instagram_instance_id)
    """)
    ok &= check("P5 conversa com conexão tem card no seu canal", gap[0]["c"] == 0, f"{gap[0]['c']} conversas")

    # P6 — USER RULE dos contadores: Aberto+Pendente+Concluído = total
    counts = sql("""
        SELECT count(*) c FROM (
          SELECT u.id FROM profiles u,
          LATERAL compute_crm_stage_counts(u.id, NULL, NULL, NULL, NULL, NULL) s
          WHERE s.total <> s.open_count + s.pending_count + s.resolved_count) t
    """)
    ok &= check("P6 total = aberto+pendente+concluído", counts[0]["c"] == 0, f"{counts[0]['c']} linhas")
    return ok


def _split_contact():
    """Contato com card ativo + conversa aberta em DUAS instâncias diferentes."""
    rows = sql("""
        SELECT cv.contact_id,
               min(cv.instance_id::text) FILTER (WHERE cv.instance_id IS NOT NULL) AS any_inst,
               count(DISTINCT cv.instance_id) n
        FROM conversations cv
        JOIN crm_client cc ON cc.contact_id = cv.contact_id AND cc.is_active
             AND cc.instance_id IS NOT DISTINCT FROM cv.instance_id
        WHERE cv.status IN ('open','pending') AND cv.instance_id IS NOT NULL
        GROUP BY cv.contact_id HAVING count(DISTINCT cv.instance_id) >= 2
        LIMIT 1
    """)
    if not rows:
        return None
    contact = rows[0]["contact_id"]
    pair = sql(f"""
        SELECT cv.id conv_id, cv.instance_id, cv.queue_id, cc.id card_id, cc.stage
        FROM conversations cv
        JOIN crm_client cc ON cc.contact_id = cv.contact_id AND cc.is_active
             AND cc.instance_id IS NOT DISTINCT FROM cv.instance_id
        WHERE cv.contact_id = '{contact}' AND cv.status IN ('open','pending')
          AND cv.instance_id IS NOT NULL
        ORDER BY cv.instance_id, cv.last_message_at DESC NULLS LAST
    """)
    seen, out = set(), []
    for r in pair:
        if r["instance_id"] in seen:
            continue
        seen.add(r["instance_id"])
        out.append(r)
    return out[:2] if len(out) >= 2 else None


def test_cascata():
    print("== Cascata entre conexões (P7/P8) ==")
    pair = _split_contact()
    if not pair:
        print("[SKIP] nenhum contato com card+conversa em 2 instâncias")
        return True
    a, b = pair
    ok = True

    # P7 — mover o card da instância A não pode mexer na fila da conversa da B
    res = sql(f"""
        BEGIN;
        UPDATE crm_client SET stage = CASE WHEN stage = 'Suporte' THEN 'Financeiro' ELSE 'Suporte' END
        WHERE id = '{a['card_id']}';
        SELECT (queue_id IS NOT DISTINCT FROM '{b['queue_id']}'::uuid) AS unchanged FROM conversations WHERE id = '{b['conv_id']}';
        ROLLBACK;
    """)
    ok &= check("P7 fila da conversa da outra conexão intocada",
                bool(res) and res[0]["unchanged"] is True, f"{res}")

    # P8 — encerrar a negociação de uma conversa não fecha a da outra conexão
    res = sql(f"""
        BEGIN;
        SELECT crm_close_conversation_negotiation('{a['conv_id']}'::uuid, 'Ganho', NULL, NULL);
        SELECT status FROM conversations WHERE id = '{b['conv_id']}';
        ROLLBACK;
    """)
    ok &= check("P8 conversa da outra conexão continua aberta",
                bool(res) and res[0]["status"] in ("open", "pending"), f"{res}")
    return ok


def test_funcoes():
    print("== Funções escopadas por canal ==")
    ok = True
    for fn, needle, label in [
        ("sync_queue_from_crm_stage", "NEW.instance_id", "sync etapa→fila filtra a conexão"),
        ("sync_crm_stage_from_queue", "instance_id IS NOT DISTINCT FROM", "sync fila→etapa casa a conexão"),
        ("crm_card_on_conv_insert", "channel_key", "criação de card usa o novo árbitro"),
        ("crm_card_on_conv_resolve", "instance_id IS NOT DISTINCT FROM", "resolve só finaliza o card do canal"),
        ("crm_terminal_resolve_tickets", "c.instance_id = NEW.instance_id", "etapa final encerra só o canal"),
        ("get_followup_pending_contacts", "instance_id IS NOT DISTINCT FROM", "follow-up ignora card de outra conexão"),
        ("compute_crm_stage_counts", "p_channel", "contadores aceitam filtro de conexão"),
    ]:
        rows = sql(f"""
            SELECT string_agg(pg_get_functiondef(p.oid), E'\\n') src
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname='public' AND p.proname='{fn}'
        """)
        src = (rows[0]["src"] or "") if rows else ""
        ok &= check(f"{fn}: {label}", needle in src, "função não encontrada" if not src else "sem o escopo de canal")
    return ok


TESTS = {
    "schema": test_schema,
    "invariantes": test_invariantes,
    "cascata": test_cascata,
    "funcoes": test_funcoes,
}

if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    names = list(TESTS) if which == "all" else [which]
    results = []
    for n in names:
        results.append((n, TESTS[n]()))
        print()
    print("== Resumo ==")
    for n, r in results:
        print(f"  {'OK  ' if r else 'FALHOU'} {n}")
    sys.exit(0 if all(r for _, r in results) else 1)
