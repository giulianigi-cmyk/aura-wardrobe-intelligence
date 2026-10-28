// Run with: bun test src/lib/pending-import.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { firstHttpUrl } from "./pending-import";

test("finds the product link in a shared text", () => {
  assert.equal(firstHttpUrl("https://www.zara.com/it/it/giacca-p123.html"), "https://www.zara.com/it/it/giacca-p123.html");
  assert.equal(firstHttpUrl("Guarda questa giacca: https://shop.example.com/p/9?c=1."), "https://shop.example.com/p/9?c=1");
  assert.equal(firstHttpUrl("Giacca in lana (https://shop.example.com/p/9)"), "https://shop.example.com/p/9");
  assert.equal(firstHttpUrl("nessun link qui"), null);
  assert.equal(firstHttpUrl(null), null);
});
