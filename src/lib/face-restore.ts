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

type EyeAnchors = { rightEye: { x: number; y: number }; leftEye: { x: number; y: number }; imgWidth: number; imgHeight: number };

async function detectEyeAnchors(img: HTMLImageElement): Promise<EyeAnchors | null> {
  try {
    const landmarker = await getFaceLandmarker();
    const result = landmarker.detect(img);
    const lm = result.faceLandmarks?.[0];
    if (!lm) return null;
    const right = lm[RIGHT_EYE_LANDMARK];
    const left = lm[LEFT_EYE_LANDMARK];
    if (!right || !left) return null;
    return {
      rightEye: { x: right.x * img.naturalWidth, y: right.y * img.naturalHeight },
      leftEye: { x: left.x * img.naturalWidth, y: left.y * img.naturalHeight },
      imgWidth: img.naturalWidth,
      imgHeight: img.naturalHeight,
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

    // Soft radial feather so the composited region blends rather than
    // showing a hard-edged cutout — centered on the GENERATED midpoint
    // (post-transform, in the base canvas's coordinate space), sized
    // off the GENERATED eye distance so the feather radius matches the
    // actual scale of the result, not the original's.
    faceCtx.globalCompositeOperation = "destination-in";
    const featherRadius = genEyeDist * 2.6;
    const gradient = faceCtx.createRadialGradient(
      genMid.x, genMid.y, featherRadius * 0.55,
      genMid.x, genMid.y, featherRadius,
    );
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    faceCtx.fillStyle = gradient;
    faceCtx.fillRect(0, 0, w, h);

    baseCtx.drawImage(faceLayer, 0, 0);
    return base.toDataURL("image/png");
  } catch (e) {
    console.error("[AURA face-restore] alignment failed, using generated result as-is", e);
    return generatedDataUrl;
  }
}
