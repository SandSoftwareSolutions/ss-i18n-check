import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { checkDirectory, compareLocales, flatten, placeholders } from "./src/index.js";

test("flatten handles nesting, arrays and empty containers", () => {
  assert.deepEqual(flatten({ a: { b: "x", c: ["y", { d: "z" }] }, e: {} }), { "a.b": "x", "a.c.0": "y", "a.c.1.d": "z", e: {} });
});

test("placeholders reads arguments, plural/select branches and rich text tags", () => {
  assert.deepEqual(placeholders("Hallo {name}!"), ["name"]);
  assert.deepEqual(placeholders("{count, plural, one {# taak voor {who}} other {# taken}}"), ["count", "who"]);
  assert.deepEqual(placeholders("{g, select, male {hij} female {zij} other {{name}}}"), ["g", "name"]);
  assert.deepEqual(placeholders("Lees <b>dit</b> en <link>dat</link>"), ["<b>", "<link>"]);
  assert.deepEqual(placeholders("geen"), []);
  assert.deepEqual(placeholders("kapot {name"), []);
});

test("compareLocales finds every kind of problem", () => {
  const problems = compareLocales(
    {
      nl: { a: "Hoi {name}", b: "twee", c: { d: "diep" }, n: 1, leeg: "x" },
      en: { a: "Hi {nme}", c: {}, n: "een", leeg: "", extra: "weg", c2: "x" }
    },
    "nl"
  );
  const by = (kind) => problems.filter((p) => p.kind === kind).map((p) => p.key).sort();
  assert.deepEqual(by("missing"), ["b", "c.d"]);
  assert.deepEqual(by("extra"), ["c2", "extra"]);
  assert.deepEqual(by("placeholders"), ["a"]);
  assert.deepEqual(by("type"), ["n"]);
  assert.deepEqual(by("empty"), ["leeg"]);
});

test("an unknown base locale is an error", () => {
  assert.throws(() => compareLocales({ en: {} }, "nl"), /Base locale "nl" not found/);
});

test("command line: exit status and output", () => {
  const dir = mkdtempSync(join(tmpdir(), "i18n-"));
  try {
    writeFileSync(join(dir, "nl.json"), JSON.stringify({ a: "x {n}", b: "y" }));
    writeFileSync(join(dir, "en.json"), JSON.stringify({ a: "x {n}", b: "y" }));
    const bin = fileURLToPath(new URL("./bin/i18n-check.js", import.meta.url));
    const run = (...a) => spawnSync(process.execPath, [bin, ...a], { encoding: "utf8" });
    assert.equal(run(dir).status, 0);
    writeFileSync(join(dir, "en.json"), JSON.stringify({ a: "x", z: "?" }));
    const bad = run(dir);
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /en: missing\s+b/);
    assert.match(bad.stdout, /en: placeholders\s+a/);
    assert.match(bad.stdout, /en: extra\s+z/);
    assert.equal(run(dir, "--json").status, 1);
    assert.equal(run(dir, "--base", "fr").status, 2);
    assert.equal(run("--nope").status, 2);
    writeFileSync(join(dir, "en.json"), "{kapot");
    assert.equal(run(dir).status, 2);
    assert.throws(() => checkDirectory(dir, "nl"), /not valid JSON/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
