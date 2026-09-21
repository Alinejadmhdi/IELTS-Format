import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { jsonrepair } from "jsonrepair";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import {
  classifyGeminiQuotaError,
  clampWaitForJob,
  freeTierRpmForModel,
  googleBackoffMs,
  minRequestGapMs,
} from "./geminiQuota.js";
import { IELTS_PARSE_PROMPT_CHAT } from "./prompt.js";

export type ProgressFn = (step: string, detail?: string) => void;

/** Append ?key= for Gemini so auth survives proxies that strip Authorization. */
export function geminiUrlWithKey(url: string, apiKey: string): string {
  if (!/generativelanguage\.googleapis/i.test(url)) return url;
  const u = new URL(url);
  if (!u.searchParams.has("key")) u.searchParams.set("key", apiKey);
  return u.toString();
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let raw = fence ? fence[1].trim() : trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) {
    throw new Error(
      `No JSON object in model response (starts with: ${trimmed.slice(0, 120)})`,
    );
  }
  raw = raw.slice(start, end + 1);
  try {
    return JSON.parse(raw);
  } catch (first) {
    try {
      return JSON.parse(jsonrepair(raw));
    } catch {
      throw new Error(
        `Invalid JSON from model: ${first instanceof Error ? first.message : String(first)}. Preview: ${raw.slice(Math.max(0, 680), 780)}`,
      );
    }
  }
}

function isHighDemandError(status: number, body: string): boolean {
  if (status === 429 || status === 503 || status === 502) return true;
  return /high\s*demand|overloaded|resource[_\s-]?exhausted|unavailable|try\s+again\s+later|too\s+many\s+requests|capacity|temporarily\s+(?:unavailable|out)|concurrent|rate\s*limit|quota.*(exceeded|exhausted)|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(
    body,
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Primary failover: same/better quality vision models.
 * Capacity failover: Flash-Lite still does image→text + structured JSON
 * (Google positions it for classification / data extraction) — use last.
 * @see https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite
 */
const GEMINI_QUALITY_FALLBACKS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-001",
];

const GEMINI_CAPACITY_FALLBACKS = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-flash-lite-latest",
];

