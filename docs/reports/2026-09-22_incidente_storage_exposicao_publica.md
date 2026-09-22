# Incidente de segurança — exposição de arquivos no Storage (Fase 6)

**Data do registro:** 22/09/2026
**Origem:** item #4 de `docs/reports/2026-09-22_auditoria_rls_completa.md` (RLS de `storage.objects`)
**Correção:** migration `20260922200000_storage_objects_tenant_scope.sql` (commit `a8c9b0b`), **aplicada em produção em 22/09/2026 ~15:45 UTC**
**Rollback disponível:** `20260922200000_storage_objects_tenant_scope_rollback.sql`

---

## 1. O que estava exposto

As 56 policies de `storage.objects` acumuladas desde o início do projeto incluíam
**45 sem qualquer recorte de tenant**. Efeitos comprovados (medição, não hipótese):

1. **Qualquer visitante não autenticado (`anon`) conseguia LISTAR os objetos dos
   buckets** — nome completo do arquivo, tamanho e data — incluindo
   `client-documents` (documentos de paciente), `media` (mídias trocadas nas
   conversas: fotos, áudios, PDFs, exames), `avatars` / `contact-avatars` /
   `contact-photos` (fotos de perfil de pacientes), `patients-docs`,
   `deal-attachments` e `chat_media`.
   Com o nome em mãos, **cada arquivo era baixável pela URL pública** — os 16
   buckets do projeto são `public = true`, e `GET /storage/v1/object/public/...`
   não avalia RLS. Ou seja: listar = obter a chave de download de todo o acervo.

2. **Um tenant autenticado conseguia LISTAR, SOBRESCREVER e CRIAR arquivos nas
   pastas de outro tenant.** Medido no arnês: o tenant B via 100% da amostra de
   arquivos do tenant A, deu `UPDATE` na mídia de uma conversa de A (1 linha
   afetada) e conseguiu **inserir** arquivos dentro de `media/<conversationId de A>/`,
   `client-documents/<ownerId de A>/`, `contact-avatars/<ownerId de A>/`,
   `product-images/<uid de A>/`, `professional-avatars/<ownerId de A>/` e
   `quick-messages/<uid de A>-*`.

3. **`anon` também conseguia ESCREVER** em `contact-avatars` e `contact-photos`
   (policies `Service upload contact-avatars` e `contact_photos_insert` estavam
   com `roles = public`, na intenção de liberar o service_role — que nunca
   precisou de policy, pois tem `rolbypassrls`).

4. Subcaso encontrado apenas pelo arnês: 12 policies do tipo
   `bucket_id = 'x' AND auth.uid() = owner` **protegem a linha, não o nome**.
   Elas permitiam que o tenant B criasse `avatars/contact_<contatoDeA>.jpg`,
   `product-images/...`, `professional-avatars/...` e `quick-messages/...`
   com caminho pertencente a A. Além do vazamento, isso é um vetor de
   **negação de serviço silenciosa**: o upload de A passa a ser `upsert` sobre
   uma linha cujo `owner` é B e falha para sempre.

### Categorias de dado pessoal envolvidas

Documentos e exames de paciente, fotos de paciente, conteúdo integral das
conversas em anexo (áudio/imagem/documento), telefone do paciente (aparece no
**nome da pasta**: `media/meta-pending-<fone>/...`), nome e foto de
colaboradores. Enquadra-se como incidente de segurança com dados pessoais e
dados de saúde (LGPD art. 48) — daí este registro.

---

## 2. Evidência medida (arnês antes/depois)

Arnês em transação com `rollback` (nada gravado), personas A = tenant grande
real, B = tenant de desenvolvimento; amostra de 215 objetos.

