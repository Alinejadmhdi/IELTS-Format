#!/usr/bin/env node
/**
 * Cross-platform launcher (Windows + Debian/Ubuntu).
 * Builds the UI if needed, starts one local server, opens the browser.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

function loadDotEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function ensureEnv() {
  const envPath = path.join(root, ".env");
  const example = path.join(root, ".env.example");
  if (!fs.existsSync(envPath) && fs.existsSync(example)) {
    fs.copyFileSync(example, envPath);
    console.log("Created .env from .env.example — add your API key in the browser Setup panel.");
  }
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32",
      ...opts,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
    });
  });
}

async function ensureBuild() {
  const indexHtml = path.join(root, "apps", "web", "dist", "index.html");
  if (fs.existsSync(indexHtml)) return;
  console.log("Building UI (first run)…");
  await run("npm", ["run", "build"]);
}

function openBrowser(url) {
  const platform = process.platform;
  try {
    if (platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" });
    } else if (platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" });
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
    }
  } catch {
    console.log(`Open this URL in your browser: ${url}`);
  }
}

function waitForHealth(host, port, attempts = 40) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      const req = http.get(
        { host, port, path: "/api/health", timeout: 1500 },
        (res) => {
          res.resume();
          if (res.statusCode && res.statusCode < 500) resolve();
          else if (n >= attempts) reject(new Error("Server did not become healthy"));
          else setTimeout(tick, 400);
        },
      );
      req.on("error", () => {
        if (n >= attempts) reject(new Error("Server did not start"));
        else setTimeout(tick, 400);
      });
    };
    tick();
  });
}

async function main() {
  process.chdir(root);
  ensureEnv();
  loadDotEnv();

  const host = process.env.IELTS_HOST || "127.0.0.1";
  const port = Number(process.env.IELTS_PORT ?? process.env.BRIDGE_PORT ?? 8888);
  const openUrl = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}/`;

  await ensureBuild();

  const bridgeEntry = path.join(root, "apps", "bridge", "src", "index.ts");
  const tsxCli = require.resolve("tsx/cli", {
    paths: [path.join(root, "apps", "bridge"), root],
  });

  console.log(`Starting IELTS Format on ${openUrl}`);
  const child = spawn(
    process.execPath,
    [tsxCli, bridgeEntry],
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        SERVE_WEB: "1",
        IELTS_PORT: String(port),
        IELTS_HOST: host,
        BRIDGE_PORT: String(port),
      },
    },
  );

  const shutdown = () => {
    child.kill("SIGTERM");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    await waitForHealth(host === "0.0.0.0" ? "127.0.0.1" : host, port);
    openBrowser(openUrl);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
  }

  child.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