/** Build ordered model list: primary → quality backups → lite capacity backups. */
export function buildModelCandidates(primary: string, baseUrl: string): string[] {
  const out: string[] = [];
  const add = (m: string) => {
    const id = m.trim().replace(/^models\//, "");
    if (!id) return;
    // Retired 1.5.* and nano 8B only — Flash-Lite is allowed (vision + structured out)
    if (/^gemini-1\.5/i.test(id) || /flash-8b/i.test(id)) return;
    if (out.some((x) => x.toLowerCase() === id.toLowerCase())) return;
    out.push(id);
  };

  add(primary);

  for (const m of (process.env.LLM_FALLBACK_MODELS ?? "").split(",")) {
    add(m);
  }

  if (/generativelanguage\.googleapis/i.test(baseUrl)) {
    if (/flash/i.test(primary) && !/lite/i.test(primary)) {
      add("gemini-2.5-pro");
    }
    for (const m of GEMINI_QUALITY_FALLBACKS) add(m);
    for (const m of GEMINI_CAPACITY_FALLBACKS) add(m);
  }

  return out;
}

function isModelMissingError(status: number, body: string): boolean {
  if (status !== 404 && status !== 400) return false;
  return /not\s+found|does\s+not\s+exist|invalid\s+model|NOT_FOUND|is not found for API|not supported for generateContent/i.test(
    body,
  );
}

async function listGeminiModelIds(
  baseUrl: string,
  apiKey: string,
): Promise<string[] | null> {
  try {
    const res = await fetch(
      geminiUrlWithKey(`${baseUrl.replace(/\/$/, "")}/models`, apiKey),
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "x-goog-api-key": apiKey,
        },
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: Array<{ id?: string }>;
      models?: Array<{ name?: string; id?: string }>;
    };
    const ids: string[] = [];
    for (const m of data.data ?? []) {
      if (m.id) ids.push(m.id.replace(/^models\//, ""));
    }
    for (const m of data.models ?? []) {
      const raw = m.name || m.id;
      if (raw) ids.push(raw.replace(/^models\//, ""));
    }
    return ids.length ? ids : null;
  } catch {
    return null;
  }
}

function preferAvailableModels(
  candidates: string[],
  available: string[] | null,
): string[] {
  if (!available?.length) return candidates;
  const availLower = available.map((a) => a.toLowerCase());
  const isAvail = (c: string) => {
    const cl = c.toLowerCase();
    return availLower.some(
      (a) => a === cl || a.endsWith(`/${cl}`) || a.includes(cl),
    );
  };
  const matched = candidates.filter(isAvail);
  const rest = candidates.filter((c) => !isAvail(c));
  // Reorder only — never drop backups. ListModels via OpenAI compat is often incomplete
  // (e.g. only returns the primary), which previously left a single-model list.
  return matched.length ? [...matched, ...rest] : candidates;
}

/**
 * Tiny text-only call (no screenshots) to see if a model is accepting traffic
 * before we upload a multi‑MB vision payload.
 */
async function probeModelCapacity(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
}): Promise<{ ok: boolean; status: number; body: string; headers: Headers }> {
  const res = await fetch(
    geminiUrlWithKey(
      `${args.baseUrl.replace(/\/$/, "")}/chat/completions`,
      args.apiKey,
    ),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "x-goog-api-key": args.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: args.model,
        messages: [
          {
            role: "user",
            content: "Reply with exactly the word ok",
          },
        ],
        max_tokens: 8,
        temperature: 0,
        stream: false,
      }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  const body = await res.text();
  return { ok: res.ok, status: res.status, body, headers: res.headers };
}

/**
 * Walk candidates with a cheap preflight. Returns reordered list (ready first)
 * and which models were marked busy/unavailable.
 */
async function preflightPickModels(args: {
  baseUrl: string;
  apiKey: string;
  models: string[];
  onProgress: ProgressFn;
  rounds?: number;
}): Promise<{ models: string[]; ready: string[]; skipped: string[] }> {
  const rounds = args.rounds ?? 2;
  let pool = [...args.models];
  const skipped: string[] = [];
  const ready: string[] = [];

  for (let round = 1; round <= rounds && ready.length === 0 && pool.length; round++) {
    args.onProgress(
      "http",
      `Preflight round ${round}/${rounds}: probing models with a tiny text request (no screenshots yet)…`,
    );
    const stillBusy: string[] = [];

    for (const model of pool) {
      args.onProgress(
        "http",
        `Preflight → ${model} (checking high-demand / quota before upload)…`,
      );
      let result: Awaited<ReturnType<typeof probeModelCapacity>>;
      try {
        result = await probeModelCapacity({
          baseUrl: args.baseUrl,
          apiKey: args.apiKey,
          model,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        args.onProgress(
          "http",
          `Preflight ${model} network error (${msg.slice(0, 60)}) — trying next…`,
        );
        stillBusy.push(model);
        continue;
      }

      if (result.ok) {
        ready.push(model);
        args.onProgress(
          "http",
          `Preflight OK — ${model} is accepting requests. Will upload screenshots to this model first.`,
        );
        // Keep probing a couple backups so we have a warm failover list
        if (ready.length >= 2) break;
        continue;
      }

      if (isModelMissingError(result.status, result.body)) {
        skipped.push(model);
        args.onProgress(
          "http",
          `Preflight: ${model} not found — removed from list.`,
        );
        continue;
      }

      if (isHighDemandError(result.status, result.body)) {
        const advice = classifyGeminiQuotaError(
          result.status,
          result.body,
          result.headers,
          round,
        );
        stillBusy.push(model);
        args.onProgress(
          "http",
          `Preflight: ${model} busy (${advice.kind}, HTTP ${result.status}) — skipping before upload.`,
        );
        continue;
      }

      stillBusy.push(model);
      args.onProgress(
        "http",
        `Preflight: ${model} HTTP ${result.status} — trying next…`,
      );
    }

    pool = stillBusy;
    if (ready.length === 0 && pool.length && round < rounds) {
      const wait = clampWaitForJob(
        googleBackoffMs(round + 1),
        45_000,
        "capacity",
      );
      args.onProgress(
        "http",
        `All probed models busy — waiting ${Math.round(wait / 1000)}s then re-checking (still no screenshot upload)…`,
      );
      await sleep(wait);
    }
  }

  // Ready models first, then any remaining (last resort)
  const remaining = args.models.filter(
    (m) =>
      !ready.includes(m) &&
      !skipped.some((s) => s.toLowerCase() === m.toLowerCase()),
  );
  const ordered = [...ready, ...remaining];
  return { models: ordered.length ? ordered : args.models, ready, skipped };
}

export async function parseViaOpenAICompatible(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  images: string[];
  moduleHint: string;
  onProgress?: ProgressFn;
  useJsonFormat?: boolean;
}): Promise<unknown> {
  const progress = args.onProgress ?? (() => undefined);
  const useJsonFormat = args.useJsonFormat !== false;
  let models = buildModelCandidates(args.model, args.baseUrl);
  let modelIndex = 0;
  let currentModel = models[modelIndex]!;

  if (!args.apiKey || /paste-your|sk-qwen$|changeme|your-.*-key/i.test(args.apiKey)) {
    throw new Error(
      "No real API key in .env (LLM_API_KEY). Prefer a free Gemini key from https://aistudio.google.com/apikey — see docs/USER_GUIDE.md",
    );
  }

  if (/generativelanguage\.googleapis/i.test(args.baseUrl)) {
    progress("http", "Checking which Gemini models your key can use…");
    const available = await listGeminiModelIds(args.baseUrl, args.apiKey);
    if (available?.length) {
      const filtered = preferAvailableModels(models, available);
      if (filtered.length) {
        models = filtered;
        modelIndex = 0;
        currentModel = models[0]!;
        progress(
          "http",
          `Model preference order (available first): ${models.slice(0, 6).join(", ")}${models.length > 6 ? "…" : ""}`,
        );
      }
    }

    // Cheap text-only probes — never upload screenshots to a 503 model first.
    const pre = await preflightPickModels({
      baseUrl: args.baseUrl,
      apiKey: args.apiKey,
      models,
      onProgress: progress,
    });
    models = pre.models;
    modelIndex = 0;
    currentModel = models[0]!;
    if (!pre.ready.length) {
      progress(
        "http",
        `Preflight: no model was free (skipped busy: ${pre.skipped.concat(models).slice(0, 6).join(", ") || "all"}). Will still try with pacing — expect capacity errors if Google stays overloaded.`,
      );
    } else {
      progress(
        "http",
        `Preflight ready order: ${pre.ready.join(" → ")}` +
          (pre.skipped.length
            ? ` (removed: ${pre.skipped.join(", ")})`
            : ""),
      );
    }
  }

  progress(
    "http",
    `Selected ${currentModel} for vision upload` +
      (models.length > 1
        ? ` — failover: ${models.slice(1).join(", ")}`
        : "") +
      "…",
  );

  const approxMb = (
    args.images.reduce((n, u) => n + u.length, 0) /
    (1024 * 1024)
  ).toFixed(1);
  progress(
    "http",
    `Now uploading screenshots (~${approxMb} MB, ${args.images.length} image(s)) to ${currentModel}…`,
  );

  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: `${IELTS_PARSE_PROMPT_CHAT}\n\nModule hint: ${args.moduleHint}. Image count: ${args.images.length}. Images are attached as image_url parts — you MUST read them. Return valid JSON only.`,
    },
  ];
  for (const url of args.images) {
    content.push({ type: "image_url", image_url: { url } });
  }

  const started = Date.now();
  const maxAttempts = Math.max(
    Number(process.env.VISION_MAX_ATTEMPTS ?? 6),
    models.length + 2,
  );
  const requestTimeoutMs = Number(process.env.VISION_REQUEST_TIMEOUT_MS ?? 90_000);
  // Allow room for Google free-tier RPM backoff (up to ~60s × a few tries)
  const totalBudgetMs = Number(process.env.VISION_TOTAL_BUDGET_MS ?? 8 * 60_000);
  const deadline = started + totalBudgetMs;
  let attempt = 0;
  const triedModels = new Set<string>();
  const rpdExhausted = new Set<string>();
  let lastRequestAt = 0;
  const isGemini = /generativelanguage\.googleapis/i.test(args.baseUrl);

  if (isGemini) {
    progress(
      "http",
      `Quota plan (free-tier ballpark): ~${freeTierRpmForModel(currentModel)} RPM for ${currentModel}; spacing ≥${Math.round(minRequestGapMs(currentModel) / 1000)}s between calls. RPD is per-model and resets midnight PT.`,
    );
  }

  const tick = setInterval(() => {
    const s = Math.round((Date.now() - started) / 1000);
    const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    progress(
      "http",
      `Still waiting… ${s}s elapsed, ~${left}s left · model=${currentModel} · attempt ${Math.max(1, attempt)}`,
    );
  }, 3000);

  try {
    for (;;) {
      attempt += 1;
      const remaining = deadline - Date.now();
      if (attempt > maxAttempts || remaining < 5_000) {
        throw new Error(
          `Vision API timed out after ${attempt - 1} attempt(s) / ${Math.round((Date.now() - started) / 1000)}s` +
            ` (tried: ${[...triedModels].join(", ") || currentModel}). ` +
            `If RPD was exhausted, wait until midnight Pacific or enable billing in AI Studio.`,
        );
      }

      // Skip models that already hit daily quota this job
      if (rpdExhausted.size && rpdExhausted.size < models.length) {
        let guarded = 0;
        while (
          rpdExhausted.has((models[modelIndex] ?? "").toLowerCase()) &&
          guarded < models.length
        ) {
          modelIndex = (modelIndex + 1) % models.length;
          guarded += 1;
        }
      }
      if (models.every((m) => rpdExhausted.has(m.toLowerCase()))) {
        throw new Error(
          `Daily Gemini quota (RPD) exhausted on all tried models (${[...rpdExhausted].join(", ")}). Quotas reset at midnight Pacific Time — check AI Studio → Rate limits.`,
        );
      }

      currentModel = models[modelIndex] ?? currentModel;
      triedModels.add(currentModel);

      // Respect free-tier RPM by spacing requests
      if (isGemini && lastRequestAt > 0) {
        const gap = minRequestGapMs(currentModel);
        const since = Date.now() - lastRequestAt;
        if (since < gap) {
          const pause = Math.min(gap - since, Math.max(0, remaining - 5_000));
          if (pause > 200) {
            progress(
              "http",
              `RPM pacing (~${freeTierRpmForModel(currentModel)}/min) — waiting ${Math.round(pause / 1000)}s before next call…`,
            );
            await sleep(pause);
          }
        }
      }

      const payload: Record<string, unknown> = {
        model: currentModel,
        messages: [{ role: "user", content }],
        stream: false,
        temperature: 0.1,
      };
      if (useJsonFormat) {
        payload.response_format = { type: "json_object" };
      }

      progress(
        "http",
        attempt === 1
          ? `Uploading ${args.images.length} image(s) via ${currentModel}${useJsonFormat ? " (json mode)" : ""}…`
          : `Attempt ${attempt}/${maxAttempts} with ${currentModel} (~${Math.round((deadline - Date.now()) / 1000)}s budget)…`,
      );

      let res: Response;
      try {
        const thisTimeout = Math.min(
          requestTimeoutMs,
          Math.max(10_000, deadline - Date.now()),
        );
        lastRequestAt = Date.now();
        res = await fetch(
          geminiUrlWithKey(
            `${args.baseUrl.replace(/\/$/, "")}/chat/completions`,
            args.apiKey,
          ),
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${args.apiKey}`,
              "x-goog-api-key": args.apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(thisTimeout),
          },
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (
          /timeout|aborted|network|fetch failed|ECONNRESET|ETIMEDOUT|socket|UND_ERR/i.test(
            msg,
          )
        ) {
          if (attempt >= maxAttempts || Date.now() + 2000 >= deadline) {
            throw new Error(
              `Vision API request failed (${msg.slice(0, 120)}). Gave up after ${attempt} attempt(s) on ${[...triedModels].join(", ")}.`,
            );
          }
          if (modelIndex < models.length - 1) {
            modelIndex += 1;
            progress(
              "http",
              `Timeout on ${currentModel} — switching backup → ${models[modelIndex]}…`,
            );
          }
          const advice = classifyGeminiQuotaError(503, msg, null, attempt);
          const wait = clampWaitForJob(
            advice.waitMs,
            deadline - Date.now(),
            advice.kind,
          );
          progress(
            "http",
            `Network/timeout — retrying in ${Math.round(wait / 1000)}s…`,
          );
          if (wait > 0) await sleep(wait);
          continue;
        }
        throw e;
      }

      if (!res.ok) {
        const body = await res.text();
        if (
          useJsonFormat &&
          /response_format|unknown|unsupported|invalid|not support/i.test(body)
        ) {
          progress("http", "Provider rejected json mode — retrying without it…");
          return parseViaOpenAICompatible({ ...args, useJsonFormat: false });
        }

        if (isModelMissingError(res.status, body)) {
          const prev = currentModel;
          models = models.filter(
            (m) => m.toLowerCase() !== prev.toLowerCase(),
          );
          if (!models.length) {
            throw new Error(
              `No usable Gemini vision model left (last tried ${prev}). ` +
                `Set LLM_MODEL in AI Studio (e.g. gemini-2.5-flash or gemini-2.5-pro). Body: ${body.slice(0, 220)}`,
            );
          }
          modelIndex = Math.min(modelIndex, models.length - 1);
          progress(
            "http",
            `Model ${prev} not found — skipping to ${models[modelIndex]}…`,
          );
          continue;
        }

        if (isHighDemandError(res.status, body)) {
          const advice = classifyGeminiQuotaError(
            res.status,
            body,
            res.headers,
            attempt,
          );

          if (advice.kind === "rpd") {
            rpdExhausted.add(currentModel.toLowerCase());
          }

          if (advice.switchModel && models.length > 1) {
            const prev = currentModel;
            // Find next model that still has daily quota
            let next = (modelIndex + 1) % models.length;
            let guarded = 0;
            while (
              rpdExhausted.has(models[next]!.toLowerCase()) &&
              guarded < models.length
            ) {
              next = (next + 1) % models.length;
              guarded += 1;
            }
            if (
              !rpdExhausted.has(models[next]!.toLowerCase()) &&
              models[next]!.toLowerCase() !== prev.toLowerCase()
            ) {
              modelIndex = next;
              const wait = clampWaitForJob(
                advice.waitMs,
                deadline - Date.now(),
                advice.kind,
              );
              progress(
                "http",
                `${advice.detail} ${prev} → ${models[modelIndex]}` +
                  (wait > 500 ? ` (pause ${Math.round(wait / 1000)}s)` : ""),
              );
              if (wait > 0) await sleep(wait);
              continue;
            }
          }

          if (
            advice.stop ||
            attempt >= maxAttempts ||
            Date.now() + 2000 >= deadline ||
            (advice.kind === "rpd" && rpdExhausted.size >= models.length)
          ) {
            throw new Error(
              `Gemini quota blocked convert after ${attempt} attempt(s) ` +
                `(kind=${advice.kind}, tried ${[...triedModels].join(", ")}). ` +
                `Free-tier RPD resets midnight Pacific; RPM/TPM need short waits. ` +
                `See https://ai.google.dev/gemini-api/docs/rate-limits — Body: ${body.slice(0, 180)}`,
            );
          }

          const wait = clampWaitForJob(
            advice.waitMs,
            deadline - Date.now(),
            advice.kind,
          );
          progress(
            "http",
            `${advice.detail} retrying ${currentModel} in ${Math.round(wait / 1000)}s…`,
          );
          if (wait > 0) await sleep(wait);
          continue;
        }
        if (res.status === 403) {
          throw new Error(
            `Vision API HTTP 403 (forbidden). Often: (1) API key invalid/restricted in AI Studio, (2) proxy strips auth — set HTTPS_PROXY in .env and restart, (3) Google blocked the route. Body: ${body.slice(0, 280)}`,
          );
        }
        throw new Error(`Vision API HTTP ${res.status}: ${body.slice(0, 500)}`);
      }

      progress(
        "http",
        `Response received from ${currentModel} — repairing/parsing JSON if needed…`,
      );
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error("Empty response from vision API");
      return extractJson(text);
    }
  } finally {
    clearInterval(tick);
  }
}

