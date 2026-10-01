// Run with: bun test src/lib/wardrobe-thumb-backfill.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { backfillWardrobeThumbs, thumbBackfillPath, type ThumbBackfillDeps } from "./wardrobe-thumb-backfill";

const OWNER = "owner-1";
type Row = { id: string; user_id: string; image_url: string | null; thumbnail_path: string | null; created_at: string };

/** Minimal in-memory stand-in for the parts of supabase-js the backfill uses. */
function fakeEnv(rows: Row[], opts: { failUploadFor?: Set<string>; failUpdateFor?: Set<string>; onUpdate?: (id: string) => void } = {}) {
  const table = rows.map((r) => ({ ...r }));
  const files = new Map<string, { bytes: number; writes: number }>();
  for (const r of table) if (r.image_url) files.set(r.image_url, { bytes: 600_000, writes: 0 });
  const uploads: string[] = [];

  function selectBuilder() {
    const filters: ((r: Row) => boolean)[] = [];
    let limit = Infinity;
    const b = {
      select: () => b,
      eq: (col: keyof Row, v: unknown) => { filters.push((r) => r[col] === v); return b; },
      is: (col: keyof Row, v: null) => { filters.push((r) => r[col] === v); return b; },
      not: (col: keyof Row, op: string, v: unknown) => {
        if (op === "is") filters.push((r) => r[col] !== v);
        if (op === "in") { const ids = String(v).slice(1, -1).split(","); filters.push((r) => !ids.includes(String(r[col]))); }
        return b;
      },
      order: () => b,
      limit: (n: number) => { limit = n; return b; },
      then: (resolve: (v: unknown) => void) => resolve({ data: table.filter((r) => filters.every((f) => f(r))).slice(0, limit).map((r) => ({ id: r.id, image_url: r.image_url })), error: null }),
    };
    return b;
  }
  function updateBuilder(patch: Partial<Row>) {
    const filters: ((r: Row) => boolean)[] = [];
    const b = {
      eq: (col: keyof Row, v: unknown) => { filters.push((r) => r[col] === v); return b; },
      is: (col: keyof Row, v: null) => { filters.push((r) => r[col] === v); return b; },
      select: () => {
        const hit = table.filter((r) => filters.every((f) => f(r)));
        if (hit.some((r) => opts.failUpdateFor?.has(r.id))) return Promise.resolve({ data: null, error: new Error("update failed") });
        hit.forEach((r) => { opts.onUpdate?.(r.id); Object.assign(r, patch); });
        return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
      },
    };
    return b;
  }
  const db = {
    from: () => ({ select: () => selectBuilder(), update: (patch: Partial<Row>) => updateBuilder(patch) }),
    storage: {
      from: () => ({
        upload: async (path: string, file: File, o: { upsert?: boolean }) => {
          const id = path.split("thumb-backfill-")[1]?.replace(".jpg", "");
          if (id && opts.failUploadFor?.has(id)) return { data: null, error: new Error("upload failed") };
          const existing = files.get(path);
          if (existing && !o.upsert) return { data: null, error: new Error("Duplicate") };
          files.set(path, { bytes: file.size, writes: (existing?.writes ?? 0) + 1 });
          uploads.push(path);
          return { data: { path }, error: null };
        },
      }),
    },
  };
  const deps: Partial<ThumbBackfillDeps> = {
    ownerId: OWNER,
    isTouch: false,
    db: db as unknown as ThumbBackfillDeps["db"],
    sign: (async (_b: string, paths: string[]) => ({ urls: Object.fromEntries(paths.map((p) => [p, `https://x/${p}`])), error: null, failed: [] })) as ThumbBackfillDeps["sign"],
    fetchFn: (async () => new Response(new Blob([new Uint8Array(600_000)], { type: "image/png" }))) as ThumbBackfillDeps["fetchFn"],
    compress: (async () => new File([new Uint8Array(17_000)], "item.jpg", { type: "image/jpeg" })) as ThumbBackfillDeps["compress"],
  };
  return { table, files, uploads, deps };
}

