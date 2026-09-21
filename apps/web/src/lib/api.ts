import type { ExamDocument } from "@ielts/schema";

export type Settings = {
  bridgeUrl: string;
  model: string;
  moduleHint: "auto" | "listening" | "reading";
};

export type HealthInfo = {
  ok: boolean;
  bridgeOk: boolean;
  visionOk: boolean;
  /** @deprecated use visionOk */
  qwenOk?: boolean;
  needsApiKey?: boolean;
  detail: string;
  mode?: string;
  model?: string;
  provider?: string;
  baseUrl?: string;
  stateDir?: string | null;
};

export type JobProgress = {
  id: string;
  status: "queued" | "running" | "done" | "error";
  step: string;
  detail: string;
  log: Array<{ at: string; step: string; detail: string }>;
  exam?: ExamDocument;
  error?: string;
};

const SETTINGS_KEY = "ielts-format:settings";

export const defaultSettings: Settings = {
  bridgeUrl: "/api",
  model: "gemini-3.6-flash",
  moduleHint: "auto",
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    const parsed = { ...defaultSettings, ...JSON.parse(raw) } as Settings;
    // Migrate old DashScope / Qwen / retired Gemini defaults left in the browser
    if (/qwen|dashscope|gemini-2\.0-flash/i.test(parsed.model)) {
      parsed.model = defaultSettings.model;
    }
    return parsed;
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function checkHealth(bridgeUrl: string): Promise<HealthInfo> {
  try {
    const res = await fetch(`${bridgeUrl.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      return {
        ok: false,
        bridgeOk: false,
        visionOk: false,
        detail: `Bridge HTTP ${res.status}`,
      };
    }
    const data = await res.json();
    const visionOk = Boolean(data.visionOk ?? data.qwenOk);
    return {
      ok: Boolean(data.ok) && visionOk,
      bridgeOk: Boolean(data.bridgeOk ?? data.ok),
      visionOk,
      qwenOk: visionOk,
      needsApiKey: Boolean(data.needsApiKey) || /no api key/i.test(String(data.detail ?? "")),
      detail: data.detail ?? JSON.stringify(data),
      mode: data.mode,
      model: data.model,
      provider: data.provider,
      baseUrl: data.baseUrl,
      stateDir: data.stateDir,
    };
  } catch (e) {
    return {
      ok: false,
      bridgeOk: false,
      visionOk: false,
      detail: e instanceof Error ? e.message : "Bridge unreachable",
    };
  }
}

export async function startParseJob(args: {
  bridgeUrl: string;
  images: string[];
  model: string;
  moduleHint: Settings["moduleHint"];
}): Promise<string> {
  const res = await fetch(
    `${args.bridgeUrl.replace(/\/$/, "")}/v1/parse-exam/jobs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: args.images,
        model: args.model,
        moduleHint: args.moduleHint,
      }),
    },
  );
  if (!res.ok && res.status !== 202) {
    throw new Error((await res.text()) || `Start job failed (${res.status})`);
  }
  const data = await res.json();
  return data.jobId as string;
}

export async function getParseJob(
  bridgeUrl: string,
  jobId: string,
): Promise<JobProgress> {
  const res = await fetch(
    `${bridgeUrl.replace(/\/$/, "")}/v1/parse-exam/jobs/${jobId}`,
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `Job status failed (${res.status})`);
  }
  return (await res.json()) as JobProgress;
}

export async function parseExamWithProgress(args: {
  bridgeUrl: string;
  images: string[];
  model: string;
  moduleHint: Settings["moduleHint"];
  onProgress: (job: JobProgress) => void;
  signal?: AbortSignal;
}): Promise<ExamDocument> {
  const jobId = await startParseJob(args);
  args.onProgress({
    id: jobId,
    status: "queued",
    step: "queued",
    detail: "Job started — polling bridge…",
    log: [],
  });

  const started = Date.now();
  const maxMs = 60 * 60 * 1000;

  while (Date.now() - started < maxMs) {
    if (args.signal?.aborted) throw new Error("Conversion cancelled");
    const job = await getParseJob(args.bridgeUrl, jobId);
    args.onProgress(job);
    if (job.status === "done" && job.exam) return job.exam;
    if (job.status === "error") {
      throw new Error(job.error || job.detail || "Conversion failed");
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error("Timed out waiting for convert job (60 minutes)");
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
