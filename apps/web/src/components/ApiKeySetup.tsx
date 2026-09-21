import { useEffect, useState, type FormEvent } from "react";

type ProviderInfo = {
  id: string;
  label: string;
  tested: boolean;
  guideUrl?: string;
  defaultModel: string;
  defaultBaseUrl: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  bridgeUrl: string;
  initialError?: string | null;
};

export function ApiKeySetup({
  open,
  onClose,
  onSaved,
  bridgeUrl,
  initialError,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="api-key-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-title"
    >
      <div className="api-key-modal">
        <header>
          <h2 id="api-key-title">API &amp; connection setup</h2>
          <button type="button" className="linkish" onClick={onClose}>
            Close
          </button>
        </header>

        <p className="api-key-lead">
          Convert uses a vision API. <strong>Only Google Gemini has been tested</strong>{" "}
          in this app — other providers are optional and may not work.
        </p>

        <ApiKeyForm
          bridgeUrl={bridgeUrl}
          initialError={initialError}
          onSaved={onSaved}
        />
      </div>
    </div>
  );
}

function ApiKeyForm({
  bridgeUrl,
  initialError,
  onSaved,
}: {
  bridgeUrl: string;
  initialError?: string | null;
  onSaved: () => void;
}) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providerId, setProviderId] = useState("gemini");
  const [apiKey, setApiKey] = useState("");
  const [httpProxy, setHttpProxy] = useState("");
  const [httpsProxy, setHttpsProxy] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("gemini-3.6-flash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [ok, setOk] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const selected = providers.find((p) => p.id === providerId);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${bridgeUrl.replace(/\/$/, "")}/health`);
        if (!res.ok) return;
        const data = await res.json();
        const list = (data.settings?.providers ?? []) as ProviderInfo[];
        if (list.length) setProviders(list);
        if (data.settings?.providerId) setProviderId(String(data.settings.providerId));
        if (data.settings?.model) setModel(String(data.settings.model));
        if (data.settings?.baseUrl) setBaseUrl(String(data.settings.baseUrl));
        if (data.settings?.httpProxy) setHttpProxy(String(data.settings.httpProxy));
        if (data.settings?.httpsProxy) setHttpsProxy(String(data.settings.httpsProxy));
      } catch {
        /* ignore — form still usable with defaults */
        setProviders([
          {
            id: "gemini",
            label: "Google Gemini",
            tested: true,
            guideUrl: "https://aistudio.google.com/apikey",
            defaultModel: "gemini-3.6-flash",
            defaultBaseUrl:
              "https://generativelanguage.googleapis.com/v1beta/openai/",
          },
          {
            id: "openai",
            label: "OpenAI",
            tested: false,
            guideUrl: "https://platform.openai.com/api-keys",
            defaultModel: "gpt-4o",
            defaultBaseUrl: "https://api.openai.com/v1",
          },
          {
            id: "dashscope",
            label: "DashScope / Qwen",
            tested: false,
            defaultModel: "qwen-vl-plus",
            defaultBaseUrl:
              "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
          },
          {
            id: "custom",
            label: "Custom OpenAI-compatible",
            tested: false,
            defaultModel: "",
            defaultBaseUrl: "",
          },
        ]);
      }
    })();
  }, [bridgeUrl]);

  function onProviderChange(id: string) {
    setProviderId(id);
    const p = providers.find((x) => x.id === id);
    if (!p) return;
    if (p.defaultModel) setModel(p.defaultModel);
    if (p.defaultBaseUrl) setBaseUrl(p.defaultBaseUrl);
    setWarning(
      p.tested
        ? null
        : "This provider has not been tested — only Google Gemini was tested.",
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      const res = await fetch(
        `${bridgeUrl.replace(/\/$/, "")}/v1/settings/api-key`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: apiKey.trim(),
            httpProxy: httpProxy.trim(),
            httpsProxy: (httpsProxy.trim() || httpProxy.trim()),
            providerId,
            baseUrl: baseUrl.trim(),
            model: model.trim(),
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error || `Save failed (${res.status})`,
        );
      }
      const data = (await res.json()) as { warning?: string };
      setWarning(data.warning ?? null);
      setOk(true);
      setApiKey("");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="api-key-form" onSubmit={(e) => void onSubmit(e)}>
      <label>
        Provider
        <select
          value={providerId}
          onChange={(e) => onProviderChange(e.target.value)}
          disabled={busy}
        >
          {(providers.length
            ? providers
            : [{ id: "gemini", label: "Google Gemini", tested: true }]
          ).map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
              {p.tested ? " (tested)" : " (not tested)"}
            </option>
          ))}
        </select>
      </label>

      {selected && !selected.tested && (
        <p className="api-key-warn">
          Only <strong>Google Gemini</strong> has been tested in this project.
          Other providers are experimental.
        </p>
      )}

      {selected?.id === "gemini" && (
        <ol className="api-key-steps">
          <li>
            Open{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
            >
              Google AI Studio → API keys
            </a>
          </li>
          <li>Sign in with Google → Create API key → copy it</li>
          <li>Paste below. If Firefox uses a proxy, put the same proxy here too.</li>
        </ol>
      )}

      {selected?.guideUrl && (
        <p>
          <a
            className="file-btn"
            href={selected.guideUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open key page
          </a>
        </p>
      )}

      <label>
        API key
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste your API key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          disabled={busy}
        />
      </label>

      <label>
        Model
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={busy}
          placeholder="gemini-3.6-flash"
        />
      </label>

      {(providerId === "custom" || providerId !== "gemini") && (
        <label>
          Base URL
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            disabled={busy}
            placeholder="https://…"
          />
        </label>
      )}

      <fieldset className="proxy-fieldset">
        <legend>Outbound proxy (optional)</legend>
        <p className="muted small">
          Needed when the app server (not Firefox) must reach the API through a
          local proxy — e.g. <code>http://127.0.0.1:2080</code>
        </p>
        <label>
          HTTP proxy
          <input
            value={httpProxy}
            onChange={(e) => setHttpProxy(e.target.value)}
            disabled={busy}
            placeholder="http://127.0.0.1:2080"
            autoComplete="off"
          />
        </label>
        <label>
          HTTPS proxy
          <input
            value={httpsProxy}
            onChange={(e) => setHttpsProxy(e.target.value)}
            disabled={busy}
            placeholder="Same as HTTP if empty"
            autoComplete="off"
          />
        </label>
      </fieldset>

      <button type="submit" className="primary" disabled={busy || !apiKey.trim()}>
        {busy ? "Saving…" : "Save to .env"}
      </button>
      {ok && <p className="api-key-ok">Saved — checking connection…</p>}
      {warning && <p className="api-key-warn">{warning}</p>}
      {error && <p className="error">{error}</p>}
    </form>
  );
}
