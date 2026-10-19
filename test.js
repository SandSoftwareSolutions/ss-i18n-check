import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
      nl: { a: "Hoi {name}", b: "twee", c: { d: "diep" }, n: 1, leeg: "x", bewust: "" },
      en: { a: "Hi {nme}", c: {}, n: "een", leeg: "", extra: "weg", c2: "x", bewust: "" }
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

test("a lone <word> in a text is plain text, a tag must be closed (or self-closing)", () => {
  assert.deepEqual(placeholders("save it with template add <address> to update it later"), []);
  assert.deepEqual(placeholders("Lees <b>dit</b>"), ["<b>"]);
  assert.deepEqual(placeholders("Regel<br/>twee"), ["<br/>"]);
  assert.deepEqual(placeholders("Lees <b>dit"), [], "an unclosed tag is not a tag");
  // a translation that loses the closing tag is a difference
  const problems = compareLocales({ nl: { a: "Lees <b>dit</b>" }, en: { a: "Read <b>this" } }, "nl");
  assert.deepEqual(problems.map((p) => p.kind), ["placeholders"]);
  // the same text with a translated word in the angle brackets is fine
  assert.deepEqual(compareLocales({ nl: { a: "gebruik template add <adres>" }, en: { a: "use template add <address>" } }, "nl"), []);
});

test("text between ICU quotes is not a placeholder", () => {
  assert.deepEqual(placeholders("Typ '{naam}' letterlijk, {echt}"), ["echt"]);
  assert.deepEqual(placeholders("it''s {x}"), ["x"]);
});

test("message names that every object has are still compared", () => {
  const problems = compareLocales({ nl: { constructor: "x", toString: "y", __proto__x: "z" }, en: {} }, "nl");
  assert.deepEqual(problems.map((p) => `${p.kind}:${p.key}`).sort(), ["missing:__proto__x", "missing:constructor", "missing:toString"]);
  const odd = JSON.parse('{"nl":{"__proto__":"x","a":"1"},"en":{"a":"1"}}');
  assert.deepEqual(compareLocales(odd, "nl").map((p) => `${p.kind}:${p.key}`), ["missing:__proto__"]);
  assert.deepEqual(Object.keys(flatten(JSON.parse('{"__proto__":"x","a":{"__proto__":"y"}}'))), ["__proto__", "a.__proto__"]);
});

test("a byte order mark in a locale file is fine; a folder called x.json is reported clearly", () => {
  const dir = mkdtempSync(join(tmpdir(), "i18n-bom-"));
  try {
    writeFileSync(join(dir, "nl.json"), `﻿${JSON.stringify({ a: "1" })}`);
    writeFileSync(join(dir, "en.json"), JSON.stringify({ a: "1" }));
    assert.deepEqual(checkDirectory(dir, "nl"), { locales: ["en", "nl"], problems: [] });
    mkdirSync(join(dir, "fr.json"));
    assert.throws(() => checkDirectory(dir, "nl"), /fr\.json cannot be read/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a long report is not cut off when the output is a pipe", () => {
  const dir = mkdtempSync(join(tmpdir(), "i18n-big-"));
  try {
    const nl = {};
    for (let i = 0; i < 4000; i++) nl[`some.rather.long.key.number.${i}`] = `text ${i}`;
    writeFileSync(join(dir, "nl.json"), JSON.stringify(nl));
    writeFileSync(join(dir, "en.json"), "{}");
    const bin = fileURLToPath(new URL("./bin/i18n-check.js", import.meta.url));
    const run = spawnSync(process.execPath, [bin, dir, "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    assert.equal(run.status, 1);
    assert.ok(run.stdout.length > 200_000, `only ${run.stdout.length} bytes`);
    assert.equal(JSON.parse(run.stdout).problems.length, 4000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
