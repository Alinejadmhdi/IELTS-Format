import type { ExamDocument, ImageRef } from "@ielts/schema";
import { BlockRenderer } from "./BlockRenderer";
import { HighlightableText } from "./HighlightableText";
import type { MarkResult } from "../lib/answerKey";
import type { AnswersMap, HighlightRange } from "../lib/persistence";

type Props = {
  exam: ExamDocument;
  answers: AnswersMap;
  onAnswer: (n: number, value: string) => void;
  highlights: HighlightRange[];
  onAddHighlight: (h: Omit<HighlightRange, "id">) => void;
  onClearHighlights: () => void;
  imageUrls?: string[];
  marks?: Record<string, MarkResult> | null;
};

const listeningSampleImages = [
  "/samples/listening/s1-form.png",
  "/samples/listening/s1-map.png",
  "/samples/listening/s2-match-mcq.png",
  "/samples/listening/s3-mcq-multi.png",
  "/samples/listening/s3-table.png",
  "/samples/listening/s4-mcq.png",
  "/samples/listening/s4-diagram.png",
];

const readingSampleImages = [
  "/samples/reading/passage.png",
  "/samples/reading/questions.png",
];

export function ExamView({
  exam,
  answers,
  onAnswer,
  highlights,
  onAddHighlight,
  onClearHighlights,
  imageUrls,
  marks,
}: Props) {
  const defaults =
    exam.module === "reading" ? readingSampleImages : listeningSampleImages;
  const sources = imageUrls?.length
    ? imageUrls
    : exam.sourceImages?.length
      ? exam.sourceImages
      : defaults;

  const resolveImage = (image?: ImageRef) => {
    if (!image) return undefined;
    if (image.imageDataUrl) return image.imageDataUrl;
    if (typeof image.sourceIndex === "number" && sources[image.sourceIndex]) {
      return sources[image.sourceIndex];
    }
    return undefined;
  };

  return (
    <div className={`exam-paper module-${exam.module}`}>
      <div className="exam-toolbar">
        <span className="muted">
          Select any question or passage text to highlight ({highlights.length}{" "}
          active)
        </span>
        {highlights.length > 0 && (
          <button type="button" className="linkish" onClick={onClearHighlights}>
            Clear highlights
          </button>
        )}
      </div>
      {exam.title && (
        <HighlightableText
          blockKey={`${exam.id}-title`}
          text={exam.title}
          highlights={highlights}
          onAddHighlight={onAddHighlight}
          as="p"
          className="exam-kicker"
        />
      )}
      {exam.sections.map((section) => (
        <section key={section.id} className="exam-section">
          <header className="section-header">
            <HighlightableText
              blockKey={`${section.id}-heading`}
              text={section.heading}
              highlights={highlights}
              onAddHighlight={onAddHighlight}
              as="h2"
            />
            {section.questionRange && (
              <span className="range">Questions {section.questionRange}</span>
            )}
          </header>
          {section.groups.map((group) => (
            <div key={group.id} className="question-group">
              {group.heading && (
                <HighlightableText
                  blockKey={`${section.id}-${group.id}-heading`}
                  text={group.heading}
                  highlights={highlights}
                  onAddHighlight={onAddHighlight}
                  as="h3"
                  className="group-heading"
                />
              )}
              {group.instructions?.map((line, i) => (
                <HighlightableText
                  key={i}
                  blockKey={`${section.id}-${group.id}-instr-${i}`}
                  text={line}
                  highlights={highlights}
                  onAddHighlight={onAddHighlight}
                  as="p"
                  className="instruction"
                />
              ))}
              {group.wordLimit?.raw && (
                <HighlightableText
                  blockKey={`${section.id}-${group.id}-limit`}
                  text={group.wordLimit.raw}
                  highlights={highlights}
                  onAddHighlight={onAddHighlight}
                  as="p"
                  className="word-limit"
                />
              )}
              {group.blocks.map((block, bi) => (
                <BlockRenderer
                  key={`${group.id}-${bi}`}
                  block={block}
                  blockKey={`${section.id}-${group.id}-${bi}`}
                  answers={answers}
                  onAnswer={onAnswer}
                  highlights={highlights}
                  onAddHighlight={onAddHighlight}
                  resolveImage={resolveImage}
                  marks={marks}
                />
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
