/**
 * Gemini quota-aware retry planning.
 * Limits are per Google AI Studio project (not per key). Free-tier ballparks
 * from https://ai.google.dev/gemini-api/docs/rate-limits (check AI Studio for live values):
 *   Pro  ~5 RPM / ~100 RPD
 *   Flash ~10 RPM / ~250 RPD
 *   TPM   ~250k (shared)
 * RPD resets midnight Pacific. Official advice: exponential backoff + jitter on 429/503.
 */

export type QuotaKind = "rpm" | "tpm" | "rpd" | "capacity" | "unknown";

export type QuotaAdvice = {
  kind: QuotaKind;
  /** How long to wait before the next attempt (ms). */
  waitMs: number;
  /** Prefer a different model (separate quota bucket / less congestion). */
  switchModel: boolean;
  /** Do not keep hammering — surface error to the user. */
  stop: boolean;
  detail: string;
};

/** Conservative free-tier RPM used to space requests. */
export function freeTierRpmForModel(model: string): number {
  if (/lite/i.test(model)) return 15;
  if (/pro/i.test(model)) return 5;
  if (/flash/i.test(model)) return 10;
  return 5;
}

/** Minimum gap between calls so we stay under free-tier RPM. */
export function minRequestGapMs(model: string): number {
  const rpm = freeTierRpmForModel(model);
  return Math.ceil(60_000 / rpm) + 750;
}

/** Google SDK-style backoff: ~1s → 2s → 4s … max 60s, plus jitter. */
export function googleBackoffMs(attempt: number): number {
  const exp = Math.min(60_000, 1000 * 2 ** Math.min(Math.max(attempt, 1) - 1, 5));
  const jitter = Math.floor(Math.random() * 400);
  return exp + jitter;
}

function parseDurationToMs(raw: string): number | null {
  const s = raw.trim();
  // "49m30s" / "49m30.9s"
  const minSec = s.match(/^(\d+)\s*m\s*([0-9.]+)\s*s$/i);
  if (minSec) {
    return (Number(minSec[1]) * 60 + Number(minSec[2])) * 1000;
  }
  // "2970.938s" or "30s"
  const sec = s.match(/^([0-9.]+)\s*s$/i);
  if (sec) return Number(sec[1]) * 1000;
  // plain number → seconds
  const n = Number(s);
  if (!Number.isNaN(n) && n >= 0) return n * 1000;
  return null;
}

/** Pull retry delay from Retry-After header and/or Google error JSON body. */
export function parseGoogleRetryDelayMs(
  body: string,
  headers?: Headers | null,
): number | null {
  const ra = headers?.get("retry-after") ?? headers?.get("Retry-After");
  if (ra) {
    const asNum = Number(ra);
    if (!Number.isNaN(asNum)) return Math.max(0, asNum * 1000);
    const asDate = Date.parse(ra);
    if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
  }

  const patterns = [
    /"retryDelay"\s*:\s*"([^"]+)"/i,
    /"quotaResetDelay"\s*:\s*"([^"]+)"/i,
    /quota will reset after\s*([0-9]+m[0-9.]+s|[0-9.]+s)/i,
    /retry\s*(?:after|in|delay)?\s*[:=]?\s*([0-9.]+)\s*(?:seconds?|s)\b/i,
  ];
  for (const re of patterns) {
    const m = body.match(re);
    if (m?.[1]) {
      const ms = parseDurationToMs(m[1]);
      if (ms != null) return ms;
    }
  }

  // "reset after 49m30s"
  const m2 = body.match(
    /(?:reset|retry).*?(\d+)\s*m(?:in(?:ute)?s?)?\s*(\d+(?:\.\d+)?)\s*s/i,
  );
  if (m2) return (Number(m2[1]) * 60 + Number(m2[2])) * 1000;

  return null;
}

export function classifyGeminiQuotaError(
  status: number,
  body: string,
  headers: Headers | null | undefined,
  attempt: number,
): QuotaAdvice {
  const delay = parseGoogleRetryDelayMs(body, headers);
  const daily =
    /per\s*day|daily\s*quota|RPD|requests?\s*per\s*day|GenerateRequestsPerDay|exhausted your capacity|quota will reset/i.test(
      body,
    ) || (delay != null && delay >= 5 * 60_000);
  const rpm =
    /per\s*minute|RPM|requests?\s*per\s*minute|GenerateRequestsPerMinute/i.test(
      body,
    );
  const tpm =
    /token|TPM|TokensPerMinute|input\s*token/i.test(body) && !daily;
  const capacity =
    status === 503 ||
    status === 502 ||
    /high\s*demand|overloaded|UNAVAILABLE|temporarily\s+(?:unavailable|out)|capacity/i.test(
      body,
    );

  if (daily) {
    // Daily buckets are per-model — switch immediately; don't sleep for 49 minutes.
    return {
      kind: "rpd",
      waitMs: Math.min(delay ?? 2_000, 8_000),
      switchModel: true,
      stop: false,
      detail:
        delay && delay >= 60_000
          ? `Daily quota (RPD) hit — resets in ~${Math.round(delay / 60_000)}m (midnight PT). Switching model…`
          : "Daily quota (RPD) hit on this model — switching to a backup with its own quota…",
    };
  }

  if (capacity) {
    return {
      kind: "capacity",
      waitMs: Math.min(delay ?? googleBackoffMs(attempt), 20_000),
      switchModel: true,
      stop: false,
      detail: "Model high demand / 503 — switching backup (separate capacity)…",
    };
  }

  if (tpm) {
    return {
      kind: "tpm",
      waitMs: Math.min(delay ?? googleBackoffMs(attempt), 60_000),
      switchModel: attempt >= 2,
      stop: false,
      detail: "Token-per-minute (TPM) limit — backing off…",
    };
  }

  // 429 RPM or generic RESOURCE_EXHAUSTED
  if (status === 429 || rpm || /RESOURCE_EXHAUSTED|rate\s*limit/i.test(body)) {
    return {
      kind: "rpm",
      waitMs: Math.min(delay ?? googleBackoffMs(attempt), 60_000),
      // Free tier is low RPM — after 2 hits on this model, try another bucket.
      switchModel: attempt >= 2,
      stop: false,
      detail:
        delay != null
          ? `Rate limit (RPM) — Google asked to wait ~${Math.round(delay / 1000)}s…`
          : `Rate limit (RPM) — exponential backoff (~${Math.round(googleBackoffMs(attempt) / 1000)}s)…`,
    };
  }

  return {
    kind: "unknown",
    waitMs: Math.min(delay ?? googleBackoffMs(attempt), 30_000),
    switchModel: status >= 500,
    stop: false,
    detail: `Transient error HTTP ${status} — backing off…`,
  };
}

/** Cap a wait so the UI job does not stall for an entire daily reset. */
export function clampWaitForJob(
  waitMs: number,
  remainingBudgetMs: number,
  kind: QuotaKind,
): number {
  const hardCap = kind === "rpd" ? 8_000 : 60_000;
  return Math.max(0, Math.min(waitMs, hardCap, Math.max(0, remainingBudgetMs - 3_000)));
}
