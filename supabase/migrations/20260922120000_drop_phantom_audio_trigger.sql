-- Gemeo de audio do trigger fantasma de tokens (ver 20260921163000).
--
-- `trigger_log_audio_updates` (AFTER UPDATE OF audio_cost_monthly ON profiles
-- WHEN novo > antigo) chamava log_audio_updates(), que INSERE em audio_usage_log
-- com function_name='external-n8n', model='whisper-1' e duracao/caracteres = 0.
-- Mesmo defeito: qualquer UPDATE em massa em profiles geraria linhas novas, e o
-- caminho legitimo (track_audio_usage) ja grava a propria linha antes de somar.
--
-- AUDITORIA (22/09/2026) — diferente do caso dos tokens, aqui NAO ha duplicidade:
--   * audio_usage_log tem 20 linhas no total: 19 'external-n8n' + 1 'legacy-sync';
--     NENHUMA linha veio de track_audio_usage com function_name real, ou seja o
--     caminho legitimo nunca rodou em producao.
--   * A ultima linha e de 17/03/2026 — o fluxo de audio esta morto ha 6 meses.
--   * Soma: US$0,0415 (19 linhas fantasma = US$0,0309 de 3e21175c + US$0,0106 de
--     c4ac5e5e). Para 3e21175c, log (0,0309 + 0,0026 legacy) == profiles
--     audio_cost_total/monthly = 0,0335 exatamente.
-- Portanto as 19 linhas sao o UNICO rastro linha-a-linha desse consumo. Elas nao
-- sao apagadas: vao para a tabela de arquivo, e os acumuladores de profiles
-- (audio_cost_total / audio_cost_monthly) permanecem intactos.

drop trigger if exists trigger_log_audio_updates on public.profiles;
drop function if exists public.log_audio_updates() cascade;

create table if not exists public.audio_usage_log_phantom_archive
  (like public.audio_usage_log including defaults);

alter table public.audio_usage_log_phantom_archive
  add column if not exists archived_at timestamptz not null default now();

alter table public.audio_usage_log_phantom_archive enable row level security;

comment on table public.audio_usage_log_phantom_archive is
  'Linhas function_name=''external-n8n'' criadas pelo trigger fantasma log_audio_updates (dropado em 20260922120000). NUNCA agregar junto com audio_usage_log.';

create index if not exists audio_usage_log_phantom_archive_owner_created_idx
  on public.audio_usage_log_phantom_archive (owner_id, created_at desc);

with moved as (
  delete from public.audio_usage_log
  where function_name = 'external-n8n'
  returning *
)
insert into public.audio_usage_log_phantom_archive
select m.*, now() from moved m;