function items(n: number, user = OWNER, withThumb = false): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${user}-item-${String(i).padStart(3, "0")}`, user_id: user,
    image_url: `${user}/item-${i}.png`, thumbnail_path: withThumb ? `${user}/thumb-old-${i}.jpg` : null,
    created_at: `2026-07-${String((i % 28) + 1).padStart(2, "0")}`,
  }));
}

test("does nothing for any account other than the owner", async () => {
  const env = fakeEnv(items(5, "someone-else"));
  const r = await backfillWardrobeThumbs("someone-else", env.deps);
  assert.deepEqual(r, { done: 0, skipped: 0, failed: 0 });
  assert.equal(env.uploads.length, 0);
});

test("fills every missing thumbnail in batches, at the deterministic path", async () => {
  const env = fakeEnv(items(30));
  const r = await backfillWardrobeThumbs(OWNER, env.deps);
  assert.equal(r.done, 30);
  for (const row of env.table) assert.equal(row.thumbnail_path, thumbBackfillPath(OWNER, row.id));
  assert.equal(new Set(env.uploads).size, 30);
});

test("never touches rows that already have a thumbnail, or other users' rows", async () => {
  const env = fakeEnv([...items(3, OWNER, true), ...items(2, "other-user")]);
  const before = env.table.map((r) => ({ ...r }));
  const r = await backfillWardrobeThumbs(OWNER, env.deps);
  assert.equal(r.done, 0);
  assert.deepEqual(env.table, before);
  assert.equal(env.uploads.length, 0);
});

test("originals are never written", async () => {
  const env = fakeEnv(items(12));
  await backfillWardrobeThumbs(OWNER, env.deps);
  for (const row of env.table) {
    // Originals are only read: no upload ever targets an original path.
    assert.ok(!env.uploads.includes(row.image_url!));
  }
});

test("an interrupted run (upload done, DB update failed) resumes without duplicate files", async () => {
  const seed = items(5);
  const failing = new Set([seed[2].id]);
  const env = fakeEnv(seed, { failUpdateFor: failing });
  const first = await backfillWardrobeThumbs(OWNER, env.deps);
  assert.equal(first.done, 4);
  assert.equal(first.failed, 1);
  const stuck = env.table.find((r) => r.id === seed[2].id)!;
  assert.equal(stuck.thumbnail_path, null);
  const path = thumbBackfillPath(OWNER, stuck.id);
  assert.equal(env.files.get(path)?.writes, 1); // the file was uploaded before the failure

  failing.clear(); // e.g. network back
  const second = await backfillWardrobeThumbs(OWNER, env.deps);
  assert.equal(second.done, 1);
  assert.equal(stuck.thumbnail_path, path);
  // Same file rewritten in place, no second copy under another name.
  assert.equal(env.files.get(path)?.writes, 2);
  assert.equal([...env.files.keys()].filter((k) => k.includes(stuck.id)).length, 1);
});

test("a failing item does not block the rest and is not retried in a loop", async () => {
  const seed = items(15);
  const env = fakeEnv(seed, { failUploadFor: new Set([seed[0].id]) });
  const r = await backfillWardrobeThumbs(OWNER, env.deps);
  assert.equal(r.done, 14);
  assert.equal(r.failed, 1);
});

test("a thumbnail created by the user meanwhile is kept, not replaced", async () => {
  const seed = items(2);
  const env = fakeEnv(seed);
  // Simulate the user saving their own thumbnail right before our conditional update.
  const target = env.table[0];
  const origUpdate = env.deps.db!.from;
  env.deps.db = {
    ...env.deps.db!,
    from: ((t: string) => {
      const api = (origUpdate as unknown as (t: string) => { update: (p: unknown) => unknown; select: () => unknown })(t);
      return { ...api, update: (patch: unknown) => { target.thumbnail_path = `${OWNER}/thumb-user-own.jpg`; return api.update(patch); } };
    }) as unknown as ThumbBackfillDeps["db"]["from"],
  } as ThumbBackfillDeps["db"];
  const r = await backfillWardrobeThumbs(OWNER, env.deps);
  assert.equal(target.thumbnail_path, `${OWNER}/thumb-user-own.jpg`);
  assert.ok(r.skipped >= 1);
});

test("skips (does not upload) when the generator returns the original instead of a JPEG", async () => {
  const env = fakeEnv(items(2));
  env.deps.compress = (async (f: File) => f) as ThumbBackfillDeps["compress"];
  const r = await backfillWardrobeThumbs(OWNER, env.deps);
  assert.equal(r.done, 0);
  assert.equal(r.skipped, 2);
  assert.equal(env.uploads.length, 0);
});

test("on touch devices very large originals are left for a desktop run", async () => {
  const env = fakeEnv(items(1));
  env.deps.isTouch = true;
  env.deps.fetchFn = (async () => new Response(new Blob([new Uint8Array(9 * 1024 * 1024)], { type: "image/png" }))) as ThumbBackfillDeps["fetchFn"];
  const r = await backfillWardrobeThumbs(OWNER, env.deps);
  assert.equal(r.skipped, 1);
  assert.equal(env.table[0].thumbnail_path, null);
});
