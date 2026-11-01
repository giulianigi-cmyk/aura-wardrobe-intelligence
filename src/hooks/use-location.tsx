import { useCallback, useState } from "react";
import { useProfile } from "./use-profile";

type Status = "idle" | "loading" | "granted" | "denied" | "unsupported" | "error";

async function reverseGeocode(lat: number, lon: number, language: string): Promise<string> {
  try {
    const r = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=${encodeURIComponent(language)}`
    );
    const data = await r.json();
    return data.city || data.locality || data.principalSubdivision || "Your area";
  } catch {
    return "Your area";
  }
}

async function geocodeCity(city: string): Promise<{ lat: number; lon: number; name: string } | null> {
  try {
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=${encodeURIComponent(city)}`
    );
    const data = await r.json();
    const hit = data?.results?.[0];
    if (!hit) return null;
    return { lat: Number(hit.latitude), lon: Number(hit.longitude), name: hit.name || city };
  } catch {
    return null;
  }
}

// A city typed by hand is kept (the person chose it) until they ask for their position again; a
// position from the phone is refreshed on every app open, so the weather follows them when they
// travel. It used to be detected only once, when no city was set, and then never again (reported:
// "non funziona la localizzazione automatica").
const MANUAL_KEY = "aura.locationManual";
const isManual = (): boolean => { try { return localStorage.getItem(MANUAL_KEY) === "1"; } catch { return false; } };
const setManualFlag = (on: boolean) => { try { if (on) localStorage.setItem(MANUAL_KEY, "1"); else localStorage.removeItem(MANUAL_KEY); } catch { /* not remembered */ } };

/** Kilometres between two points (equirectangular: fine for "did the person move"). */
function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const x = ((b.lon - a.lon) * Math.PI / 180) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  const y = (b.lat - a.lat) * Math.PI / 180;
  return Math.sqrt(x * x + y * y) * 6371;
}

export function useLocation() {
  const { profile, update } = useProfile();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  /** The phone's position. `silent`: a background refresh — no spinner, no error shown, and the
   *  profile is written only when the person moved more than 5 km. */
  const detect = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      if (!silent) setStatus("unsupported");
      return;
    }
    if (!silent) { setStatus("loading"); setError(null); }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const moved = profile?.latitude == null || profile?.longitude == null
            || distanceKm({ lat: profile.latitude, lon: profile.longitude }, { lat: latitude, lon: longitude }) > 5;
          if (!silent || moved) {
            const lang = (typeof document !== "undefined" && document.documentElement.lang) || "en";
            const city = await reverseGeocode(latitude, longitude, lang.slice(0, 2));
            await update({ city, latitude, longitude });
          }
          setManualFlag(false);
          setStatus("granted");
        } catch (e: unknown) {
          if (silent) return;
          setStatus("error");
          setError(e instanceof Error ? e.message : "Lookup failed");
        }
      },
      (err) => {
        if (silent) return;
        setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error");
        setError(err.message);
      },
      { timeout: 10000, maximumAge: silent ? 30 * 60_000 : 60_000, enableHighAccuracy: false }
    );
  }, [update, profile?.latitude, profile?.longitude]);

  /** On app open: refresh the position in the background when the phone already allows it and the
   *  city was not typed by hand. Never asks for permission by itself. */
  const refreshIfAllowed = useCallback(async () => {
    if (isManual() || typeof navigator === "undefined" || !navigator.geolocation) return;
    try {
      const perm = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
      if (perm && perm.state !== "granted") return;
      if (!perm) return;
    } catch {
      return; // no Permissions API: the person taps "Usa la mia posizione"
    }
    void detect({ silent: true });
  }, [detect]);

  const setManual = useCallback(async (city: string) => {
    const v = city.trim();
    if (!v) return;
    setStatus("loading"); setError(null);
    const geo = await geocodeCity(v);
    setManualFlag(true);
    if (geo) {
      await update({ city: geo.name, latitude: geo.lat, longitude: geo.lon });
    } else {
      // Save city even if geocoding fails; weather will simply be unavailable.
      await update({ city: v, latitude: null, longitude: null });
    }
    setStatus("granted");
  }, [update]);

  return {
    city: profile?.city ?? null,
    latitude: profile?.latitude ?? null,
    longitude: profile?.longitude ?? null,
    status,
    error,
    detect,
    refreshIfAllowed,
    setManual,
  };
}
