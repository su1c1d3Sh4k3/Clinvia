# Instalar a sentinela na VPS `manager01`

Destino: **Hetzner `manager01`, 178.156.178.7**, via **systemd**, **fora do
Swarm**. Nada de container: a sentinela precisa sobreviver ao orquestrador, que
é uma das coisas que ela vigia.

Os comandos abaixo são para colar. Os **segredos são digitados por você, direto
na VPS** — nenhum deles passa por este repositório, por um commit ou por mim.

---

## 0. Antes de começar: o que você precisa em mãos

| Segredo | De onde vem |
|---|---|
| `SENTINELA_SENHA` | passo 1 (script local) |
| `SENTINELA_META_PHONE_ID` | Meta → WhatsApp Manager → número de alerta → `phone_number_id` |
| `SENTINELA_META_TOKEN` | passo 2 (system user novo) |
| `SENTINELA_HEARTBEAT_KEY` | você gera no passo 3, e cola nos **dois** lados |
| `SENTINELA_ANON_KEY` | a mesma chave pública que já está no bundle do front |

---

## 1. Rotacionar a senha da conta interna (no SEU PC)

```powershell
cd "$env:USERPROFILE\OneDrive\Área de Trabalho\PROJETOS\MESSAGER\Clinvia\monitoring\sentinela_login"
python rotacionar_senha.py
```

Ele lê `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` do `.env` da raiz, sorteia
uma senha de 32 caracteres, aplica, **prova com um login e um logout de
verdade** e imprime a senha uma vez. Guarde a janela aberta até o passo 4.

A chave de serviço fica no seu PC. Ela **não** vai para a VPS.

---

## 2. Token da Meta — permissões exatas

Crie um **system user novo**, só para isto. Não reaproveite o token que a
plataforma usa: o dela manda mensagem de paciente, e um token na caixa externa
tem que valer o menos possível.

**Business Manager → Configurações do negócio → Usuários → Usuários do sistema
→ Adicionar**

* Nome: `sentinela-login`
* Função: **Funcionário** (não *Administrador*)

**Atribuir ativos → Contas do WhatsApp → WABA `497613820103663`**

* Permissão: **Enviar mensagens** (`MESSAGING`)
* **NÃO** marcar *Controle total* / *Gerenciar conta do WhatsApp*

**Gerar novo token**

* App: o mesmo app do WhatsApp Cloud API
* Expiração: **Nunca**
* Escopos — marcar **um só**:

| Escopo | Marcar? | Por quê |
|---|---|---|
| `whatsapp_business_messaging` | **sim** | é o único que o envio precisa |
| `whatsapp_business_management` | não | lê e edita templates; enviar não precisa |
| `business_management` | não | enumera o negócio inteiro |
| `pages_*`, `ads_*`, qualquer outro | não | — |

No pior caso esse token manda mensagem pelo número de alerta. É o teto do
estrago, e é de propósito.

---

## 3. Gerar a chave do heartbeat e colar nos dois lados

O **mesmo** valor precisa existir na VPS e no secret da edge function. Se
divergirem, a função responde 401, nenhum sinal de vida é gravado e a
plataforma passa a acusar queda da VPS **com a VPS de pé**.

Gere (no seu PC):

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Cole no Supabase:

```powershell
npx supabase@2.117.0 secrets set SENTINELA_HEARTBEAT_KEY="<o valor gerado>" --project-ref swfshqvvbohnahdyndch
```

Guarde o valor para o passo 4.

---

## 4. Copiar os arquivos e escrever os segredos na VPS

Do seu PC:

```powershell
cd "$env:USERPROFILE\OneDrive\Área de Trabalho\PROJETOS\MESSAGER\Clinvia\monitoring"
scp -r sentinela_login root@178.156.178.7:/tmp/
ssh root@178.156.178.7
```

Já dentro da VPS — `cat > ... <<'EOF'` **não** guarda nada no histórico do
shell, e os valores são digitados aqui, uma vez:

```sh
umask 077
cat > /etc/sentinela-login.env <<'EOF'
SENTINELA_SUPABASE_URL=https://swfshqvvbohnahdyndch.supabase.co
SENTINELA_ANON_KEY=COLE_A_CHAVE_ANON
SENTINELA_APP_ORIGIN=https://app.clinbia.ai

SENTINELA_META_PHONE_ID=COLE_O_PHONE_NUMBER_ID
SENTINELA_META_TOKEN=COLE_O_TOKEN_DO_SYSTEM_USER
SENTINELA_WHATSAPP_PARA=COLE_O_NUMERO

SENTINELA_HEARTBEAT_KEY=COLE_A_CHAVE_DO_PASSO_3

SENTINELA_EMAIL=sentinela.login@clinvia.com.br
SENTINELA_SENHA=COLE_A_SENHA_DO_PASSO_1

SENTINELA_ESTADO=/var/lib/sentinela/estado.json
EOF
chown root:root /etc/sentinela-login.env
chmod 600 /etc/sentinela-login.env
```

Instalar:

```sh
bash /tmp/sentinela_login/instalar.sh
rm -rf /tmp/sentinela_login
```

O instalador roda `teste_logica.py` **antes** de instalar e aborta se a lógica
de decisão tiver regredido.

---

## 5. Conferir sem incomodar ninguém

```sh
# só mede, não avisa e não manda heartbeat
cd /opt/sentinela-login && sudo -u sentinela env $(grep -v '^#' /etc/sentinela-login.env | xargs) python3 probe.py

systemctl list-timers sentinela-login.timer
journalctl -u sentinela-login.service -n 30 --no-pager
```

Esperado: `ok  <hora>  todas as 7 passaram`.

O heartbeat chegando se confirma no banco, sem tocar em nada:

```sql
select recebido_em, ok, falhas, login_medido
  from public.sentinela_heartbeats
 order by recebido_em desc limit 5;
```

Se em 10 minutos não houver nenhuma linha, a plataforma abre
`sentinela:parou-de-reportar` sozinha — o que, nesse momento, é o comportamento
certo.

---

## 6. Teste de envio para o seu WhatsApp — **pare e me avise antes**

Este é o único passo que toca o seu telefone. Ele manda um alerta de verdade,
no template de verdade, com `🔴 CRITICO` no topo.

**Não rode sem combinar comigo primeiro.** Um vermelho que depois se revela
simulado ensina que vermelho pode ser ignorado, e aí o canal inteiro deixa de
valer no dia em que importa.

Quando for a hora, na VPS:

```sh
cd /opt/sentinela-login
set -a; . /etc/sentinela-login.env; set +a
python3 -c "
import aviso, sentinela
print(aviso.enviar_whatsapp(aviso.config(), sentinela.alerta_queda(
    [{'verificacao':'preflight','detalhe':'TESTE DE INSTALACAO — ignore'}], 1)))
"
```

`True` = a Meta aceitou. Aceitar não é entregar: confirme no aparelho.

Se sair `False`, o motivo está no `stderr` logo acima, no formato
`graph erro <codigo>`. Os três que importam:

| Código | O que é |
|---|---|
| `131026` | o número de destino não pode receber |
| `132001` / `132015` / `132016` | template indisponível — a escada v4→v3→v2 já tentou os três |
| `190` | token inválido ou revogado |

---

## Rotinas depois de instalada

```sh
systemctl restart sentinela-login.timer      # depois de trocar um segredo
journalctl -u sentinela-login.service -f     # acompanhar
python3 /opt/sentinela-login/teste_logica.py # provar a decisão, offline
```

Para trocar a senha de novo, é o passo 1 seguido de editar só aquela linha do
`/etc/sentinela-login.env` e reiniciar o timer.
