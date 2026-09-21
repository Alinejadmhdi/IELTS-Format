import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { jsonrepair } from "jsonrepair";
import { chromium, type Browser, type Locator, type Page } from "playwright";
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

function backoffMs(attempt: number): number {
  // 2s, 4s, 8s … capped at 45s
  return Math.min(45_000, 2000 * 2 ** Math.min(attempt - 1, 5));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
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
  progress("http", `Calling vision API (${args.model}) at ${args.baseUrl}…`);

  if (!args.apiKey || /paste-your|sk-qwen$|changeme|your-.*-key/i.test(args.apiKey)) {
    throw new Error(
      "No real API key in .env (LLM_API_KEY). Prefer a free Gemini key from https://aistudio.google.com/apikey — see docs/USER_GUIDE.md",
    );
  }

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
  const tick = setInterval(() => {
    const s = Math.round((Date.now() - started) / 1000);
    progress(
      "http",
      `Still waiting for vision API… ${s}s (large screenshots can take 1–3 minutes)`,
    );
  }, 4000);

  const payload: Record<string, unknown> = {
    model: args.model,
    messages: [{ role: "user", content }],
    stream: false,
    temperature: 0.1,
  };
  if (useJsonFormat) {
    payload.response_format = { type: "json_object" };
  }

  let attempt = 0;
  try {
    for (;;) {
      attempt += 1;
      progress(
        "http",
        attempt === 1
          ? `Uploading ${args.images.length} image(s) + prompt${useJsonFormat ? " (json mode)" : ""}…`
          : `Retry #${attempt} after high-demand / overload…`,
      );

      let res: Response;
      try {
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
            signal: AbortSignal.timeout(8 * 60 * 1000),
          },
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Network blips / timeouts during overload — keep trying
        if (
          /timeout|network|fetch failed|ECONNRESET|ETIMEDOUT|socket|UND_ERR/i.test(
            msg,
          )
        ) {
          const wait = backoffMs(attempt);
          progress(
            "http",
            `Vision API network error (${msg.slice(0, 80)}) — retrying in ${Math.round(wait / 1000)}s…`,
          );
          await sleep(wait);
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
        if (isHighDemandError(res.status, body)) {
          const wait = backoffMs(attempt);
          progress(
            "http",
            `Gemini high demand / overloaded (HTTP ${res.status}) — retrying in ${Math.round(wait / 1000)}s (attempt ${attempt})…`,
          );
          await sleep(wait);
          continue;
        }
        if (res.status === 403) {
          throw new Error(
            `Vision API HTTP 403 (forbidden). Often: (1) API key invalid/restricted in AI Studio, (2) proxy strips auth — set HTTPS_PROXY in .env and restart, (3) Google blocked the route. Body: ${body.slice(0, 280)}`,
          );
        }
        throw new Error(`Vision API HTTP ${res.status}: ${body.slice(0, 500)}`);
      }

      progress("http", "Response received — repairing/parsing JSON if needed…");
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
