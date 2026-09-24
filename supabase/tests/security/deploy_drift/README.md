# deploy_drift

Apagar `supabase/functions/<slug>/` **não remove a função do projeto**. Ela continua ACTIVE,
publicamente alcançável e servindo o último bundle publicado — código que ninguém mais consegue ler
pelo git. Renomear o diretório para `<slug>.disabled/` também não faz nada. Foi assim que 19 funções
ficaram no ar sem fonte no repositório.

## check.py

```sh
python supabase/tests/security/deploy_drift/check.py
```

Leitura pura. Lê `SUPABASE_ACCESS_TOKEN` e `SUPABASE_PROJECT_REF` do `.env` da raiz, compara a lista
de funções implantadas com os diretórios de `supabase/functions/` e **sai com código 1** se houver
qualquer função implantada sem fonte no repo. Também lista o que está no repo e nunca foi publicado.

## Ritual dos dois lados

"Removido" só pode ser afirmado depois dos dois:

```sh
git rm -r supabase/functions/<slug>
npx supabase functions delete <slug> --project-ref <ref>
python supabase/tests/security/deploy_drift/check.py   # comprovação
```

Nunca deixar a deleção como comentário em migration.

## fontes_recuperadas/

TypeScript original das 19 órfãs, extraído do bundle publicado
(`GET /v1/projects/{ref}/functions/<slug>/body`, formato ESZIP2.3). **Não é código ativo do
produto** — está aqui como evidência e como única cópia legível do que roda nessas URLs.

Preservado verbatim, o que inclui um segredo:
`fontes_recuperadas/storage-uploader/index.ts` compara `x-upload-secret` com a string literal
`"clinvia-upload-2026"`. Ele já está exposto no bundle público dessa função — o valor dele é zero e
a função está no balde de aposentar. Não reutilizar em lugar nenhum.

Relatório: `docs/diagnostics/2026-09-24_funcoes_implantadas_sem_fonte.md`.
