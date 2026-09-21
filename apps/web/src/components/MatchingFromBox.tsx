import { useMemo, useState } from "react";
import type { MatchingFromBoxBlock } from "@ielts/schema";
import { HighlightableText } from "./HighlightableText";
import type { MarkResult } from "../lib/answerKey";
import type { AnswersMap, HighlightRange } from "../lib/persistence";
import { answerKey } from "../lib/persistence";

type Props = {
  block: MatchingFromBoxBlock;
  blockKey: string;
  answers: AnswersMap;
  onAnswer: (n: number, value: string) => void;
  highlights: HighlightRange[];
  onAddHighlight: (h: Omit<HighlightRange, "id">) => void;
  marks?: Record<string, MarkResult> | null;
  /** When true, the same letter may answer multiple questions (matching information). */
  allowReuseLetters?: boolean;
  hint?: string;
};

function markClass(mark?: MarkResult | null): string {
  if (!mark) return "";
  if (mark.status === "correct") return "mark-correct";
  if (mark.status === "incorrect") return "mark-incorrect";
  if (mark.status === "blank") return "mark-blank";
  return "";
}

export function MatchingFromBox({
  block,
  blockKey,
  answers,
  onAnswer,
  highlights,
  onAddHighlight,
  marks,
  allowReuseLetters = false,
  hint,
}: Props) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [overSlot, setOverSlot] = useState<number | null>(null);

  const textProps = { highlights, onAddHighlight, marks };

  const usedLetters = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of block.items) {
      const v = (answers[answerKey(item.questionNumber)] ?? "")
        .trim()
        .toUpperCase();
      if (v) map.set(v, item.questionNumber);
    }
    return map;
  }, [answers, block.items]);

  function normalize(letter: string) {
    return letter.trim().toUpperCase();
  }

  function assign(questionNumber: number, letter: string) {
    const value = normalize(letter);
    if (!value) return;
    if (!allowReuseLetters) {
      for (const item of block.items) {
        const key = answerKey(item.questionNumber);
        if (
          (answers[key] ?? "").trim().toUpperCase() === value &&
          item.questionNumber !== questionNumber
        ) {
          onAnswer(item.questionNumber, "");
        }
      }
    }
    onAnswer(questionNumber, value);
    setPicked(null);
    setDragging(null);
    setOverSlot(null);
  }

  function clearSlot(questionNumber: number) {
    onAnswer(questionNumber, "");
  }

  function optionLabel(letter: string) {
    return (
      block.options.find((o) => normalize(o.letter) === normalize(letter))
        ?.text ?? ""
    );
  }

  return (
    <div className="matching-block matching-dnd">
      <div className="option-box">
        {block.boxTitle && (
          <HighlightableText
            blockKey={`${blockKey}-box-title`}
            text={block.boxTitle}
            {...textProps}
            as="h3"
          />
        )}
        <p className="dnd-hint muted">
          {hint ??
            "Drag a letter onto a question, or tap a letter then a slot."}
        </p>
        <ul className="dnd-options">
          {block.options.map((o) => {
            const letter = normalize(o.letter);
            const usedOn = allowReuseLetters
              ? undefined
              : usedLetters.get(letter);
            const isActive =
              dragging === letter || picked === letter;
            const label =
              o.text &&
              !new RegExp(`^paragraph\\s*${letter}$`, "i").test(o.text.trim())
                ? o.text
                : "";
            return (
              <li key={o.letter}>
                <button
                  type="button"
                  className={`dnd-chip ${usedOn ? "used" : ""} ${isActive ? "active" : ""}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", letter);
                    e.dataTransfer.effectAllowed = "move";
                    setDragging(letter);
                    setPicked(null);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setOverSlot(null);
                  }}
                  onClick={() =>
                    setPicked((prev) => (prev === letter ? null : letter))
                  }
                  aria-pressed={picked === letter}
                  aria-label={`${letter} ${label}${usedOn ? `, used on question ${usedOn}` : ""}`}
                >
                  <strong>{o.letter}</strong>
                  {label ? <span>{label}</span> : null}
                  {usedOn != null && (
                    <em className="used-badge" title={`Used on Q${usedOn}`}>
                      →{usedOn}
                    </em>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="match-items">
        {block.itemsTitle && (
          <HighlightableText
            blockKey={`${blockKey}-items-title`}
            text={block.itemsTitle}
            {...textProps}
            as="h3"
          />
        )}
        <ul className="dnd-targets">
          {block.items.map((item) => {
            const key = answerKey(item.questionNumber);
            const value = (answers[key] ?? "").trim().toUpperCase();
            const status = markClass(marks?.[key]);
            const isOver = overSlot === item.questionNumber;
            return (
              <li key={item.questionNumber}>
                <span className="q-num" aria-hidden>
                  {item.questionNumber}
                </span>
                <HighlightableText
                  blockKey={`${blockKey}-item-${item.questionNumber}`}
                  text={item.text}
                  {...textProps}
                  as="span"
                  className="item-text"
                />
                <div
                  className={`dnd-slot ${value ? "filled" : ""} ${isOver ? "drag-over" : ""} ${status}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setOverSlot(item.questionNumber);
                  }}
                  onDragLeave={() =>
                    setOverSlot((n) =>
                      n === item.questionNumber ? null : n,
                    )
                  }
                  onDrop={(e) => {
                    e.preventDefault();
                    const letter =
                      e.dataTransfer.getData("text/plain") || dragging;
                    if (letter) assign(item.questionNumber, letter);
                  }}
                  onClick={() => {
                    if (picked) {
                      assign(item.questionNumber, picked);
                      return;
                    }
                    if (value) clearSlot(item.questionNumber);
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={
                    value
                      ? `Question ${item.questionNumber} answer ${value}. Click to clear.`
                      : `Question ${item.questionNumber} drop zone`
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (picked) assign(item.questionNumber, picked);
                      else if (value) clearSlot(item.questionNumber);
                    }
                    if (e.key === "Backspace" || e.key === "Delete") {
                      e.preventDefault();
                      clearSlot(item.questionNumber);
                    }
                  }}
                >
                  {value ? (
                    <span className="slot-value" title={optionLabel(value)}>
                      {value}
                    </span>
                  ) : (
                    <span className="slot-placeholder">
                      {picked ? `Drop ${picked}` : "····"}
                    </span>
                  )}
                </div>
                {value && (
                  <button
                    type="button"
                    className="slot-clear linkish"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearSlot(item.questionNumber);
                    }}
                    aria-label={`Clear question ${item.questionNumber}`}
                  >
                    clear
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
