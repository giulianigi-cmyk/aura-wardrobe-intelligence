/** Real face detection + alignment for the avatar try-on chain, using
 *  MediaPipe's FaceLandmarker (already an installed dependency — see
 *  @mediapipe/tasks-vision in package.json — not a new one added for
 *  this).
 *
 *  This replaces an earlier attempt that pasted a FIXED percentage of
 *  the frame (the top ~20%) from the original photo onto each FASHN
 *  result, assuming both images shared identical framing. That
 *  assumption was wrong: FASHN can reframe/re-crop the subject between
 *  generations, so a fixed-position paste landed the head in the wrong
 *  place relative to the neck/shoulders below it — reported as looking
 *  "like a monster" — and was reverted entirely.
 *
 *  This version detects the actual eye positions in BOTH the original
 *  photo and the generated result, computes the real similarity
 *  transform (scale + rotation + translation) between them, and only
 *  then overlays the original face — warped to match exactly where the
 *  face actually sits in the generated image, not where a fixed
 *  percentage assumes it sits. If detection fails on either image for
 *  any reason, this returns the generated image completely unchanged —
 *  never falls back to a guess, since a guess is exactly what caused
 *  the earlier failure.
 */
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// Standard outer-eye-corner indices in MediaPipe's 468-point face mesh —
// stable, well-documented landmarks used broadly for face alignment
// (unlike, say, mouth or eyebrow points, which move with expression).
const RIGHT_EYE_LANDMARK = 33;
const LEFT_EYE_LANDMARK = 263;

/** Largest accepted distance between a mapped original landmark and the generated one, as a
 *  fraction of the eye distance. The nose tip shows the head pose: it must line up closely, or the
 *  head is turned differently and the face is left alone. The mouth corners are allowed more: the
 *  chained try-on steps drift exactly there (that drift IS the deformed face to repair), and the
 *  paste covers the inner face only, so the generated jaw and chin are not replaced. The chin is not
 *  checked for the same reason. With every point held to 0.18 the restore was refused on the very
 *  faces it exists for, and a reshaped face reached the result. */
const MAX_NOSE_ERROR = 0.18;
const MAX_MOUTH_ERROR = 0.3;

let landmarkerPromise: Promise<FaceLandmarker> | null = null;
function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm",
      );
      return FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        },
        runningMode: "IMAGE",
        numFaces: 1,
      });
    })();
  }
  return landmarkerPromise;
}

type Pt = { x: number; y: number };
type EyeAnchors = { rightEye: Pt; leftEye: Pt; imgWidth: number; imgHeight: number; /** nose tip, mouth corners, chin */ checks: Pt[] };

// Nose tip, mouth corners, chin: used to VERIFY an eye-based alignment before pasting a face.
const CHECK_LANDMARKS = [1, 61, 291, 152];

async function detectEyeAnchors(img: HTMLImageElement): Promise<EyeAnchors | null> {
  try {
    const landmarker = await getFaceLandmarker();
    const result = landmarker.detect(img);
    const lm = result.faceLandmarks?.[0];
    if (!lm) return null;
    const right = lm[RIGHT_EYE_LANDMARK];
    const left = lm[LEFT_EYE_LANDMARK];
    if (!right || !left) return null;
    const checks = CHECK_LANDMARKS.map((i) => lm[i]).filter(Boolean).map((p) => ({ x: p.x * img.naturalWidth, y: p.y * img.naturalHeight }));
    if (checks.length !== CHECK_LANDMARKS.length) return null;
    return {
      rightEye: { x: right.x * img.naturalWidth, y: right.y * img.naturalHeight },
      leftEye: { x: left.x * img.naturalWidth, y: left.y * img.naturalHeight },
      imgWidth: img.naturalWidth,
      imgHeight: img.naturalHeight,
      checks,
    };
  } catch (e) {
    console.error("[AURA face-restore] face detection failed", e);
    return null;
  }
}

function loadImageEl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = dataUrl;
  });
}

/** Distance (px, in the generated image) between each of the original's nose / mouth / chin points
 *  mapped by the eye-based similarity transform and the same landmark detected in the generated
 *  image, in CHECK_LANDMARKS order. */
