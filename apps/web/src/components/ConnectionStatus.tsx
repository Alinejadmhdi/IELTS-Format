import type { HealthInfo, JobProgress } from "../lib/api";

type Props = {
  health: HealthInfo | null;
  healthChecking: boolean;
  onRefreshHealth: () => void;
  onOpenApiKey?: () => void;
  progress: JobProgress | null;
  busy: boolean;
};

export function ConnectionStatus({
  health,
  healthChecking,
  onRefreshHealth,
  onOpenApiKey,
  progress,
  busy,
}: Props) {
  const bridgeOk = health?.bridgeOk ?? false;
  const visionOk = health?.visionOk ?? health?.qwenOk ?? false;

  return (
    <div className="connection-status">
      <div className="status-row">
        <span className={`pill ${bridgeOk ? "ok" : "bad"}`}>
          Bridge {bridgeOk ? "OK" : "DOWN"}
        </span>
        {visionOk ? (
          <span className="pill ok">API OK</span>
        ) : (
          <button
            type="button"
            className="pill bad pill-btn"
            onClick={onOpenApiKey}
            title="Set up API key"
          >
            API DOWN — set key
          </button>
        )}
        <button
          type="button"
          className="ghost compact"
          disabled={healthChecking}
          onClick={onRefreshHealth}
        >
          {healthChecking ? "Checking…" : "Recheck"}
        </button>
      </div>
      <p className="status-detail">
        {health?.detail ?? "Health not checked yet."}
      </p>
      {health && (
        <p className="status-meta muted">
          mode={health.mode ?? "?"} · model={health.model ?? "?"}
          {health.provider ? ` · ${health.provider}` : ""}
          {health.mode === "playwright"
            ? health.stateDir
              ? " · state set"
              : " · stateDir missing"
            : ""}
        </p>
      )}
      {(busy || progress) && (
        <div className="progress-box" aria-live="polite">
          <p className="progress-title">
            {busy ? "Converting…" : "Last convert"}
          </p>
          {progress && (
            <>
              <p className="progress-step">
                <strong>{progress.step}</strong> — {progress.detail}
              </p>
              <ol className="progress-log">
                {progress.log.slice(-8).map((line, i) => (
                  <li key={`${line.at}-${i}`}>
                    <span className="log-step">{line.step}</span> {line.detail}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}