| Cenário | ANTES | DEPOIS (aplicado) |
|---|---|---|
| `anon` lista objetos | **177 / 215** | **0 / 215** |
| A vê arquivos de B | 20 / 20 | 0 / 20 |
| B vê arquivos de A | 40 / 40 | 0 / 40 |
| B dá `UPDATE` na mídia de A | **1 linha** | 0 linhas |
| B dá `DELETE` no avatar de contato de A | permitido | 0 linhas |
| `INSERT` cross-tenant (7 caminhos) | **PASSOU** | `42501` em todos |
| `INSERT` de `anon` (contact-avatars, contact-photos) | **PASSOU** | `42501` |
| Uploads legítimos do próprio tenant (13 telas) | PASSOU | PASSOU |
| URLs públicas já persistidas (3 amostras) | 200 / 71179b, 14520b, 9892b | **200 / bytes idênticos** |

---

## 3. Janela de exposição

As policies abertas nasceram **junto com cada bucket** — não houve regressão
posterior: o modelo permissivo é o original. Datas das migrations que as criaram:

| Data | Migration | Policies abertas criadas |
|---|---|---|
| 28/11/2025 | `20251128120000_add_company_to_profiles.sql` | `Public access to avatars`, `Authenticated users can upload avatar` (+ update/delete own) |
| 01/12/2025 | `20251201170000_fix_storage_rls.sql` | `Allow public viewing` (media), `Allow authenticated viewing` (media) |
| 02/12/2025 | `20251202104500_create_avatars_bucket.sql` | `Public Access` (avatars) |
| 05/12/2025 | `20251205140000_create_quick_messages.sql` | `Quick Messages Media Public Access`, `Public Access`, upload/update/delete de quick-messages |
| 05/12/2025 | `20251205180000_create_products_services.sql` | `Anyone can view product images` (+ upload/update/delete) |
| 05/12/2025 | `20251205190000_create_scheduling_tables.sql` | `Anyone can view professional avatars` (+ upload/update/delete) |
| 23/02/2026 | `20260223_fix_storage_media_rls_isolation.sql` | `Authenticated update own media`, `Authenticated delete own media` — o nome diz "own", mas **não havia cláusula de dono**: qualquer autenticado alterava/apagava qualquer mídia |

Seis policies **não têm migration**: foram criadas direto no painel do Supabase
(`Public read client docs`, `Public read contact-avatars`,
`contact_photos_public_read`, `Allow view patient docs`,
`Auth users upload client docs`, `Service upload contact-avatars`). Para essas,
a data do bucket / do primeiro objeto é a melhor estimativa disponível:

| Bucket | Criado | Objetos | 1º objeto | Último |
|---|---|---|---|---|
| `avatars` | 28/11/2025 | 22.692 | 28/11/2025 | 22/09/2026 |
| `media` | 28/11/2025 | 72.776 | 01/12/2025 | 22/09/2026 |
| `quick-messages` | 05/12/2025 | 3 | 05/12/2025 | 22/04/2026 |
| `product-images` | 05/12/2025 | 5 | 05/12/2025 | 31/12/2025 |
| `professional-avatars` | 05/12/2025 | 12 | 05/12/2025 | 16/04/2026 |
| `manuals` | 19/01/2026 | 22 | 19/01/2026 | 25/03/2026 |
| `patients-docs` | 22/01/2026 | 3 | 23/01/2026 | 23/03/2026 |
| `patients-photos` | 22/01/2026 | 1 | 23/01/2026 | 23/01/2026 |
| `Bia` | 29/01/2026 | 7 | 29/01/2026 | 11/02/2026 |
| `chat_media` | 21/02/2026 | 11 | 21/02/2026 | 07/04/2026 |
| `deal-attachments` | 10/03/2026 | 7 | 10/03/2026 | 12/03/2026 |
| `contact-photos` | 17/03/2026 | 42 | 17/03/2026 | 17/03/2026 |
| `contact-avatars` | 17/03/2026 | 1.761 | 17/03/2026 | 22/09/2026 |
| `client-documents` | 08/06/2026 | 4 | 13/07/2026 | 23/07/2026 |
| `login-design` | 04/09/2026 | 2 | 04/09/2026 | 05/09/2026 |
| `company-branding` | 10/09/2026 | 0 | — | — |