export function landmarkErrors(
  orig: { rightEye: Pt; leftEye: Pt; checks: Pt[] },
  gen: { rightEye: Pt; leftEye: Pt; checks: Pt[] },
): number[] {
  const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const oMid = mid(orig.leftEye, orig.rightEye), gMid = mid(gen.leftEye, gen.rightEye);
  const oDist = Math.hypot(orig.leftEye.x - orig.rightEye.x, orig.leftEye.y - orig.rightEye.y);
  const gDist = Math.hypot(gen.leftEye.x - gen.rightEye.x, gen.leftEye.y - gen.rightEye.y);
  if (oDist < 1 || gDist < 1) return orig.checks.map(() => Infinity);
  const scale = gDist / oDist;
  const rot = Math.atan2(gen.leftEye.y - gen.rightEye.y, gen.leftEye.x - gen.rightEye.x)
    - Math.atan2(orig.leftEye.y - orig.rightEye.y, orig.leftEye.x - orig.rightEye.x);
  return orig.checks.map((p, i) => {
    const dx = (p.x - oMid.x) * scale, dy = (p.y - oMid.y) * scale;
    const m = { x: gMid.x + dx * Math.cos(rot) - dy * Math.sin(rot), y: gMid.y + dx * Math.sin(rot) + dy * Math.cos(rot) };
    const g = gen.checks[i];
    return g ? Math.hypot(m.x - g.x, m.y - g.y) : Infinity;
  });
}

/** Worst of landmarkErrors. */
export function landmarkAlignmentError(
  orig: { rightEye: Pt; leftEye: Pt; checks: Pt[] },
  gen: { rightEye: Pt; leftEye: Pt; checks: Pt[] },
): number {
  return Math.max(...landmarkErrors(orig, gen));
}

/** Whether the original face can be laid over the generated one: same head pose (nose tip) and
 *  features drifted no further than the inner-face paste can cover (mouth corners). */
export function canRestoreFace(
  orig: { rightEye: Pt; leftEye: Pt; checks: Pt[] },
  gen: { rightEye: Pt; leftEye: Pt; checks: Pt[] },
): { ok: boolean; reason?: "pose" | "mouth" } {
  const gDist = Math.hypot(gen.leftEye.x - gen.rightEye.x, gen.leftEye.y - gen.rightEye.y);
  const [nose, mouthR, mouthL] = landmarkErrors(orig, gen);
  if (!(nose <= gDist * MAX_NOSE_ERROR)) return { ok: false, reason: "pose" };
  if (!(Math.max(mouthR, mouthL) <= gDist * MAX_MOUTH_ERROR)) return { ok: false, reason: "mouth" };
  return { ok: true };
}

/** Overlays the ORIGINAL avatar photo's real face onto a FASHN result,
 *  aligned by actual detected eye positions rather than assumed framing.
 *  Returns the generated image completely unchanged if either face
 *  can't be detected — this is a deliberate no-op fallback, not an
 *  error: a missed detection (side profile, sunglasses, low
 *  confidence) is common enough that guessing would reintroduce the
 *  exact risk this was built to avoid. */
