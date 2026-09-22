// Formata a saida JSON do `supabase db query` em texto legivel, agrupando pela
// primeira coluna informada em argv[2] (opcional).
let s = "";
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  const j = JSON.parse(s.slice(s.indexOf("{")));
  const groupBy = process.argv[2];
  const rows = j.rows || [];
  if (!groupBy) {
    for (const r of rows) console.log(Object.values(r).join(" | "));
    return;
  }
  const g = {};
  for (const r of rows) (g[r[groupBy]] = g[r[groupBy]] || []).push(r);
  for (const k of Object.keys(g).sort()) {
    console.log(`===== ${k}  [${g[k].length}]`);
    for (const r of g[k]) {
      const { [groupBy]: _drop, ...rest } = r;
      console.log("  " + Object.entries(rest).map(([k2, v]) => `${k2}=${v}`).join("  "));
    }
    console.log("");
  }
});