async function dataUrlToTempFile(dataUrl: string, index: number): Promise<string> {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) throw new Error("Expected base64 data URL image");
  const ext = match[1].includes("png")
    ? "png"
    : match[1].includes("webp")
      ? "webp"
      : "jpg";
  const filePath = path.join(os.tmpdir(), `ielts-parse-${Date.now()}-${index}.${ext}`);
  fs.writeFileSync(filePath, Buffer.from(match[2], "base64"));
  return filePath;
}

function isLocalLlms2Api(baseUrl: string): boolean {
  return /localhost:300[0-9]|127\.0\.0\.1:300[0-9]/.test(baseUrl);
}

export { isLocalLlms2Api };

/**
 * Attach screenshots + one prompt to chat.qwen.ai, click Send (never type newlines).
 * LLMs2API HTTP path strips images and uses keyboard.type which splits on Enter — do not use it for vision.
 */
export async function parseViaPlaywright(args: {
  provider: string;
  stateDir?: string;
  model: string;
  images: string[];
  moduleHint: string;
  onProgress?: ProgressFn;
}): Promise<unknown> {
  const progress = args.onProgress ?? (() => undefined);
  const url = "https://chat.qwen.ai/";
  const statePath = args.stateDir
    ? path.join(args.stateDir, "browser-state.json")
    : undefined;

  const tempFiles: string[] = [];
  let browser: Browser | null = null;
  try {
    progress("playwright", "Writing temp image files…");
    for (let i = 0; i < args.images.length; i++) {
      tempFiles.push(await dataUrlToTempFile(args.images[i], i));
    }

    const browsersPath =
      process.env.PLAYWRIGHT_BROWSERS_PATH ||
      path.join(process.env.HOME || os.homedir(), ".cache/ms-playwright");

    progress(
      "playwright",
      `Launching Chromium (login state: ${statePath && fs.existsSync(statePath) ? "yes" : "no"})…`,
    );
    browser = await chromium.launch({
      // Never flash a window unless explicitly requested
      headless: process.env.PLAYWRIGHT_HEADED === "1" ? false : true,
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath },
    });
    const context = await browser.newContext(
      statePath && fs.existsSync(statePath)
        ? { storageState: statePath }
        : undefined,
    );
    const page = await context.newPage();
    progress("playwright", `Opening ${url}…`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(2500);

    // Start a fresh chat if possible so we don't fight an old thread
    const newChat = page.getByRole("button", { name: /new chat|新对话|新建/i }).first();
    if ((await newChat.count()) > 0) {
      await newChat.click().catch(() => undefined);
      await page.waitForTimeout(800);
    }

    progress("playwright", `Attaching ${tempFiles.length} image(s)…`);
    await attachImages(page, tempFiles, progress);
    await page.waitForTimeout(1500);

    const prompt = `${IELTS_PARSE_PROMPT_CHAT}\n\nModule hint: ${args.moduleHint}. There are ${args.images.length} attached image(s). Prefer vision model ${args.model} if a model picker exists.`;

    progress("playwright", "Inserting full prompt in one shot (no Enter typing)…");
    const input = await findComposer(page);
    await input.click({ timeout: 30000 });
    await setComposerText(page, input, prompt);

    // Verify text landed
    const len = await readComposerLength(page, input);
    progress("playwright", `Composer has ${len} characters — clicking Send…`);
    if (len < 50) {
      throw new Error("Prompt did not land in the Qwen composer");
    }

    await clickSend(page);
    await page.waitForTimeout(1000);

    // Confirm composer cleared / message sent
    const after = await readComposerLength(page, input);
    if (after > 50) {
      progress("playwright", "Composer still has text — retrying Send…");
      await clickSend(page);
      await page.waitForTimeout(1000);
    }

    progress(
      "playwright",
      "Waiting for Qwen JSON (can take several minutes; keep the browser window open)…",
    );
    const responseText = await waitForAssistantJson(page, 300000, (msg) =>
      progress("playwright", msg),
    );

    if (statePath) {
      await context.storageState({ path: statePath }).catch(() => undefined);
    }
    progress("playwright", "Extracting JSON from reply…");
    return extractJson(responseText);
  } finally {
    await browser?.close().catch(() => undefined);
    for (const f of tempFiles) fs.unlink(f, () => undefined);
  }
}

