-- Rollback da 20260922133500.
--
-- LIMITE CONHECIDO: o `openai_token` proprio da conta interna NAO volta por aqui — o valor era
-- um blob `enc:` e nao foi copiado para nenhum arquivo (nao se versiona segredo). Para ter a
-- chave propria de volta, colar o token de novo no campo "Token OpenAI Customizado" do Super
-- Admin; ao salvar manualmente, a conta ja passa a `openai_key_source = 'customer'`.
--
-- O que este arquivo desfaz: o markup zerado, devolvendo a conta ao default da plataforma.
-- Se a conta ja tiver sido provisionada, o projeto/chave/limite na OpenAI continuam de pe —
-- arquivar projeto e outra operacao, com confirmacao.

update public.profiles
set markup = null,
    updated_at = now()
where id = '3e21175c-b183-4041-b375-eacb292e8d41';
