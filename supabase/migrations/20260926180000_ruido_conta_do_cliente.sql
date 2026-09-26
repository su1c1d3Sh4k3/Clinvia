-- REGRA GERAL (ordem dele, 26/09/2026):
--
--   "Conta ou conexao do CLIENTE com problema (UAZAPI desconectada, Instagram
--    vencido, erro de envio da Meta) = aviso para o CLIENTE no front, com a acao
--    que ele precisa tomar. Para mim: nada no WhatsApp, no maximo painel.
--    Excecao: defeito NOSSO continua alertando."
--
-- O criterio nao e a gravidade do fato, e QUEM PODE AGIR. Token do Instagram
-- vencido e grave para a clinica e nao tem uma unica acao possivel do lado do
-- super admin: so o dono da conta reconecta, por OAuth, na tela dele. Alerta que
-- chega para quem nao pode agir e ruido, e ruido ensina que vermelho da para
-- ignorar — que e o custo real, cobrado no dia em que o vermelho importa.
--
-- Esta migration mexe SO no catalogo (piso, teto e somente_painel) e na funcao
-- do cron do Instagram. Nenhum detector e desligado: tudo continua sendo
-- gravado e continua visivel no painel.
--
-- O QUE MUDA, item a item:
--
--   instagram:token-vencido        alta/WHATS   -> baixa/teto baixa/painel
--   uazapi:instancia-desconectada  baixa/WHATS  -> baixa/teto baixa/painel
--   meta:instancia-desconectada    baixa/WHATS  -> baixa/teto baixa/painel
--   uazapi:varredura-cega          media/WHATS  -> baixa/teto baixa/painel
--   uazapi:remocao-pendente        media/WHATS  -> baixa/teto baixa/painel
--   uzapi-instancias-orfas         (sem linha)  -> baixa/teto baixa/painel
--   meta:fora_do_ar                (sem linha)  -> media/teto media/painel
--   envio:conta-                   critica/WHATS-> critica/painel
--   instagram:renovacao-falhou     (nao existia) -> alta/WHATS
--
-- POR QUE `envio:conta-` CONTINUA CRITICA E SO PERDE O TELEFONE: 131031 e
-- 131042 sao a conta inteira da clinica barrada pela Meta — pagamento ou
-- elegibilidade do negocio dela. Ninguem aqui resolve isso; quem resolve e ela,
-- no Business Manager. A gravidade fica critica porque no painel ela tem que
-- aparecer no topo, e e por ali que o suporte avisa o cliente.
--
-- POR QUE `uzapi-instancias-orfas` PRECISA DE LINHA PROPRIA: sem ela o
-- componente casa no prefixo `uzapi-` (alta, WhatsApp), que existe para erro das
-- functions de conexao. O varredor de orfas nao e uma function quebrada: e um
-- relatorio de divida de cadastro que roda uma vez por dia.
--
-- POR QUE `instagram:renovacao-falhou` NASCE ALTA E TOCA: e o lado de ca da
-- mesma moeda. A renovacao automatica existe justamente para o cliente nunca
-- precisar reconectar; se ela falha com o token AINDA VALIDO, o defeito e nosso
-- e temos ~15 dias para consertar antes que vire problema do cliente. Se isso
-- ficar mudo, a unica coisa que fala e o `instagram:token-vencido` — que agora,
-- de proposito, nao toca em lugar nenhum.

set lock_timeout = '5s';
set statement_timeout = '120s';

-- ── 1. componentes de conta/conexao do cliente: painel, nunca telefone ──────

update public.incident_component_catalog
   set severidade_padrao = 'baixa',
       severidade_teto   = 'baixa',
       somente_painel    = true,
       acao_padrao       = 'Nao ha acao do super admin. A conta do Instagram so volta com o proprio '
                           'cliente reconectando por OAuth na tela de Conexoes — o aviso vermelho e o '
                           'aviso previo de 7 dias ja aparecem la para ele. Este registro serve para o '
                           'suporte saber, quando a clinica ligar, que o Direct esta parado e desde quando.',
       updated_at        = now()
 where component = 'instagram:token-vencido';

update public.incident_component_catalog
   set somente_painel = true,
       updated_at     = now()
 where component in ('uazapi:instancia-desconectada', 'meta:instancia-desconectada');