export async function restoreOriginalFaceAligned(originalDataUrl: string, generatedDataUrl: string): Promise<string> {
  try {
    const [originalImg, generatedImg] = await Promise.all([loadImageEl(originalDataUrl), loadImageEl(generatedDataUrl)]);
    const [originalEyes, generatedEyes] = await Promise.all([detectEyeAnchors(originalImg), detectEyeAnchors(generatedImg)]);
    if (!originalEyes || !generatedEyes) {
      console.warn("[AURA face-restore] face not detected in original or generated image — leaving result untouched");
      return generatedDataUrl;
    }

    const origMid = {
      x: (originalEyes.leftEye.x + originalEyes.rightEye.x) / 2,
      y: (originalEyes.leftEye.y + originalEyes.rightEye.y) / 2,
    };
    const genMid = {
      x: (generatedEyes.leftEye.x + generatedEyes.rightEye.x) / 2,
      y: (generatedEyes.leftEye.y + generatedEyes.rightEye.y) / 2,
    };
    const origEyeDist = Math.hypot(
      originalEyes.leftEye.x - originalEyes.rightEye.x,
      originalEyes.leftEye.y - originalEyes.rightEye.y,
    );
    const genEyeDist = Math.hypot(
      generatedEyes.leftEye.x - generatedEyes.rightEye.x,
      generatedEyes.leftEye.y - generatedEyes.rightEye.y,
    );
    if (origEyeDist < 1 || genEyeDist < 1) return generatedDataUrl; // degenerate detection, bail out safely

    const scale = genEyeDist / origEyeDist;
    const origAngle = Math.atan2(
      originalEyes.leftEye.y - originalEyes.rightEye.y,
      originalEyes.leftEye.x - originalEyes.rightEye.x,
    );
    const genAngle = Math.atan2(
      generatedEyes.leftEye.y - generatedEyes.rightEye.y,
      generatedEyes.leftEye.x - generatedEyes.rightEye.x,
    );
    const rotation = genAngle - origAngle;

    // Verify before pasting: map the original's nose, mouth corners and chin with the same
    // transform and compare with where they are in the generated image. Two eyes alone always
    // "align"; if the head is turned or tilted differently, or the face shape differs, the pasted
    // face sat on the wrong jaw and mouth — the deformed look reported. Then the generated face is
    // left as it is.
    const verdict = canRestoreFace(originalEyes, generatedEyes);
    if (!verdict.ok) {
      console.warn("[AURA face-restore] faces don't line up — leaving the generated face as it is", verdict.reason);
      return generatedDataUrl;
    }

    const w = generatedImg.naturalWidth;
    const h = generatedImg.naturalHeight;
    const base = document.createElement("canvas");
    base.width = w;
    base.height = h;
    const baseCtx = base.getContext("2d");
    if (!baseCtx) return generatedDataUrl;
    baseCtx.drawImage(generatedImg, 0, 0, w, h);

    const faceLayer = document.createElement("canvas");
    faceLayer.width = w;
    faceLayer.height = h;
    const faceCtx = faceLayer.getContext("2d");
    if (!faceCtx) return generatedDataUrl;

    // Transform order: move to the generated midpoint, rotate, scale,
    // then draw the original image offset so its OWN midpoint lands at
    // the local origin — net effect is the original face region ends up
    // exactly where the generated face's eyes actually are, at the
    // right size and angle, not a fixed guessed position.
    faceCtx.save();
    faceCtx.translate(genMid.x, genMid.y);
    faceCtx.rotate(rotation);
    faceCtx.scale(scale, scale);
    faceCtx.translate(-origMid.x, -origMid.y);
    faceCtx.drawImage(originalImg, 0, 0, originalImg.naturalWidth, originalImg.naturalHeight);
    faceCtx.restore();

    // Soft feather so the composited region blends rather than showing a hard-edged cutout, sized
    // off the GENERATED face so it matches the scale of the result.
    // Inner face only — brows, eyes, nose, mouth — as a soft ellipse: the generated hair, jaw and
    // chin stay, so a jaw that differs slightly from the original's never meets a pasted mouth
    // edge. Centred between the eyes and the mouth in the generated image. Drawn on a full-size
    // mask so that destination-in clears everything outside it.
    const mouth = { x: (generatedEyes.checks[1].x + generatedEyes.checks[2].x) / 2, y: (generatedEyes.checks[1].y + generatedEyes.checks[2].y) / 2 };
    const centre = { x: (genMid.x + mouth.x) / 2, y: (genMid.y + mouth.y) / 2 };
    const faceAngle = Math.atan2(mouth.y - genMid.y, mouth.x - genMid.x) - Math.PI / 2;
    const rx = genEyeDist * 1.05;
    const ry = Math.hypot(mouth.x - genMid.x, mouth.y - genMid.y) * 0.5 + genEyeDist * 0.6;
    const mask = document.createElement("canvas");
    mask.width = w;
    mask.height = h;
    const maskCtx = mask.getContext("2d");
    if (!maskCtx) return generatedDataUrl;
    maskCtx.translate(centre.x, centre.y);
    maskCtx.rotate(faceAngle);
    maskCtx.scale(1, ry / rx);
    const gradient = maskCtx.createRadialGradient(0, 0, rx * 0.6, 0, 0, rx);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    maskCtx.fillStyle = gradient;
    maskCtx.fillRect(-rx, -rx, rx * 2, rx * 2);
    faceCtx.globalCompositeOperation = "destination-in";
    faceCtx.drawImage(mask, 0, 0);

    baseCtx.drawImage(faceLayer, 0, 0);
    // JPEG, not PNG: a PNG of the 2k try-on result runs past 10 MB and the save step refused it,
    // so every look whose face restore succeeded failed at the very end.
    return base.toDataURL("image/jpeg", 0.92);
  } catch (e) {
    console.error("[AURA face-restore] alignment failed, using generated result as-is", e);
    return generatedDataUrl;
  }
}
