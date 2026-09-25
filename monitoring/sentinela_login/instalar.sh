#!/usr/bin/env bash
# Instala a sentinela de login numa caixa Linux com systemd.
#
# Rode na VPS manager01 (178.156.178.7), FORA do Swarm, e nunca na maquina que
# serve a producao: uma sentinela que mora dentro do que ela vigia fica muda
# exatamente quando deveria falar.
#
#   sudo ./instalar.sh
#
# Pre-requisito: /etc/sentinela-login.env preenchido (modelo em env.exemplo).
set -euo pipefail

DESTINO=/opt/sentinela-login
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $EUID -ne 0 ]]; then
    echo "rode com sudo" >&2
    exit 1
fi

if [[ ! -f /etc/sentinela-login.env ]]; then
    echo "falta /etc/sentinela-login.env — copie de $AQUI/env.exemplo e preencha" >&2
    exit 1
fi

id -u sentinela &>/dev/null || useradd --system --no-create-home --shell /usr/sbin/nologin sentinela

# A logica de decisao (quando avisar) e a unica peca que ninguem ve
# funcionando. Provar antes de instalar custa um segundo; descobrir no dia do
# incidente custa o incidente.
echo "conferindo a logica de decisao..."
python3 "$AQUI/teste_logica.py"

install -d -m 755 "$DESTINO"
# Os QUATRO modulos. Esquecer um deles nao da erro aqui — da ImportError na
# primeira passada do timer, com o servico ja instalado e "ativo".
install -m 644 "$AQUI/probe.py" "$AQUI/aviso.py" "$AQUI/sentinela.py" \
    "$AQUI/teste_logica.py" "$DESTINO/"

# O token da Meta e a chave do heartbeat moram aqui: so o root le, o servico
# recebe por EnvironmentFile.
chown root:root /etc/sentinela-login.env
chmod 600 /etc/sentinela-login.env

install -m 644 "$AQUI/systemd/sentinela-login.service" /etc/systemd/system/
install -m 644 "$AQUI/systemd/sentinela-login.timer" /etc/systemd/system/

systemctl daemon-reload
systemctl enable --now sentinela-login.timer

echo
echo "instalado. uma passada agora, para conferir:"
systemctl start sentinela-login.service || true
journalctl -u sentinela-login.service -n 20 --no-pager
echo
echo "acompanhar:  journalctl -u sentinela-login.service -f"
echo "proxima:     systemctl list-timers sentinela-login.timer"
