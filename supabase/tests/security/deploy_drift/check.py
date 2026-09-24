"""Detector de descompasso entre o repositorio e a implantacao das edge functions.

Motivo: apagar o diretorio em supabase/functions/<slug> NAO remove a funcao do
projeto. Ela continua ACTIVE, publicamente alcancavel e rodando o ultimo bundle
publicado -- codigo que ninguem mais consegue ler pelo git. Foi assim que 19
funcoes ficaram no ar sem fonte no repositorio.

Uso:
    python supabase/tests/security/deploy_drift/check.py

Le SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF do ambiente e, se nao achar, do
.env da raiz (que nao vai para o git -- e por isso que o CI usa o ambiente).
Sai com codigo 1 se houver qualquer funcao implantada sem fonte no repositorio.
"""

import json
import os
import pathlib
import re
import sys
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parents[4]
ENV = RAIZ / ".env"
FUNCS = RAIZ / "supabase" / "functions"


def do_env(chave: str) -> str:
    do_ambiente = os.environ.get(chave, "").strip()
    if do_ambiente:
        return do_ambiente
    if not ENV.exists():
        sys.exit(
            f"{chave} nao esta no ambiente e nao existe {ENV}.\n"
            "No CI, cadastre o segredo no repositorio; na maquina, use o .env da raiz."
        )
    texto = ENV.read_text(encoding="utf-8", errors="replace")
    m = re.search(rf"^{chave}=(.*)$", texto, re.M)
    if not m:
        sys.exit(f"{chave} nao encontrada no ambiente nem em {ENV}")
    return m.group(1).strip().strip('"')


def main() -> int:
    tok = do_env("SUPABASE_ACCESS_TOKEN")
    ref = do_env("SUPABASE_PROJECT_REF")

    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/functions",
        headers={"Authorization": f"Bearer {tok}"},
    )
    implantadas = json.load(urllib.request.urlopen(req))

    no_repo = {p.name for p in FUNCS.iterdir() if p.is_dir() and p.name != "_shared"}
    no_ar = {f["slug"]: f for f in implantadas}

    orfas = sorted(set(no_ar) - no_repo)
    nao_publicadas = sorted(no_repo - set(no_ar))

    print(f"implantadas: {len(no_ar)}   com fonte no repo: {len(no_repo)}")

    if orfas:
        print(f"\nIMPLANTADAS SEM FONTE NO REPO ({len(orfas)}) "
              "-- rodando codigo que ninguem consegue ler:")
        for slug in orfas:
            f = no_ar[slug]
            jwt = f.get("verify_jwt")
            aviso = "  <-- ALCANCAVEL SEM JWT" if jwt is False else ""
            print(f"  {slug:34} v{f['version']:<4} status={f['status']:8} verify_jwt={jwt}{aviso}")
        print("\n  Para remover de verdade, os DOIS lados:")
        print("    git rm -r supabase/functions/<slug>")
        print(f"    npx supabase functions delete <slug> --project-ref {ref}")

    if nao_publicadas:
        print(f"\nNO REPO E NUNCA PUBLICADAS ({len(nao_publicadas)}):")
        for slug in nao_publicadas:
            print(f"  {slug}")

    if not orfas and not nao_publicadas:
        print("\nsem descompasso.")

    return 1 if orfas else 0


if __name__ == "__main__":
    sys.exit(main())
