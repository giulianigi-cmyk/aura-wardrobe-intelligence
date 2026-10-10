// Run with: bun test src/lib/signed-url-cache.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { createSignedUrlCache } from "./signed-url-cache";

function setup() {
  const calls: string[][] = [];
  let counter = 0;
  let clock = Date.parse("2026-10-01T10:00:00Z");
  const sign = createSignedUrlCache(async (_bucket, paths) => {
    calls.push(paths);
    return {
      data: paths.map((p) => (p.includes("missing")
        ? { signedUrl: null, error: "Object not found" }
        : { signedUrl: `https://cdn.test/${p}?token=${++counter}`, error: null })),
      error: null,
    };
  }, () => clock);
  return { sign, calls, advance: (ms: number) => { clock += ms; } };
}

test("same file keeps the same URL across calls and is signed once", async () => {
  const { sign, calls } = setup();
  const a = await sign("wardrobe", ["u1/a.png", "u1/b.png"]);
  const b = await sign("wardrobe", ["u1/b.png", "u1/a.png"]);
  assert.deepEqual(b.urls, a.urls);
  assert.deepEqual(calls, [["u1/a.png", "u1/b.png"]]);
});

test("only paths not seen yet are signed", async () => {
  const { sign, calls } = setup();
  await sign("wardrobe", ["u1/c.png"]);
  const r = await sign("wardrobe", ["u1/c.png", "u1/d.png"]);
  assert.deepEqual(calls, [["u1/c.png"], ["u1/d.png"]]);
  assert.deepEqual(Object.keys(r.urls).sort(), ["u1/c.png", "u1/d.png"]);
});

test("buckets are cached separately", async () => {
  const { sign, calls } = setup();
  await sign("wardrobe", ["u1/e.png"]);
  await sign("outfits", ["u1/e.png"]);
  assert.equal(calls.length, 2);
});

test("a URL with less than 10 minutes left is re-signed", async () => {
  const { sign, advance } = setup();
  const first = await sign("wardrobe", ["u1/f.png"], 3600);
  advance(45 * 60 * 1000); // 15 min left: reused
  assert.deepEqual((await sign("wardrobe", ["u1/f.png"], 3600)).urls, first.urls);
  advance(10 * 60 * 1000); // 5 min left: re-signed
  assert.notEqual((await sign("wardrobe", ["u1/f.png"], 3600)).urls["u1/f.png"], first.urls["u1/f.png"]);
});

test("files the API refuses are reported and not cached", async () => {
  const { sign, calls } = setup();
  const r = await sign("wardrobe", ["u1/missing.png", "u1/g.png"]);
  assert.deepEqual(r.failed.map((f) => f.path), ["u1/missing.png"]);
  assert.equal(r.urls["u1/missing.png"], undefined);
  await sign("wardrobe", ["u1/missing.png"]);
  assert.deepEqual(calls.at(-1), ["u1/missing.png"]);
});

test("a failed batch request still returns cached URLs", async () => {
  let fail = false;
  const sign = createSignedUrlCache(async (_b, paths) => (fail
    ? { data: null, error: new Error("network") }
    : { data: paths.map((p) => ({ signedUrl: `u:${p}`, error: null })), error: null }));
  await sign("wardrobe", ["u1/h.png"]);
  fail = true;
  const r = await sign("wardrobe", ["u1/h.png", "u1/i.png"]);
  assert.equal(r.urls["u1/h.png"], "u:u1/h.png");
  assert.ok(r.error);
});

test("more than 1000 paths are signed in blocks the storage API accepts", async () => {
  const sizes: number[] = [];
  const sign = createSignedUrlCache(async (_b, paths) => {
    sizes.push(paths.length);
    if (paths.length > 1000) return { data: null, error: new Error("must NOT have more than 1000 items") };
    return { data: paths.map((p) => ({ signedUrl: `u:${p}`, error: null })), error: null };
  });
  const paths = Array.from({ length: 1201 }, (_, i) => `u1/${i}.png`);
  const r = await sign("wardrobe", paths);
  assert.equal(r.error, null);
  assert.equal(Object.keys(r.urls).length, 1201);
  assert.ok(sizes.every((n) => n <= 1000));
});
