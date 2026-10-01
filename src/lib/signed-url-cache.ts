import { supabase } from "@/integrations/supabase/client";

/** In-memory cache of Supabase Storage signed URLs, shared by every screen.
 *
 *  Each createSignedUrls call returns a NEW URL for the same file (the token embeds the time it
 *  was issued), and the browser's HTTP cache is keyed by URL. So when Home, Wardrobe, Stylist,
 *  the outfit builder, etc. each signed the same garment image on their own, the browser
 *  downloaded that image again for every screen and on every re-sign. Reusing one URL per file
 *  while it is still comfortably valid lets the browser serve it from cache instead.
 *
 *  Paths are always scoped to the signed-in user's own folder by the caller, and the cache lives
 *  only in memory for the current tab. */
type Entry = { url: string; expiresAt: number };

/** A cached URL is reused only while it still has at least this long left, so nothing handed out
 *  expires while it is on screen. */
const MIN_REMAINING_MS = 10 * 60 * 1000;

export type SignResult = {
  /** path → signed URL, for every path that could be signed (cached or fresh). */
  urls: Record<string, string>;
  /** Error of the batch request itself, if it failed (cached URLs are still returned). */
  error: unknown;
  /** Paths the storage API refused individually (e.g. the file no longer exists). */
  failed: { path: string; error: unknown }[];
};

type BatchSigner = (
  bucket: string,
  paths: string[],
  expiresInSeconds: number,
) => Promise<{ data: { signedUrl: string | null; error: unknown }[] | null; error: unknown }>;

/** Builds a cache around a batch signer. Exported for tests; the app uses `signStoragePaths`. */
export function createSignedUrlCache(sign: BatchSigner, now: () => number = Date.now) {
  const cache = new Map<string, Entry>();
  return async function signPaths(bucket: string, paths: string[], expiresInSeconds = 60 * 60): Promise<SignResult> {
    const t = now();
    const urls: Record<string, string> = {};
    const missing: string[] = [];
    for (const path of new Set(paths)) {
      const hit = cache.get(`${bucket}/${path}`);
      if (hit && hit.expiresAt - t > MIN_REMAINING_MS) urls[path] = hit.url;
      else missing.push(path);
    }
    if (!missing.length) return { urls, error: null, failed: [] };

    const { data, error } = await sign(bucket, missing, expiresInSeconds);
    if (error || !data) return { urls, error: error ?? new Error("No signed URLs returned"), failed: [] };

    const expiresAt = t + expiresInSeconds * 1000;
    const failed: SignResult["failed"] = [];
    data.forEach((row, i) => {
      const path = missing[i];
      if (row.signedUrl) {
        cache.set(`${bucket}/${path}`, { url: row.signedUrl, expiresAt });
        urls[path] = row.signedUrl;
      } else if (row.error) {
        failed.push({ path, error: row.error });
      }
    });
    return { urls, error: null, failed };
  };
}

export const signStoragePaths = createSignedUrlCache((bucket, paths, expiresInSeconds) =>
  supabase.storage.from(bucket).createSignedUrls(paths, expiresInSeconds));
