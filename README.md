# @sandsoftwaresolutions/i18n-check

[![CI](https://github.com/SandSoftwareSolutions/ss-i18n-check/actions/workflows/ci.yml/badge.svg)](https://github.com/SandSoftwareSolutions/ss-i18n-check/actions/workflows/ci.yml)

Keep your translation files in step. Compares every `<locale>.json` with a base locale and tells you what is missing, what is left over, and where a placeholder differs, before a user sees `{name}` instead of a name. Understands ICU `plural`/`select` and rich text tags such as `<b>` (as used by next-intl). No dependencies.

## Install

```bash
npm install --save-dev @sandsoftwaresolutions/i18n-check
```

Works with `import` and `require()`, and ships TypeScript types for both.

## Command line

```bash
npx i18n-check messages --base nl
```

```
en: missing      checkout.title
en: placeholders cart.total  (nl: count, total; en: total)
en: extra        old.banner
en: empty        footer.note

4 problems against nl
```

Exit status: 0 fine, 1 problems found, 2 error. Add it to CI or to `package.json`: `"scripts": { "check:i18n": "i18n-check messages --base nl" }`.

Options: `--base <locale>` (default `nl`), `--json`, `--allow-extra` (do not complain about keys the base does not have).

## In code

```js
import { compareLocales, checkDirectory, placeholders } from "@sandsoftwaresolutions/i18n-check";

checkDirectory("messages", "nl").problems;
compareLocales({ nl: { a: "Hoi {name}" }, en: { a: "Hi" } }, "nl");
placeholders("{count, plural, one {# taak} other {# taken}}"); // ["count"]
```

## What is checked

| Problem | Meaning |
| --- | --- |
| `missing` | The key is in the base locale but not in this one |
| `extra` | The key is in this locale but not in the base |
| `placeholders` | Different `{arguments}` or `<tags>` than the base |
| `empty` | An empty text where the base locale has one (a text that is empty in both is left alone) |
| `type` | A text in one locale, something else in the other |

Nested messages and arrays are compared by path (`cart.items.0`).

Tags: `<b>...</b>` and `<br/>` count; a `<word>` without a closing tag is plain text (so `template add <address>` and its translation `template add <adres>` do not differ). A translation that drops the closing tag does differ. Tags with attributes (`<a href="...">`) are not ICU rich text and are not compared. Text between ICU quotes (`'{name}'`) is not a placeholder. A byte order mark at the start of a JSON file is ignored. The output is complete also when it is piped (for example into `jq`).

Tried on the real `company-site/messages` (nl and en, about 700 lines): no problems.

## Not included

It does not look for keys that your code no longer uses. That cannot be done reliably without knowing how your code builds keys.
