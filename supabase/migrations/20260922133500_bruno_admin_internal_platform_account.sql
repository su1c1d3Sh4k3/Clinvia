-- Etapa "projeto e chave OpenAI por conta", decisao do user em 22/09/2026.
--
-- A conta interna `Bruno Admin` (3e21175c) era a UNICA com `openai_token` proprio no banco.
-- Decisao: ela NAO fica como chave do cliente. O token proprio sai, a conta passa a ser
-- provisionada pela plataforma e o markup dela vai a ZERO, porque o user quer ver o custo real
-- da conta interna no painel, sem margem.
--
-- Ordem importa: rodando ANTES da 20260922134000, o backfill de `key_source = 'customer'`
-- passa a pegar 0 linhas — que e exatamente o estado final desejado (a conta nasce sem
-- key_source e sera marcada 'platform' pelo provisionamento).
--
-- IRREVERSIVEL na parte do segredo: o valor de `openai_token` e um blob `enc:` e este arquivo
-- NAO o copia para lugar nenhum (nao se versiona segredo). Para desfazer, o token proprio tem
-- de ser colado de novo no campo "Token OpenAI Customizado" do Super Admin. O rollback ao lado
-- desfaz apenas o markup.

update public.profiles
set openai_token = null,
    openai_token_invalid = false,
    openai_key_source = null,
    markup = 0,
    updated_at = now()
where id = '3e21175c-b183-4041-b375-eacb292e8d41';
