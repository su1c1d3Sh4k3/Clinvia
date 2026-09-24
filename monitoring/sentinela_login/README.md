# Sentinela de login

Verificador externo do caminho de login. Roda de fora, de minuto em minuto.

## O buraco que ela fecha

Em 24/09/2026 o login caiu para todo mundo por uma falha de CORS e o
monitoramento não viu nada. Não foi descuido: é estrutural. **Falha de CORS
acontece no navegador.** O navegador recusa a chamada antes de ela sair —
nenhuma edge function é invocada, nenhuma linha é escrita, nenhum código HTTP
≥ 500 existe. O painel fica verde com a aplicação inacessível.

Todo o monitoramento que temos mede **o que chega até o servidor**. Esta
sentinela mede **o que o navegador consegue fazer**. São coberturas diferentes e
não se substituem: as duas podem estar certas discordando uma da outra.

## As sete verificações

| # | Verificação | O que ela pega |
|---|---|---|
| 1 | `front_html` | o `index.html` responde e tem o ponto de montagem do React |
| 2 | `front_bundle` | o JS que o index aponta existe **de verdade** |
| 3 | `preflight` | `OPTIONS` com todos os headers do front, por function |
| 4 | `verify_turnstile` | o captcha responde e **recusa** token falso |
| 5 | `auth_health` | o GoTrue está de pé |
| 6 | `rest_anon` | a leitura anônima que a tela de login faz |
| 7 | `login_real` | grant de senha de verdade, leitura autenticada, logout |

A **3** é a do incidente de 24/09. Ela manda um `OPTIONS` real e confere a
resposta header a header:

```
verify-turnstile: nao permite x-origin
admin-impersonate: nao permite x-origin
frontend-error-ingest: nao permite x-origin
```

`curl` comum **não faz preflight** e por isso não prova nada sobre CORS. Foi
essa a medição que me fez descartar a hipótese certa naquele dia.

A **2** merece nota: num SPA, um bundle que não subiu não devolve 404 — o
servidor devolve o `index.html` de fallback com **200**. Por isso a verificação
olha o `content-type`, não só o código. Deploy que publica index novo apontando
um hash que não foi ao ar é tela branca com o servidor dizendo que está tudo bem.

A **7** só roda com conta sentinela configurada. Sem ela a sonda prova que o
login está *alcançável*, não que ele *funciona*: um grant de senha de verdade
escreve em `auth.sessions` e exercita os gatilhos do schema `auth`, caminho que
tentativa com senha errada nunca toca.

## Cadência: 1 a 6 por minuto, 7 a cada 5

As seis primeiras são leitura pura e não deixam rastro. A sétima **escreve**:
1.440 grants por dia encheriam `auth.sessions` e o log de auditoria, e arriscam
limite de taxa no GoTrue — a sentinela viraria ela mesma um incidente. Por isso
ela roda a cada 5 minutos.

Com uma exceção que importa: **o racionamento vale só para o caminho saudável.**
Grant que falha não cria sessão nenhuma, então assim que o login quebra ele
volta para cadência de 1 minuto. Sem isso, confirmar (3 medições) custaria 15
minutos. Com isso, o pior caso é 5 (cadência) + 3 (confirmação) = 8 minutos, e
o típico ~5.

A contagem de confirmações é **por verificação**, não pela assinatura do
conjunto. É consequência direta do escalonamento: com um contador só, a passada
que pula o login mudaria a assinatura e zeraria o relógio de uma falha que
continua de pé. Verificação que não foi medida numa passada não é incrementada
**nem zerada** — não medir não é prova de nada, nem a favor nem contra.

## Quem vigia a sentinela

Ela roda numa caixa de fora. Se a caixa morrer, ela fica muda — e silêncio é
indistinguível de "tudo bem". É a terceira vez que esse padrão aparece neste
projeto, depois do canal de alertas mudo e do vigia de cron que precisou se
acusar.

A resposta é um **e-mail diário em horário fixo** (`SENTINELA_DIARIO_HORA`). A
ausência dele é o sinal. Ele sai todo dia, inclusive com falha aberta: o diário
prova que a *sentinela* está viva, não que a aplicação está.

## Onde ela mora

Na **VPS de backup**. Uma sentinela hospedada dentro do que ela vigia fica muda
exatamente quando deveria falar. A de backup é outra máquina, outra rede, e não
compartilha destino com a produção nem com o Supabase.

```sh
scp -r monitoring/sentinela_login <vps-backup>:/tmp/
ssh <vps-backup>
sudo cp /tmp/sentinela_login/env.exemplo /etc/sentinela-login.env
sudo nano /etc/sentinela-login.env      # preencher
sudo bash /tmp/sentinela_login/instalar.sh
```

Acompanhar: `journalctl -u sentinela-login.service -f`

## Por onde o aviso sai

**E-mail direto pela Resend**, sem Supabase no caminho. A sentinela existe para
o caso em que a plataforma está inacessível; um aviso que precise da plataforma
morre junto com o que deveria denunciar.

Isso também decide qual credencial a caixa externa carrega: **só a da Resend**.
Uma máquina fora da plataforma é por definição menos protegida que ela — dar a
ela uma chave que lê o banco inteiro trocaria um buraco de observabilidade por
um buraco de segurança. A chave da Resend, no pior caso, manda e-mail.

## Quando ela avisa

O aviso só sai depois de **3 medições seguidas** da **mesma** verificação
quebrada. Menos que isso pega oscilação de rede da própria caixa, e alarme
falso ensina a ignorar alarme.

Isso é supressão na **origem** (não existe incidente ainda), não teto na porta.
Uma vez confirmado, o aviso sai e **sai de novo a cada 30 minutos enquanto
durar, sem limite de quantidade**. Se quebrar **mais** coisa, o aviso novo não
espera o lembrete — o conjunto cresceu, é notícia. Se o conjunto **encolher**,
não sai nada: recuperação parcial repetindo o mesmo alerta só gasta atenção.

Quando tudo volta, ela avisa que voltou e por quanto tempo ficou fora — mas só
se a queda chegou a ser avisada: "voltou" sem "caiu" é ruído puro.

## Manutenção

**Se o front passar a mandar um header novo**, ele precisa entrar em
`HEADERS_DO_FRONT` no `probe.py`. Sem isso a sonda aprova um preflight que o
navegador vai recusar — e o furo volta pelo mesmo lugar.

A sonda cobre 3 functions, não as 130: ela roda a cada minuto e precisa ser
barata. A cobertura completa é do guarda de repositório
`supabase/tests/security/item_cors_x_origin/check.py`, que roda no commit.

## Rodar à mão

```sh
cd monitoring/sentinela_login
export SENTINELA_SUPABASE_URL=... SENTINELA_ANON_KEY=... SENTINELA_APP_ORIGIN=...
python probe.py             # só mede, não avisa
python probe.py --json      # uma linha JSON
python probe.py --sem-login # só as 6 de leitura, não toca em auth
python sentinela.py         # mede, decide e avisa

python teste_logica.py      # prova a decisão sem rede (rodar após instalar)
```

O `teste_logica.py` troca a sonda e o e-mail por dublês e roda uma linha do
tempo de passadas de 1 minuto. A única peça da sentinela que ninguém vê
funcionando é justamente a que decide **quando** avisar; se ela regredir, o
defeito aparece no dia do incidente, que é o pior dia para descobrir que o
vigia estava quebrado.

Só biblioteca padrão, de propósito: o arquivo é autocontido para poder ser
copiado para qualquer executor sem carregar nada da plataforma que ele vigia.