async function findComposer(page: Page): Promise<Locator> {
  const candidates = [
    page.locator("textarea").last(),
    page.locator('[contenteditable="true"]').last(),
    page.locator('[role="textbox"]').last(),
  ];
  for (const c of candidates) {
    if ((await c.count()) > 0) {
      try {
        await c.waitFor({ state: "visible", timeout: 5000 });
        return c;
      } catch {
        /* try next */
      }
    }
  }
  throw new Error("Could not find Qwen chat composer");
}

async function setComposerText(page: Page, input: Locator, text: string) {
  // Prefer execCommand/insertText so we never synthesize Enter keypresses
  await input.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(200);

  const ok = await page.evaluate((value) => {
    const el =
      (document.activeElement as HTMLElement | null) ||
      (document.querySelector("textarea") as HTMLElement | null) ||
      (document.querySelector('[contenteditable="true"]') as HTMLElement | null);
    if (!el) return false;
    el.focus();
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return el.value.length > 40;
    }
    // contenteditable
    try {
      document.execCommand("selectAll", false);
      const inserted = document.execCommand("insertText", false, value);
      if (inserted) return (el.innerText || "").length > 40;
    } catch {
      /* fall through */
    }
    el.innerText = value;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
    return (el.innerText || "").length > 40;
  }, text);

  if (!ok) {
    // Clipboard paste fallback (still no Enter)
    await page.evaluate(async (value) => {
      await navigator.clipboard.writeText(value);
    }, text);
    await input.click();
    await page.keyboard.press("Control+v");
    await page.waitForTimeout(400);
  }
}

