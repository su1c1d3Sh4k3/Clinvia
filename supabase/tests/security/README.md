# Arnês de segurança / RLS

Scripts de medição usados no plano de correção de segurança de setembro/2026.
Estado atual do plano: [`docs/security/ESTADO_ATUAL.md`](../../../docs/security/ESTADO_ATUAL.md).

**Nenhum arquivo aqui contém segredo.** Os monitores leem `SUPABASE_ACCESS_TOKEN` do `.env`
da raiz; as ocorrências de `sk-...` nos harnesses são valores falsos de teste (`sk-arnes`).

## Como rodar

```sh
# Query/probe/verify: sempre --file (SQL inline começando com "--" quebra o parse do CLI)
npx supabase db query --linked --file supabase/tests/security/<pasta>/<arquivo>.sql > /tmp/out.json
python supabase/tests/security/lib/show_rows.py /tmp/out.json

# Monitoramento de 42501 / permission denied (janela em horas, default 2)
bash supabase/tests/security/monitor/monitor_42501.sh 2
bash supabase/tests/security/monitor/monitor_storage_rls.sh 2
```

## Padrão do arnês

Um harness é **uma transação só** que termina em `rollback`:

1. `setup` (personas, temp tables `_r`/`_ids` com `grant all` para `authenticated`, `anon`
   **e** `service_role`, mais a sequence `_r_ord_seq`);
2. mede o **ANTES** com cada persona (`set local role` + `set local request.jwt.claims`);
3. aplica a migration **inline** (o `build_harness.py` da pasta remove `begin`/`commit`/
   `set local lock_timeout` do arquivo de migration e cola no meio);
4. mede o **DEPOIS**;
5. `rollback` — produção nunca é tocada.

### Regras aprendidas (não repetir os erros)

- **`revoke` de coluna é inerte se o `grant` de tabela existe.** Ordem correta:
  `revoke <priv> on <tabela> from <role>` e **depois**
  `grant <priv> (<colunas permitidas>) on <tabela> to <role>`.
- **RLS não gera erro em UPDATE/DELETE**: sem policy permissiva casando, a instrução afeta
  **0 linhas** e retorna sucesso. Só INSERT/`WITH CHECK` levanta `42501`. Para exigir 42501 em
  UPDATE/DELETE, a trava tem de ser **privilégio** (grant), não policy.
- Se o objeto medido (coluna/função) só existe **depois** da migration, o bloco do ANTES precisa
  usar `execute format(...)` — senão o plpgsql não faz parse.
- `pg_get_functiondef()` estoura `42809` ao cruzar agregados: filtre `p.prokind in ('f','p')` ou
  use `p.prosrc`.
- A ordem das chaves no JSON do `supabase db query` **não** é a ordem do `SELECT` ⇒ emita uma
  única coluna de texto chamada `info` (é o que o `show_rows.py` imprime).
- `npx supabase db query --linked` roda como `postgres` (não como `service_role`).
- **"Bloqueado" não é prova**: confira o `sqlerrm`. Dois casos do item 0.5b pareciam seguros e o
  bloqueio vinha de RLS de `revenue_categories` dentro de um trigger de seeding — proteção
  acidental, que sumiria se aquela policy mudasse.

## Mapa das pastas

| Pasta | Item do plano |
|---|---|
| `fase_0/` | varreduras iniciais: grants por role, donos de função, personas, buckets, escritores das colunas de segredo, scanner de `select("*")` no front |
| `lote_0_3/` | lote 0.3 (RLS de `#3`, `#6`, `#11`, `#12`) |
| `item_0_4/` | `send_push_notification` — grants e chamadores |
| `item_0_5_profiles_update/` | escalonamento por UPDATE da própria linha de `profiles` |
| `item_0_5b_profiles_insert_delete/` | contorno por DELETE + INSERT da própria linha |
| `fase_1_admin_users/` | super admin em `public.admin_users` + hardening de grants |
| `monitor/` | monitoramento pós-apply |
| `lib/` | `show_rows.py` |
