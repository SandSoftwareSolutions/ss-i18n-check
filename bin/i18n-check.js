#!/usr/bin/env node
import { checkDirectory } from "../src/index.js";

const USAGE = `Usage: i18n-check <folder> [--base nl] [--json] [--allow-extra]

Compares the <locale>.json files in a folder with the base locale (default: nl).
Reports missing keys, extra keys, different placeholders, empty texts and type differences.
Exit status: 0 = fine, 1 = problems found, 2 = error.`;

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help") || args.length === 0) {
  console.log(USAGE);
  process.exit(args.length === 0 ? 2 : 0);
}
let base = "nl";
let json = false;
let allowExtra = false;
const folders = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--base") base = args[++i] ?? "";
  else if (args[i] === "--json") json = true;
  else if (args[i] === "--allow-extra") allowExtra = true;
  else if (args[i].startsWith("-")) {
    console.error(`i18n-check: unknown option ${args[i]}\n\n${USAGE}`);
    process.exit(2);
  } else folders.push(args[i]);
}
if (folders.length !== 1 || !base) {
  console.error(USAGE);
  process.exit(2);
}
try {
  const { locales, problems: all } = checkDirectory(folders[0], base);
  const problems = allowExtra ? all.filter((p) => p.kind !== "extra") : all;
  if (json) console.log(JSON.stringify({ base, locales, problems }, null, 2));
  else if (problems.length === 0) console.log(`OK: ${locales.length} locales (${locales.join(", ")}) match ${base}`);
  else {
    for (const p of problems) console.log(`${p.locale}: ${p.kind.padEnd(12)} ${p.key}${p.detail ? `  (${p.detail})` : ""}`);
    console.log(`\n${problems.length} problem${problems.length === 1 ? "" : "s"} against ${base}`);
  }
  process.exit(problems.length === 0 ? 0 : 1);
} catch (error) {
  console.error(`i18n-check: ${error.message}`);
  process.exit(2);
}
