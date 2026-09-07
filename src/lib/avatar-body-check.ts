// Full-body detection for the AURA Avatar upload flow, using MediaPipe
// PoseLandmarker — same package (@mediapipe/tasks-vision) and loading
// pattern already used for face detection in face-analyze.ts, just a
// different pre-trained model. Runs entirely client-side (WASM), nothing
// uploaded until the check already passed.
//
// This answers one narrow question: "is there a full-body figure visible
// in this photo?" — not "is this a good photo" or "is this the same
// person as the face photo". Those are out of scope here.

import { PoseLandmarker, FilesetResolver, type NormalizedLandmark } from "@mediapipe/tasks-vision";

const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

let landmarkerPromise: Promise<PoseLandmarker> | null = null;

function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_CDN);
      return PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "IMAGE",
        numPoses: 1,
      });
    })();
  }
  return landmarkerPromise;
}

// MediaPipe's 33-point pose model — indices for ankles and shoulders.
// If both ankles are confidently detected, the frame contains a
// full-body figure, not just a headshot or upper-body crop.
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;
const VISIBILITY_THRESHOLD = 0.5;

function isConfident(landmarks: NormalizedLandmark[], index: number): boolean {
  const point = landmarks[index] as (NormalizedLandmark & { visibility?: number }) | undefined;
  return !!point && (point.visibility ?? 1) >= VISIBILITY_THRESHOLD;
}

export type BodyCheckResult =
  | { ok: true }
  | { ok: false; reason: "no_person_detected" | "not_full_body" };

/** Runs on an already-loaded <img> or <canvas> element — call after the
 *  photo is picked, before uploading anything. */
export async function checkFullBodyPhoto(source: HTMLImageElement | HTMLCanvasElement): Promise<BodyCheckResult> {
  const landmarker = await getPoseLandmarker();
  const result = landmarker.detect(source);
  const pose = result.landmarks?.[0];

  if (!pose || pose.length === 0) return { ok: false, reason: "no_person_detected" };

  const hasShoulders = isConfident(pose, LEFT_SHOULDER) || isConfident(pose, RIGHT_SHOULDER);
  const hasAnkles = isConfident(pose, LEFT_ANKLE) || isConfident(pose, RIGHT_ANKLE);

  if (!hasShoulders || !hasAnkles) return { ok: false, reason: "not_full_body" };
  return { ok: true };
}
