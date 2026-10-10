// Bundles ../config (prompts, thresholds, glossary, prices) into lib/config.generated.json and stamps a version hash.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cfg = join(here, "..", "..", "config");
if (!existsSync(cfg)) { console.log("config dir not found; keeping committed lib/config.generated.json"); process.exit(0); }
const read = (p) => readFileSync(join(cfg, p), "utf8");
const prompts = {};
for (const f of readdirSync(join(cfg, "prompts")).sort()) prompts[f.replace(/\.md$/, "")] = read(`prompts/${f}`);
let glossary = {};
try { glossary = JSON.parse(read("glossary.json")); } catch { /* seed not generated yet */ }
const bundle = { thresholds: JSON.parse(read("thresholds.json")), prices: JSON.parse(read("prices.json")), glossary, prompts };
const version = createHash("sha256").update(JSON.stringify(bundle)).digest("hex").slice(0, 10);
writeFileSync(join(here, "..", "lib", "config.generated.json"), JSON.stringify({ version, ...bundle }, null, 1));
console.log("config bundled, version", version);