async function readComposerLength(page: Page, input: Locator): Promise<number> {
  try {
    return await input.evaluate((el) => {
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        return el.value.length;
      }
      return (el.textContent || "").length;
    });
  } catch {
    return 0;
  }
}

async function clickSend(page: Page) {
  const selectors = [
    page.getByRole("button", { name: /send|submit|发送/i }),
    page.locator('button[type="submit"]'),
    page.locator('button[aria-label*="Send" i]'),
    page.locator('button[data-testid*="send" i]'),
  ];
  for (const btn of selectors) {
    if ((await btn.count()) > 0) {
      const target = btn.last();
      if (await target.isEnabled().catch(() => false)) {
        await target.click();
        return;
      }
    }
  }
  // Last resort: Meta+Enter / Ctrl+Enter (not plain Enter alone when possible)
  await page.keyboard.press("Control+Enter");
}

async function attachImages(
  page: Page,
  files: string[],
  progress: ProgressFn,
) {
  // 1) Direct file inputs
  const inputs = page.locator('input[type="file"]');
  const count = await inputs.count();
  if (count > 0) {
    // Use the last file input (usually the composer attach)
    await inputs.nth(count - 1).setInputFiles(files);
    progress("playwright", `setInputFiles on input[${count - 1}]`);
    await page.waitForTimeout(1200);
    if (await hasImagePreview(page)) return;
  }

  // 2) Click attach / upload / paperclip then set files via filechooser
  const attachBtn = page
    .getByRole("button", { name: /upload|attach|image|photo|picture|文件|图片|附件/i })
    .or(page.locator('button[aria-label*="upload" i]'))
    .or(page.locator('button[aria-label*="attach" i]'))
    .or(page.locator('button[aria-label*="image" i]'))
    .first();

  if ((await attachBtn.count()) > 0) {
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 8000 }).catch(() => null),
      attachBtn.click().catch(() => undefined),
    ]);
    if (chooser) {
      await chooser.setFiles(files);
      progress("playwright", "Attached via filechooser");
      await page.waitForTimeout(1500);
      if (await hasImagePreview(page)) return;
    }
    // After click, a new file input may appear
    const again = page.locator('input[type="file"]');
    if ((await again.count()) > 0) {
      await again.last().setInputFiles(files);
      progress("playwright", "Attached via post-click file input");
      await page.waitForTimeout(1500);
      if (await hasImagePreview(page)) return;
    }
  }

  // 3) Drop files onto the composer
  const composer = await findComposer(page);
  const box = await composer.boundingBox();
  if (box) {
    const dt = await page.evaluateHandle((paths) => {
      void paths;
      return new DataTransfer();
    }, files);
    // Playwright setInputFiles on a synthetic drop is limited; try CDP
    progress("playwright", "Trying drag-drop onto composer…");
    await page.dispatchEvent("textarea, [contenteditable='true'], [role='textbox']", "dragenter");
    await page.dispatchEvent("textarea, [contenteditable='true'], [role='textbox']", "dragover");
  }
  void box;

  // 4) Force-create a file input and upload
  const forced = await page.evaluate(() => {
    let input = document.querySelector(
      'input[type="file"][data-ielts-force="1"]',
    ) as HTMLInputElement | null;
    if (!input) {
      input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept = "image/*";
      input.dataset.ieltsForce = "1";
      input.style.position = "fixed";
      input.style.left = "0";
      input.style.top = "0";
      input.style.opacity = "0.01";
      input.style.zIndex = "999999";
      document.body.appendChild(input);
    }
    return true;
  });
  if (forced) {
    await page.locator('input[type="file"][data-ielts-force="1"]').setInputFiles(files);
    progress("playwright", "Forced file input set — if Qwen ignores it, attach manually in the open browser");
    await page.waitForTimeout(1500);
  }

  if (!(await hasImagePreview(page))) {
    progress(
      "playwright",
      "WARNING: no image preview detected. If the browser is open, attach the screenshots manually now, then wait.",
    );
    // Give the user 45s to attach manually if automation missed the control
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(3000);
      if (await hasImagePreview(page)) {
        progress("playwright", "Image preview detected");
        return;
      }
      progress("playwright", `Waiting for image attach… ${(i + 1) * 3}s`);
    }
    throw new Error(
      "Could not attach images to Qwen chat. In the opened browser, click the image/paperclip button, attach your screenshots, then retry convert.",
    );
  }
}

