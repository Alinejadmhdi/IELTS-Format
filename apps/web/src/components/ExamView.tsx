import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  Block,
  ExamDocument,
  ImageRef,
  MatchingHeadingsBlock,
  QuestionGroup,
  Section,
} from "@ielts/schema";
import { BlockRenderer } from "./BlockRenderer";
import { HighlightableText } from "./HighlightableText";
import { MatchingHeadingsProvider } from "./MatchingHeadings";
import type { MarkResult } from "../lib/answerKey";
import type { AnswersMap, HighlightRange } from "../lib/persistence";

type Props = {
  exam: ExamDocument;
  answers: AnswersMap;
  onAnswer: (n: number, value: string) => void;
  highlights: HighlightRange[];
  onAddHighlight: (h: Omit<HighlightRange, "id">) => void;
  onClearHighlights: () => void;
  onUndoHighlight?: () => void;
  canUndoHighlight?: boolean;
  imageUrls?: string[];
  marks?: Record<string, MarkResult> | null;
};

type SplitPiece = {
  section: Section;
  group: QuestionGroup;
  blocks: Block[];
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

function splitReading(exam: ExamDocument): {
  passages: SplitPiece[];
  questions: SplitPiece[];
  matchingHeadings: MatchingHeadingsBlock[];
} {
  const passages: SplitPiece[] = [];
  const questions: SplitPiece[] = [];
  const matchingHeadings: MatchingHeadingsBlock[] = [];
  for (const section of exam.sections) {
    for (const group of section.groups) {
      const passageBlocks = group.blocks.filter((b) => b.type === "passage");
      const otherBlocks = group.blocks.filter((b) => b.type !== "passage");
      for (const b of otherBlocks) {
        if (b.type === "matchingHeadings") matchingHeadings.push(b);
      }
      if (passageBlocks.length) {
        passages.push({ section, group, blocks: passageBlocks });
      }
      if (otherBlocks.length) {
        questions.push({ section, group, blocks: otherBlocks });
      }
    }
  }
  return { passages, questions, matchingHeadings };
}

export function ExamView({
  exam,
  answers,
  onAnswer,
  highlights,
  onAddHighlight,
  onClearHighlights,
  onUndoHighlight,
  canUndoHighlight,
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

  const readingSplit = useMemo(
    () => (exam.module === "reading" ? splitReading(exam) : null),
    [exam],
  );

  const [passRatio, setPassRatio] = useState(0.48);
  const splitRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current || !splitRef.current) return;
      const rect = splitRef.current.getBoundingClientRect();
      const next = (e.clientX - rect.left) / rect.width;
      setPassRatio(Math.min(0.72, Math.max(0.28, next)));
    }
    function onUp() {
      dragging.current = false;
      document.body.classList.remove("resizing-split");
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const startResize = useCallback((e: ReactPointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.classList.add("resizing-split");
  }, []);

  function renderBlocks(
    sectionId: string,
    groupId: string,
    blocks: Block[],
    matchingHeadings: MatchingHeadingsBlock[] = [],
  ) {
    return blocks.map((block, bi) => (
      <BlockRenderer
        key={`${groupId}-${bi}-${block.type}`}
        block={block}
        blockKey={`${sectionId}-${groupId}-${bi}`}
        answers={answers}
        onAnswer={onAnswer}
        highlights={highlights}
        onAddHighlight={onAddHighlight}
        resolveImage={resolveImage}
        marks={marks}
        matchingHeadings={matchingHeadings}
      />
    ));
  }

  function renderGroupChrome(section: Section, group: QuestionGroup) {
    return (
      <>
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
      </>
    );
  }

  function renderLinear() {
    return exam.sections.map((section) => (
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
            {renderGroupChrome(section, group)}
            {renderBlocks(section.id, group.id, group.blocks)}
          </div>
        ))}
      </section>
    ));
  }

  function renderReadingSplit() {
    if (!readingSplit) return null;
    const { passages, questions, matchingHeadings } = readingSplit;
    const firstSection = exam.sections[0];
    const partLabel =
      firstSection?.heading ||
      (firstSection?.questionRange
        ? `Questions ${firstSection.questionRange}`
        : "Reading");

    return (
      <MatchingHeadingsProvider
        blocks={matchingHeadings}
        answers={answers}
        onAnswer={onAnswer}
      >
        <div className="reading-part-bar">
          <strong>{partLabel}</strong>
          {firstSection?.questionRange && (
            <span>
              Read the text and answer questions {firstSection.questionRange}.
            </span>
          )}
        </div>
        <div
          className="reading-split"
          ref={splitRef}
          style={
            {
              "--pass-ratio": String(passRatio),
            } as CSSProperties
          }
        >
          <div className="reading-passage-col" aria-label="Reading passage">
            {passages.map(({ section, group, blocks }) => (
              <div
                key={`pass-${section.id}-${group.id}`}
                className="question-group"
              >
                {group.instructions?.map((line, i) => (
                  <HighlightableText
                    key={i}
                    blockKey={`${section.id}-${group.id}-pass-instr-${i}`}
                    text={line}
                    highlights={highlights}
                    onAddHighlight={onAddHighlight}
                    as="p"
                    className="instruction"
                  />
                ))}
                {renderBlocks(
                  section.id,
                  group.id,
                  blocks,
                  matchingHeadings,
                )}
              </div>
            ))}
            {!passages.length && (
              <p className="muted">No passage block found in this exam.</p>
            )}
          </div>

          <div
            className="reading-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize passage and questions"
            onPointerDown={startResize}
          >
            <span className="splitter-grip" aria-hidden />
          </div>

          <div className="reading-questions-col" aria-label="Reading questions">
            {questions.map(({ section, group, blocks }) => (
              <div
                key={`q-${section.id}-${group.id}`}
                className="question-group"
              >
                {renderGroupChrome(section, group)}
                {renderBlocks(section.id, `${group.id}-q`, blocks)}
              </div>
            ))}
          </div>
        </div>
      </MatchingHeadingsProvider>
    );
  }

  return (
    <div className={`exam-paper module-${exam.module}`}>
      <div className="exam-toolbar">
        <span className="muted">
          Select text to highlight ({highlights.length} active)
          {onUndoHighlight ? " · Ctrl+Z undo" : ""}
        </span>
        <span className="toolbar-actions">
          {canUndoHighlight && onUndoHighlight && (
            <button type="button" className="linkish" onClick={onUndoHighlight}>
              Undo highlight
            </button>
          )}
          {highlights.length > 0 && (
            <button
              type="button"
              className="linkish"
              onClick={onClearHighlights}
            >
              Clear highlights
            </button>
          )}
        </span>
      </div>
      {exam.title && exam.module !== "reading" && (
        <HighlightableText
          blockKey={`${exam.id}-title`}
          text={exam.title}
          highlights={highlights}
          onAddHighlight={onAddHighlight}
          as="p"
          className="exam-kicker"
        />
      )}
      {exam.module === "reading" && readingSplit
        ? renderReadingSplit()
        : renderLinear()}
    </div>
  );
}
