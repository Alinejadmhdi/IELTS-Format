import type { MarkResult } from "../lib/answerKey";

type Props = {
  questionNumber: number;
  value: string;
  options: Array<{ value: string; label?: string }>;
  onChange: (value: string) => void;
  mark?: MarkResult | null;
  namePrefix?: string;
  /** When false, omit the chip (parent already shows the number). */
  showChip?: boolean;
};

function markClass(mark?: MarkResult | null): string {
  if (!mark) return "";
  if (mark.status === "correct") return "mark-correct";
  if (mark.status === "incorrect") return "mark-incorrect";
  if (mark.status === "blank") return "mark-blank";
  return "";
}

/** Inspera-style vertical radio choices (TRUE / FALSE / NOT GIVEN, etc.). */
export function JudgmentChoice({
  questionNumber,
  value,
  options,
  onChange,
  mark,
  namePrefix = "judgment",
  showChip = false,
}: Props) {
  const name = `${namePrefix}-${questionNumber}`;
  const status = markClass(mark);
  return (
    <div className={`judgment-item ${status}`}>
      {showChip && (
        <span className="q-chip" aria-hidden>
          {questionNumber}
        </span>
      )}
      <ul
        className="judgment-options"
        role="radiogroup"
        aria-label={`Question ${questionNumber}`}
      >
        {options.map((opt) => {
          const checked =
            value.trim().toUpperCase() === opt.value.toUpperCase();
          return (
            <li key={opt.value}>
              <label className={`judgment-option ${checked ? "selected" : ""}`}>
                <input
                  type="radio"
                  name={name}
                  value={opt.value}
                  checked={checked}
                  onChange={() => onChange(opt.value)}
                />
                <span>{opt.label ?? opt.value}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {mark?.status === "incorrect" && mark.expected?.length ? (
        <p className="key-expected">→ {mark.expected.join(" / ")}</p>
      ) : null}
    </div>
  );
}

export function judgmentOptionsFromKey(
  key: Array<{ value: string; meaning: string }>,
) {
  return key.map((k) => ({ value: k.value, label: k.value }));
}
