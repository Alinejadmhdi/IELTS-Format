import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import { safeParseExamDocument, type ExamDocument } from "@ielts/schema";
import {
  parseViaOpenAICompatible,
  parseViaPlaywright,
  isLocalLlms2Api,
  geminiUrlWithKey,
} from "./vision.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_ENV = path.resolve(__dirname, "../../../.env");
dotenv.config({ path: ROOT_ENV });
dotenv.config();

function applyOutboundProxy() {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  if (proxyUrl) {
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
    console.log(`Using outbound proxy: ${proxyUrl}`);
  }
  return proxyUrl;
}
applyOutboundProxy();


const HOST = process.env.IELTS_HOST || process.env.BRIDGE_HOST || "127.0.0.1";
const PORT = Number(
  process.env.IELTS_PORT ?? process.env.BRIDGE_PORT ?? 8888,
);
const MODE = (process.env.BRIDGE_MODE ?? "http") as "http" | "playwright";
let LLM_BASE_URL =
  process.env.LLM_BASE_URL ??
  "https://generativelanguage.googleapis.com/v1beta/openai/";
let LLM_API_KEY = process.env.LLM_API_KEY ?? "";
let LLM_MODEL = process.env.LLM_MODEL ?? "gemini-3.6-flash";
const LLM_STATE_DIR = process.env.LLM_STATE_DIR || undefined;
const SERVE_WEB =
  process.env.SERVE_WEB === "1" ||
  process.env.SERVE_WEB === "true" ||
  process.env.NODE_ENV === "production";

type ProviderId = "gemini" | "openai" | "dashscope" | "custom";

const PROVIDER_PRESETS: Record<
  ProviderId,
  { label: string; baseUrl: string; model: string; tested: boolean; guideUrl?: string }
> = {
  gemini: {
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    model: "gemini-3.6-flash",
    tested: true,
    guideUrl: "https://aistudio.google.com/apikey",
  },
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    tested: false,
    guideUrl: "https://platform.openai.com/api-keys",
  },
  dashscope: {
    label: "DashScope / Qwen",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    model: "qwen-vl-plus",
    tested: false,
    guideUrl: "https://dashscope.console.aliyun.com/",
  },
  custom: {
    label: "Custom OpenAI-compatible",
    baseUrl: "",
    model: "gpt-4o",
    tested: false,
  },
};

function detectProviderId(baseUrl: string): ProviderId {
  if (/generativelanguage\.googleapis/i.test(baseUrl)) return "gemini";
  if (/api\.openai\.com/i.test(baseUrl)) return "openai";
  if (/dashscope/i.test(baseUrl)) return "dashscope";
  return "custom";
}

let PROVIDER_ID: ProviderId = detectProviderId(LLM_BASE_URL);

type JobStatus = "queued" | "running" | "done" | "error";

type Job = {
  id: string;
  status: JobStatus;
  step: string;
  detail: string;
  log: Array<{ at: string; step: string; detail: string }>;
  exam?: ExamDocument;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

const jobs = new Map<string, Job>();

function touch(
  job: Job,
  status: JobStatus,
  step: string,
  detail: string,
) {
  job.status = status;
  job.step = step;
  job.detail = detail;
  job.updatedAt = new Date().toISOString();
  job.log.push({ at: job.updatedAt, step, detail });
  if (job.log.length > 80) job.log.shift();
}

function detectProvider(baseUrl: string): string {
  return detectProviderId(baseUrl);
}

function writeEnvVars(updates: Record<string, string>) {
  const envPath = ROOT_ENV;
  let content = "";
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, "utf8");
  } else {
    const example = path.resolve(__dirname, "../../../.env.example");
    content = fs.existsSync(example)
      ? fs.readFileSync(example, "utf8")
      : "BRIDGE_MODE=http\n";
  }
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(content)) {
      content = content.replace(re, line);
    } else {
      content = `${content.trimEnd()}\n${line}\n`;
    }
  }
  fs.writeFileSync(envPath, content, "utf8");
}


function isPlaceholderKey(key: string): boolean {
  return !key || /paste-your|changeme|^sk-qwen$|your-.*-key/i.test(key);
}

