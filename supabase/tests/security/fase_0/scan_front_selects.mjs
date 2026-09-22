// GARANTIA 5: acha todo `.from("<tabela>")` do front e a lista de colunas do
// `.select()` seguinte. `select("*")` em tabela com coluna revogada = "permission
// denied for table" — foi exatamente o caso do ChatArea no item 1.
import fs from "node:fs";
import path from "node:path";

const targets = ["instances", "instagram_instances", "professional_google_calendars", "profiles", "team_members"];
const hits = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!/\.(ts|tsx)$/.test(e.name)) continue;
    const s = fs.readFileSync(p, "utf8");
    for (const t of targets) {
      const re = new RegExp("\\.from\\(\\s*[\"'`]" + t + "[\"'`]", "g");
      let m;
      while ((m = re.exec(s)) !== null) {
        const ln = s.slice(0, m.index).split(/\r?\n/).length;
        const tail = s.slice(m.index, m.index + 300).replace(/\s+/g, " ");
        const sel = /\.select\(\s*(["'`])([\s\S]*?)\1/.exec(tail);
        const what = sel ? sel[2] : "(sem .select — insert/update/delete)";
        hits.push({ star: what.trim().startsWith("*"), t, at: path.relative("src", p) + ":" + ln, sel: what.slice(0, 110) });
      }
    }
  }
}

walk("src");
hits.sort((a, b) => (b.star - a.star) || a.t.localeCompare(b.t) || a.at.localeCompare(b.at));
for (const h of hits) console.log((h.star ? "[STAR] " : "[ok]   ") + h.t.padEnd(30) + h.at.padEnd(52) + "select=" + h.sel);
console.log("\ntotal=" + hits.length + "  com select(*)=" + hits.filter((h) => h.star).length);
