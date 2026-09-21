import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { MatchingHeadingsBlock } from "@ielts/schema";
import type { MarkResult } from "../lib/answerKey";
import type { AnswersMap } from "../lib/persistence";
import { answerKey } from "../lib/persistence";

type Ctx = {
  blocks: MatchingHeadingsBlock[];
  answers: AnswersMap;
  onAnswer: (n: number, value: string) => void;
  picked: string | null;
  setPicked: (id: string | null) => void;
  assign: (questionNumber: number, headingId: string) => void;
  headingById: Map<string, string>;
  blockForQuestion: Map<number, MatchingHeadingsBlock>;
};

const MatchingHeadingsContext = createContext<Ctx | null>(null);

export function MatchingHeadingsProvider({
  blocks,
  answers,
  onAnswer,
  children,
}: {
  blocks: MatchingHeadingsBlock[];
  answers: AnswersMap;
  onAnswer: (n: number, value: string) => void;
  children: ReactNode;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  const headingById = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of blocks) {
      for (const h of b.headings) map.set(h.id, h.text);
    }
    return map;
  }, [blocks]);

  const blockForQuestion = useMemo(() => {
    const map = new Map<number, MatchingHeadingsBlock>();
    for (const b of blocks) {
      for (const s of b.slots) map.set(s.questionNumber, b);
    }
    return map;
  }, [blocks]);

  const assign = (questionNumber: number, headingId: string) => {
    const block = blockForQuestion.get(questionNumber);
    if (!block) {
      onAnswer(questionNumber, headingId);
      setPicked(null);
      return;
    }
    for (const slot of block.slots) {
      const k = answerKey(slot.questionNumber);
      if (
        (answers[k] ?? "").trim() === headingId &&
        slot.questionNumber !== questionNumber
      ) {
        onAnswer(slot.questionNumber, "");
      }
    }
    onAnswer(questionNumber, headingId);
    setPicked(null);
  };

  const value = useMemo(
    () => ({
      blocks,
      answers,
      onAnswer,
      picked,
      setPicked,
      assign,
      headingById,
      blockForQuestion,
    }),
    [blocks, answers, onAnswer, picked, headingById, blockForQuestion],
  );

  return (
    <MatchingHeadingsContext.Provider value={value}>
      {children}
    </MatchingHeadingsContext.Provider>
  );
}

function useMatchingHeadings() {
  return useContext(MatchingHeadingsContext);
}

export function MatchingHeadingsList({ block }: { block: MatchingHeadingsBlock }) {
  const ctx = useMatchingHeadings();
  if (!ctx) return null;

  const used = new Map<string, number>();
  for (const slot of block.slots) {
    const v = (ctx.answers[answerKey(slot.questionNumber)] ?? "").trim();
    if (v) used.set(v, slot.questionNumber);
  }

  return (
    <div className="matching-headings">
      {block.listTitle && <h3 className="mh-list-title">{block.listTitle}</h3>}
      <p className="dnd-hint muted">
        Drag a heading into a numbered gap in the passage, or tap then tap a gap.
      </p>
      <ul className="heading-bank">
        {block.headings.map((h) => {
          const usedOn = used.get(h.id);
          const active = ctx.picked === h.id;
          return (
            <li key={h.id}>
              <button
                type="button"
                className={`heading-chip ${usedOn ? "used" : ""} ${active ? "active" : ""}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", h.id);
                  e.dataTransfer.effectAllowed = "move";
                  ctx.setPicked(null);
                }}
                onClick={() =>
                  ctx.setPicked(ctx.picked === h.id ? null : h.id)
                }
                aria-pressed={active}
              >
                <span className="heading-chip-text">{h.text}</span>
                {usedOn != null && (
                  <em className="used-badge">→{usedOn}</em>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function HeadingDropSlot({
  questionNumber,
  mark,
}: {
  questionNumber: number;
  mark?: MarkResult | null;
}) {
  const ctx = useMatchingHeadings();
  const [over, setOver] = useState(false);
  if (!ctx) return null;

  const value = (ctx.answers[answerKey(questionNumber)] ?? "").trim();
  const text = value ? ctx.headingById.get(value) : undefined;
  const status = mark
    ? mark.status === "correct"
      ? "mark-correct"
      : mark.status === "incorrect"
        ? "mark-incorrect"
        : mark.status === "blank"
          ? "mark-blank"
          : ""
    : "";

  return (
    <div
      className={`heading-slot ${value ? "filled" : ""} ${over ? "drag-over" : ""} ${status}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/plain");
        if (id) ctx.assign(questionNumber, id);
      }}
      onClick={() => {
        if (ctx.picked) {
          ctx.assign(questionNumber, ctx.picked);
          return;
        }
        if (value) ctx.onAnswer(questionNumber, "");
      }}
      role="button"
      tabIndex={0}
      aria-label={`Heading gap ${questionNumber}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (ctx.picked) ctx.assign(questionNumber, ctx.picked);
          else if (value) ctx.onAnswer(questionNumber, "");
        }
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          ctx.onAnswer(questionNumber, "");
        }
      }}
    >
      <span className="q-chip">{questionNumber}</span>
      {value ? (
        <span className="heading-slot-text">{text ?? value}</span>
      ) : (
        <span className="heading-slot-placeholder">Drop heading here</span>
      )}
    </div>
  );
}

/** Slots that should appear before a given passage paragraph index. */
export function slotsBeforeParagraph(
  blocks: MatchingHeadingsBlock[],
  paragraphIndex: number,
) {
  const out: Array<{ questionNumber: number }> = [];
  for (const b of blocks) {
    for (const s of b.slots) {
      if (s.beforeParagraph === paragraphIndex) {
        out.push({ questionNumber: s.questionNumber });
      }
    }
  }
  return out.sort((a, b) => a.questionNumber - b.questionNumber);
}