async function probeVision(): Promise<{ ok: boolean; detail: string }> {
  if (isLocalLlms2Api(LLM_BASE_URL)) {
    try {
      const base = LLM_BASE_URL.replace(/\/v1\/?$/, "");
      const res = await fetch(`${base}/health`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) {
        return {
          ok: false,
          detail: `Local vision helper HTTP ${res.status} at ${base}/health`,
        };
      }
      const data = (await res.json()) as Record<string, unknown>;
      return {
        ok: true,
        detail: `Local vision helper ok (browser=${String(data.browser ?? "?")})`,
      };
    } catch (e) {
      return {
        ok: false,
        detail: `Local vision helper unreachable — ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  if (isPlaceholderKey(LLM_API_KEY)) {
    return {
      ok: false,
      detail:
        "No API key yet. Use the in-app Setup panel, or get a free Gemini key at https://aistudio.google.com/apikey",
    };
  }
  try {
    // Prefer ?key= for Gemini — many local proxies strip Authorization headers (→ HTML 403)
    const modelsUrl = geminiUrlWithKey(
      `${LLM_BASE_URL.replace(/\/$/, "")}/models`,
      LLM_API_KEY,
    );
    const res = await fetch(modelsUrl, {
      headers: {
        Authorization: `Bearer ${LLM_API_KEY}`,
        "x-goog-api-key": LLM_API_KEY,
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      const body = await res.text();
      const hint =
        res.status === 403
          ? " (403: key rejected, restricted, or proxy blocked Google — try a new AI Studio key, or set HTTPS_PROXY in .env)"
          : "";
      return {
        ok: false,
        detail: `Vision API check failed HTTP ${res.status}${hint}: ${body.slice(0, 160)}`,
      };
    }
    return {
      ok: true,
      detail: `Vision API reachable (model=${LLM_MODEL})`,
    };
  } catch (e) {
    return {
      ok: false,
      detail: `Vision API unreachable — ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

function writeEnvApiKey(apiKey: string) {
  writeEnvVars({ LLM_API_KEY: apiKey });
}

function createApiRouter() {
  const api = express.Router();

  api.get("/health", async (_req, res) => {
    const vision = await probeVision();
    const needsApiKey = isPlaceholderKey(LLM_API_KEY);
    res.json({
      ok: true,
      bridgeOk: true,
      visionOk: vision.ok,
      qwenOk: vision.ok,
      needsApiKey,
      detail: `bridge ok; ${vision.detail}`,
      mode: MODE,
      model: LLM_MODEL,
      provider: detectProvider(LLM_BASE_URL),
      providerId: PROVIDER_ID,
      baseUrl: LLM_BASE_URL,
      stateDir: MODE === "playwright" ? (LLM_STATE_DIR ?? null) : null,
      vision,
      settings: {
        providerId: PROVIDER_ID,
        model: LLM_MODEL,
        baseUrl: LLM_BASE_URL,
        httpProxy:
          process.env.HTTP_PROXY || process.env.http_proxy || "",
        httpsProxy:
          process.env.HTTPS_PROXY || process.env.https_proxy || "",
        providers: Object.entries(PROVIDER_PRESETS).map(([id, p]) => ({
          id,
          label: p.label,
          tested: p.tested,
          guideUrl: p.guideUrl,
          defaultModel: p.model,
          defaultBaseUrl: p.baseUrl,
        })),
      },
    });
  });

  api.post("/v1/settings/api-key", (req, res) => {
    const apiKey = String(req.body?.apiKey ?? "").trim();
    const httpProxy = String(req.body?.httpProxy ?? "").trim();
    const httpsProxy = String(
      req.body?.httpsProxy ?? req.body?.httpProxy ?? "",
    ).trim();
    const providerId = (String(req.body?.providerId ?? PROVIDER_ID).trim() ||
      "gemini") as ProviderId;
    const customBaseUrl = String(req.body?.baseUrl ?? "").trim();
    const customModel = String(req.body?.model ?? "").trim();

    if (isPlaceholderKey(apiKey) || apiKey.length < 16) {
      res.status(400).json({
        error:
          "Paste a real API key (Gemini recommended — get one at https://aistudio.google.com/apikey)",
      });
      return;
    }

    const preset = PROVIDER_PRESETS[providerId] ?? PROVIDER_PRESETS.gemini;
    const nextBase =
      providerId === "custom"
        ? customBaseUrl || LLM_BASE_URL
        : preset.baseUrl || LLM_BASE_URL;
    const nextModel =
      customModel ||
      (providerId === "custom" ? LLM_MODEL : preset.model) ||
      LLM_MODEL;

    if (providerId === "custom" && !nextBase) {
      res.status(400).json({ error: "Custom provider needs a base URL" });
      return;
    }

    try {
      const updates: Record<string, string> = {
        LLM_API_KEY: apiKey,
        LLM_BASE_URL: nextBase,
        LLM_MODEL: nextModel,
        BRIDGE_MODE: "http",
      };
      if (httpProxy) {
        updates.HTTP_PROXY = httpProxy;
        updates.http_proxy = httpProxy;
      }
      if (httpsProxy || httpProxy) {
        const p = httpsProxy || httpProxy;
        updates.HTTPS_PROXY = p;
        updates.https_proxy = p;
      }

      writeEnvVars(updates);

      LLM_API_KEY = apiKey;
      LLM_BASE_URL = nextBase;
      LLM_MODEL = nextModel;
      PROVIDER_ID = providerId;
      process.env.LLM_API_KEY = apiKey;
      process.env.LLM_BASE_URL = nextBase;
      process.env.LLM_MODEL = nextModel;

      if (httpProxy) {
        process.env.HTTP_PROXY = httpProxy;
        process.env.http_proxy = httpProxy;
      }
      if (httpsProxy || httpProxy) {
        const p = httpsProxy || httpProxy;
        process.env.HTTPS_PROXY = p;
        process.env.https_proxy = p;
      }
      applyOutboundProxy();

      res.json({
        ok: true,
        detail: "Settings saved",
        providerId,
        tested: preset.tested,
        warning: preset.tested
          ? undefined
          : "This provider has not been tested in this app — only Google Gemini was tested.",
      });
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : "Failed to write .env",
      });
    }
  });

  api.post("/v1/parse-exam/jobs", (req, res) => {
    const images = (req.body?.images ?? []) as string[];
    const moduleHint = (req.body?.moduleHint ?? "auto") as string;
    const model = (req.body?.model as string) || LLM_MODEL;

    if (!Array.isArray(images) || images.length === 0) {
      res.status(400).json({ error: "images[] required (data URLs)" });
      return;
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const job: Job = {
      id,
      status: "queued",
      step: "queued",
      detail: `Queued ${images.length} image(s)…`,
      log: [],
      createdAt: now,
      updatedAt: now,
    };
    touch(job, "queued", "queued", job.detail);
    jobs.set(id, job);
    res.status(202).json({ jobId: id, status: job.status, detail: job.detail });

    void runJob(job, images, moduleHint, model);
  });

  api.get("/v1/parse-exam/jobs/:id", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Unknown job id" });
      return;
    }
    res.json({
      id: job.id,
      status: job.status,
      step: job.step,
      detail: job.detail,
      log: job.log,
      exam: job.status === "done" ? job.exam : undefined,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  });

  api.post("/v1/parse-exam", async (req, res) => {
    const images = (req.body?.images ?? []) as string[];
    const moduleHint = (req.body?.moduleHint ?? "auto") as string;
    const model = (req.body?.model as string) || LLM_MODEL;
    if (!Array.isArray(images) || images.length === 0) {
      res.status(400).json({ error: "images[] required (data URLs)" });
      return;
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    const job: Job = {
      id,
      status: "queued",
      step: "queued",
      detail: "Running sync parse…",
      log: [],
      createdAt: now,
      updatedAt: now,
    };
    jobs.set(id, job);
    try {
      await runJob(job, images, moduleHint, model);
      if (job.status === "error") {
        res.status(500).json({ error: job.error, log: job.log });
        return;
      }
      res.json({
        exam: job.exam,
        mode: MODE,
        provider: detectProvider(LLM_BASE_URL),
        jobId: id,
      });
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : "parse failed",
      });
    }
  });

  return api;
}

async function runJob(
  job: Job,
  images: string[],
  moduleHint: string,
  model: string,
) {
  const onProgress = (step: string, detail?: string) => {
    touch(job, "running", step, detail ?? step);
  };

  try {
    touch(
      job,
      "running",
      "start",
      `Starting convert with ${images.length} image(s)…`,
    );
    const vision = await probeVision();
    touch(
      job,
      "running",
      "api-check",
      vision.ok ? vision.detail : `Warning: ${vision.detail}`,
    );

    const errors: string[] = [];
    let raw: unknown;

    const skipHttp = MODE === "playwright" && isLocalLlms2Api(LLM_BASE_URL);

    if (skipHttp) {
      touch(
        job,
        "running",
        "skip-http",
        "Skipping LLMs2API HTTP. Using Playwright…",
      );
      raw = await parseViaPlaywright({
        provider: "qwen",
        stateDir: LLM_STATE_DIR,
        model,
        images,
        moduleHint,
        onProgress,
      });
    } else {
      try {
        raw = await parseViaOpenAICompatible({
          baseUrl: LLM_BASE_URL,
          apiKey: LLM_API_KEY,
          model,
          images,
          moduleHint,
          onProgress,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(msg);
        touch(job, "running", "http-failed", `HTTP vision failed: ${msg}`);
        if (MODE !== "playwright") {
          throw e;
        }
        touch(
          job,
          "running",
          "fallback",
          "Falling back to Playwright…",
        );
        raw = await parseViaPlaywright({
          provider: "qwen",
          stateDir: LLM_STATE_DIR,
          model,
          images,
          moduleHint,
          onProgress,
        });
      }
    }

    touch(job, "running", "validate", "Validating exam JSON schema…");
    let parsed = safeParseExamDocument(raw);
    if (!parsed.success) {
      touch(
        job,
        "running",
        "repair",
        `First validation failed (${parsed.error.issues[0]?.message ?? "schema"}) — normalizing…`,
      );
      parsed = safeParseExamDocument(raw);
    }
    if (!parsed.success) {
      const issue = parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new Error(
        `Model JSON failed schema validation: ${issue}. Try Convert again, or use clearer screenshots.`,
      );
    }
    const exam = parsed.data;
    exam.sourceImages = images;
    job.exam = exam;
    touch(
      job,
      "done",
      "done",
      errors.length
        ? `Exam ready (via Playwright after HTTP miss). ${errors[0]}`
        : "Exam ready.",
    );
  } catch (e) {
    job.error = e instanceof Error ? e.message : String(e);
    touch(job, "error", "error", job.error);
  }
}

const app = express();
app.use(cors({ origin: [/localhost:\d+$/, /127\.0\.0\.1:\d+$/] }));
app.use(express.json({ limit: "40mb" }));

const api = createApiRouter();
app.use("/api", api);
// Compat for direct bridge URL (dev / old bookmarks)
app.use(api);

const webDist = path.resolve(__dirname, "../../web/dist");
const shouldServeWeb =
  SERVE_WEB || (fs.existsSync(webDist) && fs.existsSync(path.join(webDist, "index.html")));

if (shouldServeWeb && fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/v1") || req.path === "/health") {
      next();
      return;
    }
    res.sendFile(path.join(webDist, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.type("html").send(`<!doctype html><meta charset="utf-8"><title>IELTS Format</title>
  <body style="font-family:system-ui;padding:1.5rem;line-height:1.5">
  <h1>IELTS Format bridge</h1>
  <p>API is running. Build the UI (<code>npm run build</code>) or use <code>npm start</code>.</p>
  <ul>
    <li><a href="/api/health">/api/health</a></li>
    <li>Dev UI: <a href="http://127.0.0.1:5173">http://127.0.0.1:5173</a></li>
  </ul>
  </body>`);
  });
}

app.listen(PORT, HOST, () => {
  const url = `http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}/`;
  console.log(
    `IELTS Format on ${url} (mode=${MODE}, model=${LLM_MODEL}, provider=${detectProvider(LLM_BASE_URL)}, serveWeb=${shouldServeWeb && fs.existsSync(webDist)})`,
  );
});
