import type { TextPart } from "@ielts/schema";
import { AnswerBox } from "./AnswerBox";
import { HighlightableText } from "./HighlightableText";
import type { MarkResult } from "../lib/answerKey";
import type { AnswersMap, HighlightRange } from "../lib/persistence";
import { answerKey } from "../lib/persistence";

type Props = {
  parts: TextPart[];
  answers: AnswersMap;
  onAnswer: (n: number, value: string) => void;
  blockKey: string;
  highlights: HighlightRange[];
  onAddHighlight: (h: Omit<HighlightRange, "id">) => void;
  marks?: Record<string, MarkResult> | null;
  /**
   * When the same question number appears twice (e.g. "14 … and …"),
   * keep separate blank fields joined with " | " in the stored answer.
   */
  splitSharedQuestionBlanks?: boolean;
};

const BLANK_SEP = " | ";

function blankCounts(parts: TextPart[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const p of parts) {
    if (p.kind !== "answer") continue;
    counts.set(p.questionNumber, (counts.get(p.questionNumber) ?? 0) + 1);
  }
  return counts;
}

function slotValues(stored: string, count: number): string[] {
  if (count <= 1) return [stored];
  if (stored.includes(BLANK_SEP)) {
    const parts = stored.split(BLANK_SEP);
    while (parts.length < count) parts.push("");
    return parts.slice(0, count);
  }
  // Prefer splitting on " and " when migrating a single-box answer
  if (/\sand\s/i.test(stored)) {
    const parts = stored.split(/\sand\s/i);
    while (parts.length < count) parts.push("");
    return parts.slice(0, count);
  }
  const out = Array.from({ length: count }, () => "");
  out[0] = stored;
  return out;
}

function joinSlots(slots: string[]): string {
  return slots.map((s) => s.trim()).join(BLANK_SEP).replace(/(\s\|\s)+$/g, "");
}

export function TextWithAnswers({
  parts,
  answers,
  onAnswer,
  blockKey,
  highlights,
  onAddHighlight,
  marks,
  splitSharedQuestionBlanks = false,
}: Props) {
  const counts = blankCounts(parts);
  const seen = new Map<number, number>();

  return (
    <span className="inline-parts">
      {parts.map((part, i) => {
        if (part.kind === "text") {
          return (
            <HighlightableText
              key={i}
              blockKey={`${blockKey}-t-${i}`}
              text={part.text}
              highlights={highlights}
              onAddHighlight={onAddHighlight}
              as="span"
              className="part-text"
            />
          );
        }

        const n = part.questionNumber;
        const total = counts.get(n) ?? 1;
        const useSplit = splitSharedQuestionBlanks && total > 1;
        const slotIndex = seen.get(n) ?? 0;
        seen.set(n, slotIndex + 1);

        const key = answerKey(n);
        const stored = answers[key] ?? "";
        const slots = useSplit ? slotValues(stored, total) : [stored];
        const value = useSplit ? (slots[slotIndex] ?? "") : stored;

        return (
          <AnswerBox
            key={`a-${n}-${i}`}
            questionNumber={n}
            value={value}
            onChange={(v) => {
              if (!useSplit) {
                onAnswer(n, v);
                return;
              }
              const next = slotValues(stored, total);
              next[slotIndex] = v;
              onAnswer(n, joinSlots(next));
            }}
            maxWords={part.maxWords}
            allowNumber={part.allowNumber}
            allowedValues={part.allowedValues}
            width={part.width ?? (useSplit ? "sm" : undefined)}
            mark={marks?.[key]}
          />
        );
      })}
    </span>
  );
}