update public.incident_component_catalog
   set severidade_padrao = 'baixa',
       severidade_teto   = 'baixa',
       somente_painel    = true,
       updated_at        = now()
 where component in ('uazapi:varredura-cega', 'uazapi:remocao-pendente');

update public.incident_component_catalog
   set somente_painel = true,
       updated_at     = now()
 where component = 'envio:conta-';

insert into public.incident_component_catalog
    (component, match_tipo, natureza, descricao, acao_padrao,
     severidade_padrao, severidade_teto, somente_painel, is_active)
values
    ('uzapi-instancias-orfas', 'exato', 'detector',
     'falha da propria varredura diaria de instancias orfas na UAZAPI',
     'Relatorio de divida de cadastro, nao incidente de operacao: nenhuma mensagem de paciente '
     'depende deste varredor. Se ele falhar, a lista de orfas fica desatualizada ate a passada do '
     'dia seguinte. Sem linha propria este componente casava no prefixo `uzapi-`, que e alta e vai '
     'para o WhatsApp — prefixo pensado para as functions de CONEXAO, nao para um relatorio diario.',
     'baixa', 'baixa', true, true),
    ('meta:fora_do_ar', 'exato', 'detector',
     'a Graph API da Meta respondeu 5xx ou nao respondeu',
     'Indisponibilidade de terceiro: nao ha o que consertar deste lado e nao ha o que pedir ao '
     'cliente. O envio passageiro ja vai para a fila `meta_send_retry` e sai sozinho quando a Meta '
     'voltar. Fica no painel para dar nome ao periodo quando alguem perguntar por que houve atraso.',
     'media', 'media', true, true),
    ('instagram:renovacao-falhou', 'prefixo', 'servico',
     'a renovacao automatica falhou com o token do Instagram AINDA VALIDO',
     'DEFEITO NOSSO e tem prazo: o token ainda vale, mas a rotina que deveria renova-lo sem o '
     'cliente perceber parou de funcionar. Restam no maximo 15 dias ate a conta cair sozinha. '
     'Olhar o motivo da Graph API no evento: token revogado do lado do cliente (ai e reconexao '
     'dele) e diferente de app sem permissao ou endpoint mudado (ai e nosso). Este e o unico '
     'componente de Instagram que acorda telefone — o `instagram:token-vencido` e so-painel de '
     'proposito, entao se este ficar mudo ninguem avisa a tempo.',
     'alta', null, false, true)
on conflict (component) do update
   set match_tipo        = excluded.match_tipo,
       natureza          = excluded.natureza,
       descricao         = excluded.descricao,
       acao_padrao       = excluded.acao_padrao,
       severidade_padrao = excluded.severidade_padrao,
       severidade_teto   = excluded.severidade_teto,
       somente_painel    = excluded.somente_painel,
       is_active         = true,
       updated_at        = now();

-- ── 2. cron do Instagram: dono no incidente e fim da escalada de gravidade ──
--
-- DIFF CONTRA A VERSAO VIVA (lida com pg_get_functiondef, nao do arquivo antigo).
-- Preservado tudo, inclusive o `'origem', 'cron'` que `20260923560000` acrescentou
-- e que NAO esta na migration `20260923260000`. Duas REMOCOES, ambas de proposito:
--
--   (a) `incident_set_severidade_inicial(..., 'alta')` e `incident_piso_severidade
--       (..., 'alta')` no ramo "status connected + token vencido". Existiam pela
--       REGRA DE RUIDO de 23/09: status mentindo na tela = alta. A premissa caiu —
--       o banner do cliente passou a ler `token_expires_at`, nao `status`, entao a
--       tela nao mente mais nem por um minuto, e o escalonamento so serviria para
--       furar o teto baixa que esta sendo posto aqui em cima.
--   (b) o ramo `else` com severidade 'media', pelo mesmo motivo.
--
-- Uma ADICAO: `owner_id`. Sem ele o incidente chega sem dono, e o campo Cliente do
-- painel cai em "Conta nao identificada" — num componente cuja unica utilidade
-- restante e o suporte saber DE QUEM e a conta parada.

create or replace function public.instagram_refresh_tokens_run()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_url       text;
    v_jwt       text;
    v_edge      text;
    v_reg       record;
    v_res       jsonb;
    v_enviados  integer := 0;
    v_expirados integer := 0;
    v_mentindo  integer := 0;
    v_saudaveis integer := 0;
