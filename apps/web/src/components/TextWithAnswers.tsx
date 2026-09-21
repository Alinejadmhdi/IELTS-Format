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
};

export function TextWithAnswers({
  parts,
  answers,
  onAnswer,
  blockKey,
  highlights,
  onAddHighlight,
  marks,
}: Props) {
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
        return (
          <AnswerBox
            key={`a-${part.questionNumber}-${i}`}
            questionNumber={part.questionNumber}
            value={answers[answerKey(part.questionNumber)] ?? ""}
            onChange={(v) => onAnswer(part.questionNumber, v)}
            maxWords={part.maxWords}
            allowNumber={part.allowNumber}
            allowedValues={part.allowedValues}
            width={part.width}
            mark={marks?.[answerKey(part.questionNumber)]}
          />
        );
      })}
    </span>
  );
}
