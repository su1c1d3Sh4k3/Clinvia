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

Quem repara agora é a **plataforma**. Toda passada manda um *heartbeat* para a
edge function `sentinela-heartbeat`; o cron `sentinela-health-watch` varre de 5
em 5 minutos e, passados **10 minutos sem sinal**, abre
`sentinela:parou-de-reportar` — crítica e **fora do painel**, porque quando ele
dispara a sentinela está muda por definição e não existe segunda via.

Antes disso era um e-mail diário cuja *ausência* era o sinal. Foi removido: uma
mensagem de rotina todo dia ensina a ignorar mensagem, e reparar na falta de uma
é a coisa mais fácil de não fazer. Supressão na origem, não na porta.

A ação do alerta carrega as **duas** hipóteses de propósito: pode ser a VPS
fora, ou pode ser a nossa própria função de heartbeat quebrada — nesse segundo
caso o silêncio acusa a VPS com a VPS de pé.

## Onde ela mora

Na VPS **Hetzner `manager01` (178.156.178.7)**, via systemd, **fora do Swarm**.
Uma sentinela hospedada dentro do que ela vigia fica muda exatamente quando
deveria falar; fora do Swarm ela também sobrevive ao orquestrador.

Instalação passo a passo, com os comandos prontos: **`INSTALACAO.md`**.

Acompanhar: `journalctl -u sentinela-login.service -f`

## Por onde o aviso sai

**WhatsApp direto pela API oficial da Meta**, sem Supabase no caminho. A
sentinela existe para o caso em que a plataforma está inacessível; um aviso que
precise dela morre junto com o que deveria denunciar.

Em paralelo, e com propósito diferente, o heartbeat leva a medição crua para o
painel do Super Admin — o painel vê o tropeço de um minuto que o WhatsApp, de
propósito, ainda não viu. Falha confirmada vira também
`sentinela:aplicacao-inacessivel`, crítica e **só-painel**: o WhatsApp já saiu
pela sentinela, e deixar a plataforma avisar de novo poria o mesmo fato duas
vezes no telefone dele.

Sempre **template**, nunca texto livre: fora da janela de 24h a Meta aceita
texto livre com 200 e wamid real, e derruba depois por webhook assíncrono
`131047`. A sentinela não tem como ver esse webhook. A escada é v4 → v3 → v2, e
o degrau só desce nos códigos que significam "template indisponível"
(`132001`/`132015`/`132016`) — qualquer outro é falha de envio de verdade, e
descer esconderia.

Isso também decide o que a caixa externa carrega. Uma máquina fora da
plataforma é por definição menos protegida que ela:

| Credencial | O que abre no pior caso |
|---|---|
| `SENTINELA_META_TOKEN` | manda mensagem pelo número de alerta, e nada mais |
| `SENTINELA_HEARTBEAT_KEY` | uma rota, que só escreve linha de sinal de vida |
| `SENTINELA_ANON_KEY` | a mesma chave pública que já está no bundle do front |
| `SENTINELA_SENHA` | conta interna, admin de um tenant **vazio**, fora de `admin_users` |

Nenhuma lê dado de paciente. Trocar um buraco de observabilidade por um buraco
de segurança seria um mau negócio.

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

O `teste_logica.py` troca a sonda, o WhatsApp e o heartbeat por dublês e roda
uma linha do tempo de passadas de 1 minuto. A única peça da sentinela que ninguém vê
funcionando é justamente a que decide **quando** avisar; se ela regredir, o
defeito aparece no dia do incidente, que é o pior dia para descobrir que o
vigia estava quebrado.

Só biblioteca padrão, de propósito: o arquivo é autocontido para poder ser
copiado para qualquer executor sem carregar nada da plataforma que ele vigia.
