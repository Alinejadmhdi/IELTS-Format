import { countWords } from "../lib/persistence";
import type { MarkResult } from "../lib/answerKey";

type Props = {
  questionNumber: number;
  value: string;
  onChange: (value: string) => void;
  maxWords?: number;
  allowNumber?: boolean;
  allowedValues?: string[];
  width?: "sm" | "md" | "lg";
  ariaLabel?: string;
  mark?: MarkResult | null;
};

const MIN_CH: Record<NonNullable<Props["width"]>, number> = {
  sm: 4,
  md: 8,
  lg: 14,
};

const MAX_CH: Record<NonNullable<Props["width"]>, number> = {
  sm: 14,
  md: 32,
  lg: 48,
};

function contentWidthCh(
  value: string,
  width: NonNullable<Props["width"]>,
  floorExtra = 1,
): number {
  const longest = Math.max(1, value.length);
  return Math.min(MAX_CH[width], Math.max(MIN_CH[width], longest + floorExtra));
}

function markClass(mark?: MarkResult | null): string {
  if (!mark) return "";
  if (mark.status === "correct") return "mark-correct";
  if (mark.status === "incorrect") return "mark-incorrect";
  if (mark.status === "blank") return "mark-blank";
  return "";
}

function markTitle(mark?: MarkResult | null): string | undefined {
  if (!mark?.expected?.length) return undefined;
  if (mark.status === "correct") return "Correct";
  if (mark.status === "incorrect" || mark.status === "blank") {
    return `Expected: ${mark.expected.join(" / ")}`;
  }
  return undefined;
}

export function AnswerBox({
  questionNumber,
  value,
  onChange,
  maxWords,
  allowNumber,
  allowedValues,
  width = "md",
  ariaLabel,
  mark,
}: Props) {
  const words = countWords(value);
  const over =
    typeof maxWords === "number" &&
    words > maxWords &&
    !(allowNumber && /^\d+(\.\d+)?%?$/.test(value.trim()));

  const statusClass = markClass(mark);
  const title = markTitle(mark);

  if (allowedValues && allowedValues.length > 0 && allowedValues.length <= 6) {
    const longestOption = Math.max(
      value.length,
      ...allowedValues.map((v) => v.length),
      1,
    );
    const selectCh = Math.min(
      MAX_CH[width],
      Math.max(MIN_CH[width], longestOption + 2),
    );
    return (
      <span className={`answer-wrap answer-${width} ${statusClass}`}>
        <span className="q-num" aria-hidden>
          {questionNumber}
        </span>
        <select
          className={`answer-box answer-select ${over ? "over-limit" : ""} ${statusClass}`}
          style={{ width: `${selectCh}ch` }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel ?? `Question ${questionNumber}`}
          title={title}
        >
          <option value="">—</option>
          {allowedValues.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </span>
    );
  }

  return (
    <span className={`answer-wrap answer-${width} ${statusClass}`}>
      <span className="q-num" aria-hidden>
        {questionNumber}
      </span>
      <input
        className={`answer-box ${over ? "over-limit" : ""} ${statusClass}`}
        style={{ width: `${contentWidthCh(value, width)}ch` }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel ?? `Question ${questionNumber}`}
        autoComplete="off"
        spellCheck
        title={title}
      />
      {over && (
        <span className="limit-hint" title={`Max ${maxWords} word(s)`}>
          over limit
        </span>
      )}
      {mark?.status === "incorrect" && mark.expected?.length ? (
        <span className="key-expected" title={mark.expected.join(" / ")}>
          → {mark.expected[0]}
          {mark.expected.length > 1 ? "…" : ""}
        </span>
      ) : null}
    </span>
  );
}
