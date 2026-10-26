// Run with: bun test src/i18n/locales.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SUPPORTED_LANGUAGES } from "./config";

type Tree = { [k: string]: string | Tree };
const load = (l: string) => JSON.parse(readFileSync(new URL(`./locales/${l}.json`, import.meta.url), "utf8")) as Tree;
const flat = (t: Tree, p = ""): Record<string, string> =>
  Object.entries(t).reduce<Record<string, string>>((out, [k, v]) => (typeof v === "string" ? { ...out, [p + k]: v } : { ...out, ...flat(v, `${p}${k}.`) }), {});
const placeholders = (s: string) => [...new Set(s.match(/\{\{\s*\w+\s*\}\}/g) ?? [])].filter((p) => !p.includes("appName")).sort();

test("Chinese has every English text, with the same placeholders", () => {
  const en = flat(load("en"));
  const zh = flat(load("zh"));
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  for (const [k, v] of Object.entries(en)) {
    assert.ok(zh[k].trim().length > 0, k);
    assert.deepEqual(placeholders(zh[k]), placeholders(v), k);
  }
});

test("every supported language has a translation file", () => {
  for (const l of SUPPORTED_LANGUAGES) assert.ok(Object.keys(load(l)).length > 0, l);
});
