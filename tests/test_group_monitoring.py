# -*- coding: utf-8 -*-
"""Testes de integração do Monitoramento de Grupos (rodar manualmente).

Uso: python tests/test_group_monitoring.py [schema|manage|intercept|dispatch|all]
SQL vai pela Management API via curl (urllib toma 403 do Cloudflare).
"""
import json
import subprocess
import sys
import os
import uuid

# Console Windows usa cp1252 — chars unicode nos prints quebravam o teste
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT = "swfshqvvbohnahdyndch"


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
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema='public' AND (
          (table_name='campaigns' AND column_name IN ('group_id','monitor_term','monitor_match_mode'))
          OR (table_name='campaign_contacts' AND column_name='monitor_message_id'))
    """)
    names = {(c["table_name"], c["column_name"]) for c in cols}
    ok &= check("campaigns.group_id", ("campaigns", "group_id") in names)
    ok &= check("campaigns.monitor_term", ("campaigns", "monitor_term") in names)
    ok &= check("campaigns.monitor_match_mode", ("campaigns", "monitor_match_mode") in names)
    ok &= check("campaign_contacts.monitor_message_id", ("campaign_contacts", "monitor_message_id") in names)

    con = sql("SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conname='campaigns_source_type_check'")
    ok &= check("source_type aceita 'monitoring'", con and "monitoring" in con[0]["d"])

    idx = sql("SELECT indexname FROM pg_indexes WHERE indexname='uq_active_monitoring_per_group'")
    ok &= check("índice único parcial existe", len(idx) == 1)

    # Testa o invariante 1-ativo-por-grupo com rows sintéticas (rollback via DELETE)
    marker = f"__test_monitor_{uuid.uuid4().hex[:8]}"
    grp = sql("SELECT id, user_id, group_name FROM groups WHERE user_id IS NOT NULL LIMIT 1")
    if not grp:
        print("[SKIP] sem grupos no banco p/ testar o índice")
        return ok
    g = grp[0]
    ins = f"""
        INSERT INTO campaigns (user_id, name, source_type, source_config, template_mode, status,
                               group_id, monitor_term, monitor_match_mode,
                               scheduled_at, valid_until, services, initial_message, variable_map, objective)
        VALUES ('{g['user_id']}', '{marker}', 'monitoring', '{{}}'::jsonb, 'none', 'dispatching',
                '{g['id']}', 'teste', 'contains',
                now(), now() + interval '7 days', '[]'::jsonb, 'oi', '{{}}'::jsonb, '')
        RETURNING id
    """
    first = sql(ins)
    ok &= check("insert monitoring ok", len(first) == 1)
    dup_err = None
    try:
        sql(ins.replace(marker, marker + "b"))
    except Exception as e:
        dup_err = str(e)
    dup = sql(f"SELECT id FROM campaigns WHERE name LIKE '{marker}%'")
    ok &= check("2º monitoramento ativo no mesmo grupo bloqueado", len(dup) == 1, f"rows={len(dup)} err={dup_err}")
    # encerrado libera novo
    sql(f"UPDATE campaigns SET status='cancelled' WHERE name LIKE '{marker}%'")
    second = sql(ins.replace(marker, marker + "c"))
    ok &= check("novo monitoramento após cancelar ok", len(second) == 1)
    sql(f"DELETE FROM campaigns WHERE name LIKE '{marker}%'")
    left = sql(f"SELECT count(*) c FROM campaigns WHERE name LIKE '{marker}%'")
    ok &= check("cleanup", left[0]["c"] == 0)
    return ok


def _anon_key():
    with open(os.path.join(ROOT, "supabase", ".temp", "api_keys.json"), encoding="utf-8") as f:
        keys = json.load(f)
    for k in keys:
        if k.get("name") == "anon":
            return k["api_key"]
    raise RuntimeError("anon key não encontrada em api_keys.json")


def edge(fn, body):
    """Invoca edge function em produção via curl."""
    key = _anon_key()
    tmp = os.path.join(ROOT, "supabase", ".temp", "_test_edge.json")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(body, f, ensure_ascii=False)
    out = subprocess.run(
        ["curl", "-s", "-X", "POST",
         f"https://swfshqvvbohnahdyndch.supabase.co/functions/v1/{fn}",
         "-H", f"Authorization: Bearer {key}",
         "-H", f"apikey: {key}",
         "-H", "Content-Type: application/json",
         "-d", f"@{tmp}"],
        capture_output=True, check=True)
    stdout = out.stdout.decode("utf-8", errors="replace")
    try:
        return json.loads(stdout)
    except json.JSONDecodeError:
        raise RuntimeError(f"Resposta não-JSON de {fn}: {stdout[:500]}")


def test_manage():
    print("== campaign-manage (create/end monitoring) ==")
    ok = True
    # Grupo cuja instância (direta ou via conversa) é UAZAPI
    rows = sql("""
        SELECT g.id, g.user_id, g.group_name, g.instance_id,
               COALESCE(g.instance_id, (
                   SELECT c.instance_id FROM conversations c
                   WHERE c.group_id = g.id AND c.instance_id IS NOT NULL
                   ORDER BY c.last_message_at DESC NULLS LAST LIMIT 1
               )) AS resolved_instance
        FROM groups g
        WHERE EXISTS (
            SELECT 1 FROM instances i
            WHERE i.id = COALESCE(g.instance_id, (
                    SELECT c.instance_id FROM conversations c
                    WHERE c.group_id = g.id AND c.instance_id IS NOT NULL
                    ORDER BY c.last_message_at DESC NULLS LAST LIMIT 1
                  ))
              AND COALESCE(i.provider, 'uazapi') <> 'meta'
        )
        ORDER BY (g.instance_id IS NULL) DESC
        LIMIT 1
    """)
    if not rows:
        print("[SKIP] nenhum grupo com instância UAZAPI resolvível")
        return ok
    g = rows[0]
    print(f"grupo: {g['group_name']} instance_id={g['instance_id']} resolved={g['resolved_instance']}")

    base = {
        "user_id": g["user_id"],
        "group_id": g["id"],
        "monitor_term": "teste monitor xyz",
        "monitor_match_mode": "contains",
        "valid_until": None,  # preenchido abaixo
        "initial_message": "Olá {{nome_cliente}}, vi seu interesse!",
        "ia_enabled": False,
        "objective": "",
        "services": [],
    }
    fut = sql("SELECT (now() + interval '2 days')::timestamptz AS t")[0]["t"]
    base["valid_until"] = fut

    res = edge("campaign-manage", {"action": "create_monitoring", **base})
    ok &= check("create_monitoring success", res.get("success") is True, str(res))
    camp = res.get("campaign") or {}
    cid = camp.get("id")
    ok &= check("status dispatching", camp.get("status") == "dispatching")
    ok &= check("source_type monitoring", camp.get("source_type") == "monitoring")
    ok &= check("nome = tag 'Monitoramento - ...'", str(camp.get("name", "")).startswith("Monitoramento - "))
    ok &= check("tag_id preenchido", bool(camp.get("tag_id")))
    ok &= check("instance_id resolvido", camp.get("instance_id") == g["resolved_instance"])

    if g["instance_id"] is None and cid:
        gnow = sql(f"SELECT instance_id FROM groups WHERE id = '{g['id']}'")
        ok &= check("groups.instance_id backfilled", gnow[0]["instance_id"] == g["resolved_instance"])

    # Duplicado → erro amigável
    dup = edge("campaign-manage", {"action": "create_monitoring", **base})
    ok &= check("duplicado bloqueado", dup.get("success") is False and "monitoramento ativo" in str(dup.get("error", "")), str(dup))

    # Encerra
    if cid:
        end = edge("campaign-manage", {"action": "end_monitoring", "user_id": g["user_id"], "campaign_id": cid})
        ok &= check("end_monitoring success", end.get("success") is True, str(end))
        after = sql(f"SELECT status, expired_processed, tag_id FROM campaigns WHERE id = '{cid}'")
        ok &= check("status cancelled", after and after[0]["status"] == "cancelled")
        ok &= check("tag excluída (tag_id NULL)", after and after[0]["tag_id"] is None)
        tagleft = sql(f"SELECT count(*) c FROM tags WHERE id = '{camp.get('tag_id')}'")
        ok &= check("tags row removida", tagleft[0]["c"] == 0)
        # Grupo liberado p/ novo monitoramento
        again = edge("campaign-manage", {"action": "create_monitoring", **base})
        ok &= check("novo monitoramento após encerrar", again.get("success") is True, str(again))
        cid2 = (again.get("campaign") or {}).get("id")
        tag2 = (again.get("campaign") or {}).get("tag_id")
        # Cleanup
        ids = [i for i in (cid, cid2) if i]
        sql(f"DELETE FROM campaigns WHERE id IN ({','.join(chr(39)+i+chr(39) for i in ids)})")
        if tag2:
            sql(f"DELETE FROM tags WHERE id = '{tag2}'")
        left = sql(f"SELECT count(*) c FROM campaigns WHERE id IN ({','.join(chr(39)+i+chr(39) for i in ids)})")
        ok &= check("cleanup", left[0]["c"] == 0)
    return ok


def _pick_group():
    rows = sql("""
        SELECT g.id, g.user_id, g.group_name, g.remote_jid,
               COALESCE(g.instance_id, (
                   SELECT c.instance_id FROM conversations c
                   WHERE c.group_id = g.id AND c.instance_id IS NOT NULL
                   ORDER BY c.last_message_at DESC NULLS LAST LIMIT 1
               )) AS resolved_instance,
               i.instance_name
        FROM groups g
        JOIN instances i ON i.id = COALESCE(g.instance_id, (
              SELECT c.instance_id FROM conversations c
              WHERE c.group_id = g.id AND c.instance_id IS NOT NULL
              ORDER BY c.last_message_at DESC NULLS LAST LIMIT 1))
        WHERE COALESCE(i.provider, 'uazapi') <> 'meta'
        LIMIT 1
    """)
    return rows[0] if rows else None


def test_intercept():
    print("== webhook-handle-message: intercept do termo ==")
    ok = True
    g = _pick_group()
    if not g:
        print("[SKIP] nenhum grupo com instância UAZAPI resolvível")
        return ok
    print(f"grupo: {g['group_name']} ({g['remote_jid']}) inst={g['instance_name']}")

    fut = sql("SELECT (now() + interval '2 days')::timestamptz AS t")[0]["t"]
    res = edge("campaign-manage", {
        "action": "create_monitoring", "user_id": g["user_id"], "group_id": g["id"],
        "monitor_term": "Promoção, Especial!", "monitor_match_mode": "contains",
        "valid_until": fut, "initial_message": "Oi {{nome_cliente}}!",
        "ia_enabled": False, "objective": "", "services": [],
    })
    if not check("monitoramento criado", res.get("success") is True, str(res)):
        return False
    camp = res["campaign"]
    cid, tag_id = camp["id"], camp["tag_id"]

    fake_phone = "55319" + str(uuid.uuid4().int % 10**8).zfill(8)
    mid1, mid2, mid3 = (f"TESTMON{uuid.uuid4().hex[:12].upper()}" for _ in range(3))

    def group_msg(text, msgid):
        return edge("webhook-handle-message", {
            "instanceName": g["instance_name"],
            "EventType": "messages",
            "chat": {"wa_chatid": g["remote_jid"], "wa_name": g["group_name"]},
            "message": {
                "isGroup": True, "chatid": g["remote_jid"], "messageid": msgid,
                "text": text, "fromMe": False, "messageType": "conversation",
                "sender_pn": fake_phone, "senderName": "Lead Teste Monitor",
            },
        })

    # 1) match (normalização: caixa/acento/pontuação/espaços)
    r1 = group_msg("quero a   PROMOCAO especial. mesmo!!", mid1)
    check("webhook 1 aceito", r1.get("success") is True, str(r1))
    entries = sql(f"""
        SELECT cc.id, cc.status, cc.contact_id, cc.conversation_id, cc.monitor_message_id, cc.raw_data
        FROM campaign_contacts cc WHERE cc.campaign_id = '{cid}'
    """)
    ok &= check("1 entrada criada no match", len(entries) == 1, f"rows={len(entries)}")
    if len(entries) == 1:
        e = entries[0]
        ok &= check("entrada pending", e["status"] == "pending")
        ok &= check("monitor_message_id preenchido", bool(e["monitor_message_id"]))
        ok &= check("conversation_id preenchido", bool(e["conversation_id"]))
        ok &= check("raw_data.nome_cliente", "Lead Teste Monitor" in json.dumps(e["raw_data"]))
        conv = sql(f"SELECT status, instance_id, queue_id, (SELECT name FROM queues WHERE id = queue_id) qn FROM conversations WHERE id = '{e['conversation_id']}'")
        ok &= check("conversa pending", conv and conv[0]["status"] == "pending")
        ok &= check("conversa na instância do grupo", conv and conv[0]["instance_id"] == g["resolved_instance"])
        ok &= check("fila Atendimento Humano (ia off)", conv and conv[0]["qn"] == "Atendimento Humano")
        tags = sql(f"SELECT count(*) c FROM contact_tags WHERE contact_id = '{e['contact_id']}' AND tag_id = '{tag_id}'")
        ok &= check("tag do monitoramento aplicada", tags[0]["c"] == 1)
        contact = sql(f"SELECT number FROM contacts WHERE id = '{e['contact_id']}'")
        ok &= check("contato criado c/ número do lead", contact and fake_phone[-8:] in contact[0]["number"])

    # 2) segundo match do MESMO lead não re-dispara
    r2 = group_msg("promoção especial de novo", mid2)
    check("webhook 2 aceito", r2.get("success") is True, str(r2))
    n2 = sql(f"SELECT count(*) c FROM campaign_contacts WHERE campaign_id = '{cid}'")
    ok &= check("2º match não duplica entrada", n2[0]["c"] == 1)

    # 3) texto sem o termo não dispara
    r3 = group_msg("so promocao aqui, nada mais", mid3)
    check("webhook 3 aceito", r3.get("success") is True, str(r3))
    n3 = sql(f"SELECT count(*) c FROM campaign_contacts WHERE campaign_id = '{cid}'")
    ok &= check("texto sem o termo ignorado", n3[0]["c"] == 1)

    # Cleanup
    contact_id = entries[0]["contact_id"] if entries else None
    conv_id = entries[0]["conversation_id"] if entries else None
    sql(f"DELETE FROM messages WHERE evolution_id IN ('{mid1}','{mid2}','{mid3}')")
    sql(f"DELETE FROM campaigns WHERE id = '{cid}'")
    sql(f"DELETE FROM tags WHERE id = '{tag_id}'")
    if conv_id:
        sql(f"DELETE FROM conversations WHERE id = '{conv_id}'")
    if contact_id:
        sql(f"DELETE FROM crm_client WHERE contact_id = '{contact_id}'")
        sql(f"DELETE FROM contacts WHERE id = '{contact_id}'")
    sql(f"DELETE FROM group_members WHERE number = '{fake_phone}'")
    left = sql(f"SELECT (SELECT count(*) FROM campaigns WHERE id = '{cid}') + (SELECT count(*) FROM messages WHERE evolution_id IN ('{mid1}','{mid2}','{mid3}')) c")
    ok &= check("cleanup", left[0]["c"] == 0)
    return ok


def test_dispatch():
    """Valida o worker: entrada de monitoring é pega pelo cron (1min), usa a
    conversa pré-criada e a campanha NUNCA vira 'dispatched'. O envio real
    falha (número fake) — 'failed' é aceito como prova do fluxo."""
    import time
    print("== campaign-dispatch (fonte monitoring) ==")
    ok = True
    g = _pick_group()
    if not g:
        print("[SKIP] nenhum grupo com instância UAZAPI resolvível")
        return ok

    fut = sql("SELECT (now() + interval '2 days')::timestamptz AS t")[0]["t"]
    res = edge("campaign-manage", {
        "action": "create_monitoring", "user_id": g["user_id"], "group_id": g["id"],
        "monitor_term": "gatilho dispatch teste", "monitor_match_mode": "equals",
        "valid_until": fut, "initial_message": "Oi {{nome_cliente}}, tudo bem?",
        "ia_enabled": False, "objective": "", "services": [],
    })
    if not check("monitoramento criado", res.get("success") is True, str(res)):
        return False
    camp = res["campaign"]
    cid, tag_id = camp["id"], camp["tag_id"]

    fake_phone = "55329" + str(uuid.uuid4().int % 10**8).zfill(8)
    contact = sql(f"""
        INSERT INTO contacts (user_id, number, push_name, is_group, instance_id)
        VALUES ('{g['user_id']}', '{fake_phone}@s.whatsapp.net', 'Lead Dispatch Teste', false, '{g['resolved_instance']}')
        RETURNING id
    """)
    contact_id = contact[0]["id"]

    match = sql(f"SELECT monitoring_register_match('{cid}'::uuid, '{contact_id}'::uuid, NULL) r")
    r = match[0]["r"]
    ok &= check("match registrado", r.get("created") is True, str(r))
    conv_id = r.get("conversation_id")
    entry_id = r.get("entry_id")

    # Cron roda a cada 1min — aguarda a entrada sair de pending (máx ~4min)
    final = None
    for _ in range(48):
        rows = sql(f"SELECT status, conversation_id, error FROM campaign_contacts WHERE id = '{entry_id}'")
        if rows and rows[0]["status"] not in ("pending", "sending"):
            final = rows[0]
            break
        time.sleep(5)
    ok &= check("entrada processada pelo worker", final is not None,
                "ainda pending/sending após 4min — cron rodou?")
    if final:
        print(f"  status final: {final['status']} err={str(final.get('error'))[:80]}")
        ok &= check("status sent|failed (número fake → failed ok)",
                    final["status"] in ("sent", "failed"), final["status"])
        ok &= check("conversa pré-criada preservada na entrada",
                    final["conversation_id"] == conv_id, str(final))
        convrow = sql(f"SELECT count(*) c FROM conversations WHERE id = '{conv_id}'")
        ok &= check("conversa não foi deletada", convrow[0]["c"] == 1)

    campnow = sql(f"SELECT status FROM campaigns WHERE id = '{cid}'")
    ok &= check("campanha segue 'dispatching' (nunca dispatched)",
                campnow[0]["status"] == "dispatching", campnow[0]["status"])

    # Cleanup
    sql(f"DELETE FROM campaigns WHERE id = '{cid}'")
    sql(f"DELETE FROM tags WHERE id = '{tag_id}'")
    sql(f"DELETE FROM messages WHERE conversation_id = '{conv_id}'")
    sql(f"DELETE FROM conversations WHERE id = '{conv_id}'")
    sql(f"DELETE FROM crm_client WHERE contact_id = '{contact_id}'")
    sql(f"DELETE FROM contacts WHERE id = '{contact_id}'")
    left = sql(f"SELECT (SELECT count(*) FROM campaigns WHERE id='{cid}') + (SELECT count(*) FROM contacts WHERE id='{contact_id}') c")
    ok &= check("cleanup", left[0]["c"] == 0)
    return ok


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    results = []
    if which in ("schema", "all"):
        results.append(("schema", test_schema()))
    if which in ("manage", "all"):
        results.append(("manage", test_manage()))
    if which in ("intercept", "all"):
        results.append(("intercept", test_intercept()))
    if which in ("dispatch", "all"):
        results.append(("dispatch", test_dispatch()))
    print()
    failed = [n for n, r in results if not r]
    if failed:
        print("FALHOU:", ", ".join(failed))
        sys.exit(1)
    print("TODOS OS TESTES PASSARAM")
