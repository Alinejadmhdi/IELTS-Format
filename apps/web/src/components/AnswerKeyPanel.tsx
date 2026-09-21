import { useMemo } from "react";
import type { AnswerKeyMap, MarkResult } from "../lib/answerKey";
import { parseAnswerKeyText, scoreMarks } from "../lib/answerKey";

type Props = {
  raw: string;
  onRawChange: (value: string) => void;
  parsedKey: AnswerKeyMap | null;
  marks: Record<string, MarkResult> | null;
  parseError: string | null;
  onParseAndCheck: () => void;
  onClearMarks: () => void;
  disabled?: boolean;
};

export function AnswerKeyPanel({
  raw,
  onRawChange,
  parsedKey,
  marks,
  parseError,
  onParseAndCheck,
  onClearMarks,
  disabled,
}: Props) {
  const score = marks ? scoreMarks(marks) : null;
  const live = useMemo(() => parseAnswerKeyText(raw), [raw]);
  const keyCount = live.count;
  const checkedCount = parsedKey ? Object.keys(parsedKey).length : 0;
  const missingNums = marks
    ? Object.entries(marks)
        .filter(([, m]) => m.status === "missing-key")
        .map(([n]) => n)
        .sort((a, b) => Number(a) - Number(b))
    : [];

  return (
    <aside className="answer-key-panel">
      <header>
        <h2>Answer key</h2>
        {keyCount > 0 && (
          <span className="muted">
            {keyCount} parsed
            {marks && checkedCount !== keyCount
              ? ` · last check ${checkedCount}`
              : ""}
          </span>
        )}
      </header>
      <p className="muted key-hint">
        Paste any answer-key text — one per line or glued (
        <code>14 A15 C</code>). Multi-select any-order groups work too (
        <code>38-40 B, C, F</code>). Use <code>/</code> for alternatives.
        Lines like <code>Question 13</code> are headers and ignored.
      </p>
      <textarea
        className="answer-key-input"
        value={raw}
        onChange={(e) => onRawChange(e.target.value)}
        placeholder={
          "Questions 11-15\n11 C\n12 B\n13 C\n14 A15 C\n38-40 B, C, F\nQuestions 16-20\n16F\n17A\n18C"
        }
        rows={14}
        spellCheck={false}
        disabled={disabled}
      />
      {parseError && <p className="error">{parseError}</p>}
      <div className="key-actions">
        <button
          type="button"
          className="primary"
          disabled={disabled || !raw.trim()}
          onClick={onParseAndCheck}
        >
          Check answers
        </button>
        {marks && (
          <button type="button" className="ghost" onClick={onClearMarks}>
            Clear marks
          </button>
        )}
      </div>
      {score && (
        <p className="score-line" aria-live="polite">
          <strong>{score.correct}</strong> correct · {score.incorrect} wrong ·{" "}
          {score.blank} blank
          {score.missingKey > 0
            ? ` · ${score.missingKey} no key (Q${missingNums.join(", Q")})`
            : ""}
          <span className="muted"> / {score.total}</span>
        </p>
      )}
      {raw.trim() && keyCount === 0 && (
        <p className="error">Could not parse any numbered answers.</p>
      )}
    </aside>
  );
}

/** Re-export for callers that want a one-shot parse preview. */
export { parseAnswerKeyText };