**Janela estimada:** de **28/11/2025** (primeiro bucket) a **22/09/2026 15:45 UTC**
(aplicação da correção) — ≈ 10 meses. Para `client-documents` (documentos de
paciente) a janela efetiva começa em **08/06/2026**; para `patients-docs`, em
**22/01/2026**.

**Não há evidência de exploração.** Os logs do Storage não guardam listagens
`anon` com retenção suficiente para cobrir a janela, então o que se pode
afirmar é a *possibilidade* comprovada, não a ocorrência. Esse limite de
retenção é justamente o que a Fase 5 do plano trata.

---

## 4. Correção aplicada

- 45 policies abertas removidas; 4 policies com recorte de tenant criadas
  (`clinvia_objects_select/insert/update/delete_scoped`), todas delegando a
  `public.clinvia_storage_is_mine(bucket, name, owner, allow_owner)`, que
  deriva o tenant **do caminho do arquivo** e valida contra `get_owner_id()`
  (conversa, contato, grupo, negociação, chat interno, paciente, colaborador).
- No `INSERT`/`WITH CHECK` o atalho `owner = auth.uid()` é **desligado**
  (`p_allow_owner = false`): senão qualquer caminho passaria, já que o
  storage-api grava `owner` = quem faz o upload.
- Casts `::uuid` protegidos por regex (`clinvia_uuid_or_null`) — caminho é
  entrada não confiável.
- `service_role` e `postgres` têm `rolbypassrls`: **nenhuma edge function,
  cron, webhook ou chamada do n8n é afetada** pela mudança.
- URLs públicas já persistidas em banco (`messages.media_url`,
  `contacts.profile_pic_url`, `client_documents.file_url`, etc.) **continuam
  funcionando** — confirmado com `curl` antes e depois, mesmos bytes.

## 5. Risco residual (ainda aberto)

1. **Os 16 buckets seguem `public = true`.** Quem já tem uma URL (ou adivinha um
   UUID) continua baixando sem autenticação. A correção fecha a *enumeração* e a
   *escrita*, não o download direto. Fechar isso é o **plano (b)** (buckets
   privados + URL assinada), que exige migrar 72.776 objetos e as colunas que
   guardam URL — está planejado, não executado.
2. **1.512 objetos de `media` sem tenant no caminho**
   (`media/meta-pending-<fone>/...` = 1.367, raiz do bucket = 137, outros = 8).
   Ficam invisíveis para as policies novas (nenhum autenticado os lista) e só
   são alcançáveis por URL pública / service_role. **Não foram tocados.** O
   plano (b) tem de tratá-los explicitamente, inclusive o fato de que
   **o telefone do paciente no nome da pasta é dado pessoal exposto via URL** —
   renomear/normalizar o caminho faz parte da migração.

## 6. Providências

- [x] Correção de RLS aplicada e verificada em produção (22/09/2026).
- [x] Monitoramento de `42501` / violação de RLS pós-aplicação
      (`supabase/.temp/_mon_storage.sh`).
- [x] Regressão corrigida na mesma passagem: `ConversationChatModal.uploadFile`
      (anexo pelo modal de conversa das telas de Filas, Campanhas, Monitoramento,
      Satisfação e Dashboard/Agendamentos) subia o arquivo na **raiz** do bucket
      `media`, sem o `conversationId` no caminho — com as policies novas o upload
      seria barrado. Passou a usar `media/<conversationId>/...`, igual ao inbox.
- [ ] Teste manual das 13 telas de upload pelo responsável (passam a depender só
      das policies novas).
- [ ] Plano (b): buckets privados + URL assinada + tratamento dos 1.512 objetos
      e do telefone no caminho.
- [ ] Fase 5: retenção de log suficiente para investigar janelas futuras.
