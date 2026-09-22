# Imprime a coluna "info" de uma saida de `supabase db query --linked` (JSON com
# preambulo do CLI e chave "rows").
import json, io, sys

s = io.open(sys.argv[1], encoding='utf-8').read()
s = s[s.index('{'):]
rows = json.loads(s)['rows']
ini = int(sys.argv[2]) if len(sys.argv) > 2 else 0
for r in rows[ini:]:
    print(r['info'])
