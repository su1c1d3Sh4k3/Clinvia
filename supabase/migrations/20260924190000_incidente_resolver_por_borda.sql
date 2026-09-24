-- Resolver um incidente quando a condicao que o criou deixa de existir.
--
-- POR QUE ISTO PRECISA EXISTIR
-- ----------------------------
-- A regra dele para instancia desconectada tem tres partes, e a terceira nao
-- tem como ser cumprida sem isto:
--   1. um aviso na desconexao      -> a BORDA (`prevStatus === 'connected'`)
--   2. nada enquanto durar         -> a borda so dispara uma vez, de graca
--   3. novo aviso se cair DE NOVO, DEPOIS de ter voltado  <- aqui
--
-- `incident_record` agrupa por fingerprint com
-- `on conflict (fingerprint) where status <> 'resolved'`. Enquanto o incidente
-- da primeira queda estiver aberto, a segunda queda cai DENTRO dele: vira
-- `event_count + 1` num incidente que ja foi notificado, e o aviso novo fica
-- refem da janela de recorrencia. Resolvido, o mesmo fingerprint pode nascer
-- de novo e a queda nova e um incidente novo — que e o que ele pediu.
--
-- Fora isso, um incidente que fica aberto para sempre e uma mentira no painel:
-- a instancia voltou ha uma semana e a tela continua dizendo que esta fora.

-- POR ROTA, NAO POR FINGERPRINT
-- -----------------------------
-- A tentacao era recalcular o fingerprint (`incident_fingerprint(source,
-- component, locator, message)`) e fechar por igualdade. Nao serve: a MENSAGEM
-- entra no fingerprint, e a mensagem da desconexao carrega o nome da
-- instancia. Renomear a instancia entre a queda e a volta mudaria o hash e o
-- incidente ficaria aberto para sempre.
--
-- A rota e o `id` da instancia, que nao muda. Entao o corte e
-- (component, route), lido do evento — exato, e imune a renomeacao.

begin;

-- Uma versao de 4 argumentos (com `p_message`) chegou a ser aplicada em
-- 24/09 antes de a renomeacao ser considerada. Nunca teve chamador; sai aqui
-- para nao ficar duas sobrecargas ambiguas com o mesmo nome.
drop function if exists public.incident_resolver_edge(text, text, text, text);

create or replace function public.incident_resolver_edge(
    p_component text,
    p_route     text,
    p_nota      text default null
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_n integer;
begin
    if p_component is null or p_route is null then
        return 0;
    end if;

    update public.incidents i
       set status      = 'resolved',
           resolved_at = now(),
           notes       = case
                            when p_nota is null then i.notes
                            when i.notes is null then p_nota
                            else i.notes || chr(10) || p_nota
                         end,
           updated_at  = now()
     where i.component = p_component
       and i.status <> 'resolved'
       and exists (
           select 1
             from public.incident_events e
            where e.incident_id = i.id
              and e.failed_node = p_route
       );

    get diagnostics v_n = row_count;
    return v_n;
end;
$$;

comment on function public.incident_resolver_edge(text, text, text) is
    'Fecha o incidente aberto de um par (component, route, message) de edge '
    'function quando a condicao que o criou acabou. Use apenas em condicao com '
    'BORDA observavel nos dois sentidos (caiu / voltou); para falha pontual, '
    'nao ha o que resolver.';

revoke all on function public.incident_resolver_edge(text, text, text)
    from public, anon, authenticated;
grant execute on function public.incident_resolver_edge(text, text, text)
    to service_role;

commit;
