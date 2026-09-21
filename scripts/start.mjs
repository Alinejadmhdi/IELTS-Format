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

function newestMtime(dir, filter) {
  let newest = 0;
  if (!fs.existsSync(dir)) return 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const name of fs.readdirSync(cur)) {
      const full = path.join(cur, name);
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (name === "node_modules" || name === "dist" || name === ".git") continue;
        stack.push(full);
      } else if (!filter || filter(full)) {
        newest = Math.max(newest, st.mtimeMs);
      }
    }
  }
  return newest;
}

async function ensureBuild() {
  const distIndex = path.join(root, "apps", "web", "dist", "index.html");
  const webSrc = path.join(root, "apps", "web", "src");
  const webPublic = path.join(root, "apps", "web", "public");
  const webHtml = path.join(root, "apps", "web", "index.html");
  const schemaSrc = path.join(root, "packages", "schema", "src");

  const distTime = fs.existsSync(distIndex)
    ? fs.statSync(distIndex).mtimeMs
    : 0;
  const srcTime = Math.max(
    newestMtime(webSrc),
    newestMtime(webPublic),
    newestMtime(schemaSrc),
    fs.existsSync(webHtml) ? fs.statSync(webHtml).mtimeMs : 0,
  );

  if (distTime && distTime >= srcTime) return;

  console.log(distTime ? "Rebuilding UI (source changed)…" : "Building UI (first run)…");
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
