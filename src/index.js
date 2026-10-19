import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

// A plain assignment would turn a message called "__proto__" into a change of the prototype and lose it.
const put = (out, key, value) => Object.defineProperty(out, key, { value, enumerable: true, writable: true, configurable: true });

/** Flattens nested messages to `{ "a.b.0": "text" }`. Arrays use their index. Non-string leaves are kept as they are. */
export function flatten(value, prefix = "", out = {}) {
  if (value !== null && typeof value === "object") {
    const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v]) : Object.entries(value);
    if (entries.length === 0 && prefix) put(out, prefix, value);
    for (const [key, child] of entries) flatten(child, prefix ? `${prefix}.${key}` : key, out);
  } else if (prefix) {
    put(out, prefix, value);
  }
  return out;
}

function matchBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

function collectArguments(text, found) {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    const end = matchBrace(text, i);
    if (end === -1) return;
    const inner = text.slice(i + 1, end);
    const head = /^\s*([A-Za-z_]\w*)\s*(?:,\s*(\w+)\s*(?:,([\s\S]*))?)?$/.exec(inner);
    if (head) {
      found.add(head[1]);
      const [, , kind, rest] = head;
      if (rest !== undefined && /^(plural|select|selectordinal)$/.test(kind)) {
        for (let j = 0; j < rest.length; j++) {
          if (rest[j] !== "{") continue;
          const close = matchBrace(rest, j);
          if (close === -1) break;
          collectArguments(rest.slice(j + 1, close), found);
          j = close;
        }
      }
    }
    i = end;
  }
}

/**
 * The placeholders of one message: `{name}`, the arguments of plural/select, and rich-text tags such as `<b>` (a tag counts when it
 * is closed, `<b>...</b>`, or self-closing, `<br/>`; a lone `<address>` in a text such as "template add <address>" is plain text).
 * Text between ICU quotes (`'{'`, `'{name}'`) is not a placeholder. Sorted.
 */
export function placeholders(message) {
  if (typeof message !== "string") return [];
  const found = new Set();
  const text = message.replace(/''/g, "").replace(/'[{}][^']*'/g, ""); // ICU: '' is an apostrophe, '{...}' is literal text
  collectArguments(text, found);
  const opened = new Set([...text.matchAll(/<([A-Za-z][\w-]*)>/g)].map((m) => m[1]));
  const closed = new Set([...text.matchAll(/<\/([A-Za-z][\w-]*)>/g)].map((m) => m[1]));
  for (const name of opened) if (closed.has(name)) found.add(`<${name}>`);
  for (const tag of text.matchAll(/<([A-Za-z][\w-]*)\s*\/>/g)) found.add(`<${tag[1]}/>`);
  return [...found].sort();
}

/**
 * Compares locales with a base locale. Returns a list of problems:
 * `missing` (in the base, not in the locale), `extra` (in the locale only), `placeholders` (different arguments or tags),
 * `empty` (a text that is empty while the base locale has one; texts that are empty in both are left alone) and `type` (string in one, something else in the other).
 */
export function compareLocales(locales, base) {
  if (!Object.hasOwn(locales, base)) throw new Error(`Base locale "${base}" not found; have: ${Object.keys(locales).join(", ") || "none"}`);
  const baseFlat = flatten(locales[base]);
  const problems = [];
  for (const [locale, messages] of Object.entries(locales)) {
    if (locale === base) continue;
    const flat = flatten(messages);
    for (const [key, baseText] of Object.entries(baseFlat)) {
      if (!Object.hasOwn(flat, key)) {
        problems.push({ locale, key, kind: "missing" });
        continue;
      }
      const text = flat[key];
      if (typeof text !== typeof baseText) {
        problems.push({ locale, key, kind: "type", detail: `${typeof baseText} in ${base}, ${typeof text} in ${locale}` });
      } else if (text === "" && baseText !== "") {
        problems.push({ locale, key, kind: "empty" });
      } else if (typeof text === "string") {
        const a = placeholders(baseText);
        const b = placeholders(text);
        if (a.join("|") !== b.join("|")) {
          problems.push({ locale, key, kind: "placeholders", detail: `${base}: ${a.join(", ") || "none"}; ${locale}: ${b.join(", ") || "none"}` });
        }
      }
    }
    for (const [key, text] of Object.entries(flat)) {
      const emptyContainer = text !== null && typeof text === "object";
      if (!Object.hasOwn(baseFlat, key) && !emptyContainer) problems.push({ locale, key, kind: "extra" });
    }
  }
  return problems;
}

/** Reads every `<locale>.json` in a folder and compares them with the base locale. */
export function checkDirectory(dir, base) {
  const locales = {};
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    const file = join(dir, name);
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch (error) {
      throw new Error(`${file} cannot be read: ${error.message}`);
    }
    try {
      put(locales, basename(name, ".json"), JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)); // a BOM is not part of the JSON
    } catch (error) {
      throw new Error(`${file} is not valid JSON: ${error.message}`);
    }
  }
  return { locales: Object.keys(locales), problems: compareLocales(locales, base) };
}
