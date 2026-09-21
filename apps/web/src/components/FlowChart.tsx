import type { FlowChartBlock } from "@ielts/schema";
import { TextWithAnswers } from "./TextWithAnswers";
import { HighlightableText } from "./HighlightableText";
import type { MarkResult } from "../lib/answerKey";
import type { AnswersMap, HighlightRange } from "../lib/persistence";

type Props = {
  block: FlowChartBlock;
  blockKey: string;
  answers: AnswersMap;
  onAnswer: (n: number, value: string) => void;
  highlights: HighlightRange[];
  onAddHighlight: (h: Omit<HighlightRange, "id">) => void;
  marks?: Record<string, MarkResult> | null;
};

/** Vertical IELTS flow-chart / process completion with connecting arrows. */
export function FlowChart({
  block,
  blockKey,
  answers,
  onAnswer,
  highlights,
  onAddHighlight,
  marks,
}: Props) {
  const textProps = { highlights, onAddHighlight, marks };

  return (
    <div className="flow-chart-block">
      {block.title && (
        <HighlightableText
          blockKey={`${blockKey}-fc-title`}
          text={block.title}
          {...textProps}
          as="h3"
          className="flow-chart-title"
        />
      )}
      <ol className="flow-chart-steps">
        {block.steps.map((step, i) => (
          <li key={i} className="flow-chart-step">
            <div className="flow-chart-node">
              <TextWithAnswers
                parts={step.parts}
                answers={answers}
                onAnswer={onAnswer}
                blockKey={`${blockKey}-step-${i}`}
                {...textProps}
                splitSharedQuestionBlanks
              />
            </div>
            {i < block.steps.length - 1 && (
              <div className="flow-chart-arrow" aria-hidden>
                ↓
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
