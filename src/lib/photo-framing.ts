// Framing of a My Outfit photo inside its 4:5 frame. The photo used to be shown with object-cover,
// which crops whatever doesn't fit — typically the shoes of a full-length shot. Now the photo is
// FITTED (whole photo visible, never distorted) and the person can zoom/pan it themselves.
//
// The framing is stored apart from the photo (the original file is never changed): on the account
// in outfit_photo_detections.photo_framing, and on this device as a cache / for older choices.

export type PhotoFraming = {
  /** 1 = whole photo fitted in the frame; >1 = zoomed in. */
  scale: number;
  /** Offset of the photo's centre, as a fraction of the frame's width / height. */
  x: number;
  y: number;
};

export const FIT_FRAMING: PhotoFraming = { scale: 1, x: 0, y: 0 };
export const MAX_SCALE = 4;
export const FRAME_ASPECT = 4 / 5; // width / height

/** Size of the fitted photo as a fraction of the frame (one of the two is 1). */
export function fittedSize(photoAspect: number, frameAspect = FRAME_ASPECT): { w: number; h: number } {
  return photoAspect >= frameAspect ? { w: 1, h: frameAspect / photoAspect } : { w: photoAspect / frameAspect, h: 1 };
}

/** Keeps the photo where it can't leave an empty side it could cover: when zoomed bigger than the
 *  frame it can be moved until its edge meets the frame's edge; when smaller it stays centred. */
export function clampFraming(f: PhotoFraming, photoAspect: number, frameAspect = FRAME_ASPECT): PhotoFraming {
  const scale = Math.min(MAX_SCALE, Math.max(1, Number.isFinite(f.scale) ? f.scale : 1));
  const { w, h } = fittedSize(photoAspect, frameAspect);
  const maxX = Math.max(0, (w * scale - 1) / 2);
  const maxY = Math.max(0, (h * scale - 1) / 2);
  const clamp = (v: number, m: number) => (Number.isFinite(v) ? Math.min(m, Math.max(-m, v)) + 0 : 0); // +0: no -0
  return { scale, x: clamp(f.x, maxX), y: clamp(f.y, maxY) };
}

const KEY = (id: string) => `aura.photoFraming.${id}`;

/** A framing read from the database (jsonb): null unless it has the expected shape. */
export function parseFraming(v: unknown): PhotoFraming | null {
  if (!v || typeof v !== "object") return null;
  const f = v as Partial<PhotoFraming>;
  if (typeof f.scale !== "number" || typeof f.x !== "number" || typeof f.y !== "number") return null;
  return { scale: f.scale, x: f.x, y: f.y };
}

export function loadFraming(id: string): PhotoFraming | null {
  try {
    const raw = localStorage.getItem(KEY(id));
    if (!raw) return null;
    const f = JSON.parse(raw) as Partial<PhotoFraming>;
    if (typeof f.scale !== "number" || typeof f.x !== "number" || typeof f.y !== "number") return null;
    return { scale: f.scale, x: f.x, y: f.y };
  } catch {
    return null;
  }
}

export function saveFraming(id: string, f: PhotoFraming): void {
  try {
    if (f.scale === 1 && f.x === 0 && f.y === 0) localStorage.removeItem(KEY(id));
    else localStorage.setItem(KEY(id), JSON.stringify(f));
  } catch {
    /* storage unavailable (private mode): the framing just isn't remembered */
  }
}
