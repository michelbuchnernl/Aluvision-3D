// Fails when a playbook rule claims tested/verified status without existing evidence files.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { lintPlaybook } from "../server/knowledge.ts";
const issues = lintPlaybook(
  readFileSync("knowledge/PLAYBOOK.md", "utf8"),
  (p) => existsSync(resolve(p)),
);
for (const i of issues)
  console.error(`PLAYBOOK.md:${i.line} ${i.message} — ${i.rule.slice(0, 80)}`);
if (issues.length) process.exit(1);
console.log(
  "✔ PLAYBOOK.md: alle bewijsclaims verwijzen naar bestaande bestanden",
);