begin
    select decrypted_secret into v_url  from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_jwt  from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
    select decrypted_secret into v_edge from vault.decrypted_secrets where name = 'SUPABASE_EDGE_SECRET_KEY' limit 1;

    if v_url is null then
        raise exception 'SUPABASE_URL ausente no vault — nao da para chamar a edge function';
    end if;

    -- ── 1. quem ainda da para salvar ─────────────────────────────────────────
    -- Sem filtro por status: o que decide e o token, nao o rotulo da linha.
    for v_reg in
        select i.id, i.account_name, i.token_expires_at
          from public.instagram_instances i
         where i.access_token is not null
           and i.token_expires_at is not null
           and i.token_expires_at > now()
           and i.token_expires_at < now() + interval '15 days'
         order by i.token_expires_at
    loop
        perform public.clinvia_http_post(
            p_alvo    := 'instagram-refresh-token',
            p_origem  := 'cron:instagram-refresh-tokens',
            p_url     := v_url || '/functions/v1/instagram-refresh-token',
            p_headers := jsonb_build_object(
                'Content-Type',  'application/json',
                'Authorization', 'Bearer ' || coalesce(v_edge, v_jwt),
                'x-service-key', coalesce(v_edge, v_jwt)
            ),
            p_body    := jsonb_build_object('instance_id', v_reg.id)
        );
        v_enviados := v_enviados + 1;
    end loop;

    -- ── 2. quem ja passou do ponto ───────────────────────────────────────────
    -- Renovar e impossivel; o que da para fazer e parar de mentir na tela.
    for v_reg in
        select i.id, i.account_name, i.status, i.token_expires_at, i.user_id
          from public.instagram_instances i
         where i.token_expires_at is not null
           and i.token_expires_at < now()
    loop
        v_expirados := v_expirados + 1;

        if v_reg.status is distinct from 'expired' then
            v_mentindo := v_mentindo + 1;
            update public.instagram_instances
               set status = 'expired', updated_at = now()
             where id = v_reg.id;
        end if;

        begin
            -- Um registro POR CONTA: `route` e a conta e a mensagem carrega o
            -- @, entao o fingerprint (source+component+route+mensagem) e unico
            -- por conta e a passada seguinte cai no mesmo incidente, somando
            -- evento em vez de abrir linha nova.
            v_res := public.incident_record(jsonb_build_object(
                'origem', 'cron',
                'source', 'db_job',
                'component', 'instagram:token-vencido',
                'route', v_reg.account_name,
                'owner_id', v_reg.user_id,
                'error_message', 'Token do Instagram da conta @' || coalesce(v_reg.account_name, '(sem nome)')
                              || ' venceu e nao pode mais ser renovado. So reconectando por OAuth.',
                'error_description', 'Venceu em ' || to_char(v_reg.token_expires_at at time zone 'America/Sao_Paulo',
                                                             'DD/MM/YYYY HH24:MI') || ' (horario de Brasilia). '
                                  || 'A API do Instagram so renova token que ainda vale. '
                                  || 'O cliente ve o aviso vermelho na propria tela e reconecta por la.',
                'context', jsonb_build_object('instance_id', v_reg.id,
                                              'status_antes', v_reg.status,
                                              'expirou_em', v_reg.token_expires_at)
            ));
        exception when others then
            raise warning '[ig-refresh] incidente da conta %: %', v_reg.account_name, sqlerrm;
        end;
    end loop;

    select count(*) into v_saudaveis
      from public.instagram_instances i
     where i.token_expires_at is not null
       and i.token_expires_at >= now() + interval '15 days';

    return jsonb_build_object(
        'enviados_para_renovar', v_enviados,
        'ja_vencidos', v_expirados,
        'estavam_mentindo_connected', v_mentindo,
        'fora_da_janela_ok', v_saudaveis,
        'quando', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
    );
end;
$$;

comment on function public.instagram_refresh_tokens_run() is
  'Renova token do Instagram que vence em ate 15 dias e registra (so no painel, com dono) o que ja venceu. Quem avisa o cliente e o banner da tela dele.';

revoke all on function public.instagram_refresh_tokens_run() from public, anon, authenticated;
grant execute on function public.instagram_refresh_tokens_run() to service_role;
