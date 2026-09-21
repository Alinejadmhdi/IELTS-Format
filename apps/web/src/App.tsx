import { useCallback, useEffect, useMemo, useState } from "react";
import type { ExamDocument } from "@ielts/schema";
import { AnswerKeyPanel } from "./components/AnswerKeyPanel";
import { ApiKeySetup } from "./components/ApiKeySetup";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { Dropzone } from "./components/Dropzone";
import { ExamView } from "./components/ExamView";
import { SettingsPanel } from "./components/SettingsPanel";
import {
  checkHealth,
  fileToDataUrl,
  loadSettings,
  parseExamWithProgress,
  saveSettings,
  type HealthInfo,
  type JobProgress,
  type Settings,
} from "./lib/api";
import {
  markAnswers,
  parseAnswerKeyText,
  type AnswerKeyMap,
  type MarkResult,
} from "./lib/answerKey";
import { collectAnyOrderGroups, collectQuestionNumbers } from "./lib/examQuestions";
import {
  addMergedHighlight,
  answerKey,
  clearPersistedForExam,
  savePersisted,
  withFreshAttemptId,
  type AnswersMap,
  type HighlightRange,
} from "./lib/persistence";
import { listeningDemo } from "./lib/demos/listeningDemo";
import { readingDemo } from "./lib/demos/readingDemo";
import {
  resolveTheme,
  toggleTheme,
  type Theme,
} from "./lib/theme";

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [theme, setTheme] = useState<Theme>(() => resolveTheme());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKeyOpen, setApiKeyOpen] = useState(false);
  const [apiKeyAutoShown, setApiKeyAutoShown] = useState(false);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [healthChecking, setHealthChecking] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [exam, setExam] = useState<ExamDocument | null>(null);
  const [imageUrls, setImageUrls] = useState<string[] | undefined>();
  const [answers, setAnswers] = useState<AnswersMap>({});
  const [highlights, setHighlights] = useState<HighlightRange[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answerKeyRaw, setAnswerKeyRaw] = useState("");
  const [parsedKey, setParsedKey] = useState<AnswerKeyMap | null>(null);
  const [marks, setMarks] = useState<Record<string, MarkResult> | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);

  const refreshHealth = useCallback(async () => {
    setHealthChecking(true);
    try {
      setHealth(await checkHealth(settings.bridgeUrl));
    } finally {
      setHealthChecking(false);
    }
  }, [settings.bridgeUrl]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    void refreshHealth();
    const id = window.setInterval(() => void refreshHealth(), 15000);
    return () => window.clearInterval(id);
  }, [refreshHealth]);

  useEffect(() => {
    if (!health || apiKeyAutoShown) return;
    if (health.needsApiKey || (!health.visionOk && health.bridgeOk)) {
      setApiKeyOpen(true);
      setApiKeyAutoShown(true);
    }
  }, [health, apiKeyAutoShown]);

  useEffect(() => {
    if (!exam) return;
    savePersisted({ examId: exam.id, answers, highlights });
  }, [exam, answers, highlights]);

  const answeredCount = useMemo(
    () => Object.values(answers).filter((v) => v.trim()).length,
    [answers],
  );

  function hydrateExam(next: ExamDocument, urls?: string[]) {
    // Each convert / sample open is a new blank attempt — never restore old answers
    clearPersistedForExam(next.id);
    const attempt: ExamDocument = {
      ...next,
      id: withFreshAttemptId(next),
    };
    setExam(attempt);
    setImageUrls(urls);
    setAnswers({});
    setHighlights([]);
    setMarks(null);
    setParsedKey(null);
    setKeyError(null);
    setError(null);
  }

  function onParseAndCheck() {
    if (!exam) {
      setKeyError("Load an exam first.");
      return;
    }
    const { key, count, anyOrderGroups } = parseAnswerKeyText(answerKeyRaw);
    setParsedKey(key);
    if (count === 0) {
      setMarks(null);
      setKeyError("Could not parse any numbered answers from the paste.");
      return;
    }
    setKeyError(null);
    const nums = collectQuestionNumbers(exam);
    setMarks(
      markAnswers(answers, key, nums, {
        anyOrderGroups,
        examAnyOrderGroups: collectAnyOrderGroups(exam),
      }),
    );
  }

  async function onConvert() {
    if (!previews.length) {
      setError("Add at least one screenshot first.");
      return;
    }
    setBusy(true);
    setError(null);
    setProgress({
      id: "local",
      status: "queued",
      step: "prepare",
      detail: "Preparing images…",
      log: [],
    });
    try {
      const dataUrls =
        previews[0]?.startsWith("data:") && previews.length === files.length
          ? previews
          : await Promise.all(files.map(fileToDataUrl));
      setProgress((p) =>
        p
          ? {
              ...p,
              step: "upload",
              detail: `Sending ${dataUrls.length} image(s) to bridge…`,
            }
          : p,
      );
      const parsed = await parseExamWithProgress({
        bridgeUrl: settings.bridgeUrl,
        images: dataUrls,
        model: settings.model,
        moduleHint: settings.moduleHint,
        onProgress: setProgress,
      });
      hydrateExam(parsed, dataUrls);
      void refreshHealth();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conversion failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="brand">IELTS Format</p>
          <p className="tagline">
            Screenshots → interactive Listening &amp; Reading paper
          </p>
        </div>
        <div className="top-actions">
          <button
            type="button"
            className="ghost theme-toggle"
            onClick={() => setTheme(toggleTheme(theme))}
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            title={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => setApiKeyOpen(true)}
          >
            API key
          </button>
          <button type="button" className="ghost" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => hydrateExam(listeningDemo)}
          >
            Sample Listening
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => hydrateExam(readingDemo)}
          >
            Sample Reading
          </button>
        </div>
      </header>

      <main className={`main-grid ${exam ? "with-key" : ""}`}>
        <section className="left-col">
          <ConnectionStatus
            health={health}
            healthChecking={healthChecking}
            onRefreshHealth={() => void refreshHealth()}
            onOpenApiKey={() => setApiKeyOpen(true)}
            progress={progress}
            busy={busy}
          />
          <Dropzone
            files={files}
            previews={previews}
            onFiles={(f, p) => {
              setFiles(f);
              setPreviews(p);
            }}
          />
          <div className="convert-row">
            <button
              type="button"
              className="primary"
              disabled={busy || !previews.length}
              onClick={() => void onConvert()}
            >
              {busy ? "Converting…" : "Convert to exam"}
            </button>
            {exam && (
              <span className="muted">
                {answeredCount} answer{answeredCount === 1 ? "" : "s"} saved locally
              </span>
            )}
          </div>
          {error && <p className="error">{error}</p>}
          <p className="tip">
            Select text in the paper to highlight. Convert can take several minutes
            while the vision API reads the screenshots — watch the status box above.
          </p>
        </section>

        <section className="right-col">
          {exam ? (
            <ExamView
              exam={exam}
              answers={answers}
              onAnswer={(n, v) => {
                setAnswers((prev) => ({ ...prev, [answerKey(n)]: v }));
                setMarks(null);
              }}
              highlights={highlights}
              onAddHighlight={(h) =>
                setHighlights((prev) => addMergedHighlight(prev, h))
              }
              onClearHighlights={() => setHighlights([])}
              imageUrls={imageUrls}
              marks={marks}
            />
          ) : (
            <div className="empty-exam">
              <p>No exam loaded yet.</p>
              <p>
                Drop or paste screenshots and convert, or open a sample Listening /
                Reading paper.
              </p>
            </div>
          )}
        </section>

        {exam && (
          <AnswerKeyPanel
            raw={answerKeyRaw}
            onRawChange={(v) => {
              setAnswerKeyRaw(v);
              setKeyError(null);
            }}
            parsedKey={parsedKey}
            marks={marks}
            parseError={keyError}
            onParseAndCheck={onParseAndCheck}
            onClearMarks={() => setMarks(null)}
          />
        )}
      </main>

      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onChange={setSettings}
        onOpenApiKey={() => setApiKeyOpen(true)}
      />
      <ApiKeySetup
        open={apiKeyOpen}
        bridgeUrl={settings.bridgeUrl}
        onClose={() => setApiKeyOpen(false)}
        onSaved={() => {
          void (async () => {
            await refreshHealth();
            const h = await checkHealth(settings.bridgeUrl);
            setHealth(h);
            if (h.visionOk) setApiKeyOpen(false);
          })();
        }}
      />
    </div>
  );
}
