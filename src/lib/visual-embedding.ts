/** Client-side visual embedding using DINOv2-Base — same principle as
 *  outfit-segmentation.ts: runs entirely in the browser via
 *  @huggingface/transformers (WASM/WebGPU), no server round-trip and no
 *  per-image cost for the model itself. Only the resulting vector (a
 *  few hundred numbers, not the image) goes to the server, for the
 *  actual nearest-neighbor search via pgvector — comparing hundreds of
 *  768-dimension vectors one by one in JS doesn't scale the way a
 *  database index does.
 *
 *  Extracts the CLS token specifically, not a pooled combination of
 *  patch tokens — this matches the ADR's own stated baseline
 *  (docs/benchmarks/001-visual-identity-benchmark.md, Phase 1:
 *  "DINOv2-Base + CLS token, fisso"). Patch pooling is Phase 2 of that
 *  same benchmark protocol, only worth trying if the CLS-token baseline
 *  doesn't pass — not something to reach for upfront. */

type FeatureExtractor = (input: string) => Promise<{ data: Float32Array | number[]; dims: number[] }>;

let extractorPromise: Promise<FeatureExtractor> | null = null;

async function getEmbedder(): Promise<FeatureExtractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      const extractor = await pipeline("image-feature-extraction", "Xenova/dinov2-base");
      return extractor as unknown as FeatureExtractor;
    })().catch((e) => {
      extractorPromise = null;
      throw e;
    });
  }
  return extractorPromise;
}

export const EMBEDDING_MODEL_VERSION = "dinov2-base-v1";
export const EMBEDDING_DIMENSIONS = 768;

/** Computes a 768-number visual "fingerprint" of a single garment photo.
 *  Two fingerprints being close means the two photos likely show the
 *  same physical item — this is what lets LogWear (or wardrobe import
 *  dedup, in the future) tell apart two visually similar-but-different
 *  garments that share the same category/color/brand, which the
 *  attribute-only scoring in outfit-dedupe.ts genuinely cannot. */
export async function computeGarmentEmbedding(imageDataUrl: string): Promise<number[]> {
  const extractor = await getEmbedder();
  const output = await extractor(imageDataUrl);

  // DINOv2's raw output is [1, num_tokens, 768] — one row per patch,
  // plus one extra row for the CLS token at index 0. Only that first
  // row is the whole-image summary the ADR's baseline calls for; the
  // rest are per-patch tokens (useful for a future Phase 2 upgrade,
  // not this one).
  const hiddenSize = output.dims[output.dims.length - 1];
  if (hiddenSize !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Unexpected embedding size ${hiddenSize}, expected ${EMBEDDING_DIMENSIONS} — model output shape may have changed.`);
  }
  const clsToken = Array.from(output.data).slice(0, EMBEDDING_DIMENSIONS);
  return clsToken as number[];
}