async function hasImagePreview(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll("img"));
    // Heuristic: thumbnails near composer often have blob: or data: src and small height
    return imgs.some((img) => {
      const src = img.getAttribute("src") || "";
      const h = img.getBoundingClientRect().height;
      return (
        h > 20 &&
        h < 400 &&
        (src.startsWith("blob:") ||
          src.startsWith("data:") ||
          /thumbnail|preview|upload/i.test(img.className) ||
          /thumbnail|preview|upload/i.test(img.parentElement?.className || ""))
      );
    });
  });
}

async function waitForAssistantJson(
  page: Page,
  timeoutMs: number,
  onTick?: (msg: string) => void,
): Promise<string> {
  const start = Date.now();
  let last = "";
  let ticks = 0;
  while (Date.now() - start < timeoutMs) {
    ticks += 1;
    const elapsed = Math.round((Date.now() - start) / 1000);
    onTick?.(`Waiting for JSON… ${elapsed}s (poll #${ticks})`);
    const text = await page.evaluate(() => {
      const nodes = Array.from(
        document.querySelectorAll("article, .markdown, .message, pre, code"),
      );
      const chunks = nodes
        .map((n) => n.textContent ?? "")
        .filter((t) => t.includes("{") && t.includes("module"));
      return chunks.at(-1) ?? "";
    });
    if (text && text.includes("{") && text.includes("}") && text === last) {
      await page.waitForTimeout(2500);
      const again = await page.evaluate(() => {
        const nodes = Array.from(
          document.querySelectorAll("article, .markdown, .message, pre, code"),
        );
        const chunks = nodes
          .map((n) => n.textContent ?? "")
          .filter((t) => t.includes("{") && t.includes("module"));
        return chunks.at(-1) ?? "";
      });
      if (again.includes("module") && again.includes("}")) return again;
    }
    last = text;
    await page.waitForTimeout(2500);
  }
  if (last.includes("{")) return last;
  throw new Error("Timed out waiting for Qwen JSON response");
}
