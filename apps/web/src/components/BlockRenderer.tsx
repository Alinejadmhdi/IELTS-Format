import type { Block, ImageRef, MatchingHeadingsBlock } from "@ielts/schema";
import { AnswerBox } from "./AnswerBox";
import { MatchingFromBox } from "./MatchingFromBox";
import { FlowChart } from "./FlowChart";
import {
  HeadingDropSlot,
  MatchingHeadingsList,
  slotsBeforeParagraph,
} from "./MatchingHeadings";
import {
  JudgmentChoice,
  judgmentOptionsFromKey,
} from "./JudgmentChoice";
import { TextWithAnswers } from "./TextWithAnswers";
import { HighlightableText } from "./HighlightableText";
import type { MarkResult } from "../lib/answerKey";
import type { AnswersMap, HighlightRange } from "../lib/persistence";
import { answerKey } from "../lib/persistence";

type Props = {
  block: Block;
  blockKey: string;
  answers: AnswersMap;
  onAnswer: (n: number, value: string) => void;
  highlights: HighlightRange[];
  onAddHighlight: (h: Omit<HighlightRange, "id">) => void;
  resolveImage: (image?: ImageRef) => string | undefined;
  marks?: Record<string, MarkResult> | null;
  matchingHeadings?: MatchingHeadingsBlock[];
};

export function BlockRenderer({
  block,
  blockKey,
  answers,
  onAnswer,
  highlights,
  onAddHighlight,
  resolveImage,
  marks,
  matchingHeadings = [],
}: Props) {
  const textProps = { highlights, onAddHighlight, marks };
  const reviewBanner = block.needsReview ? (
    <div className="needs-review" role="status">
      <p>
        This block may need a re-convert — some text looked incomplete after
        parsing.
      </p>
    </div>
  ) : null;

  switch (block.type) {
    case "form":
    case "notes":
      return (
        <div className="paper-form">
          {block.title && (
            <HighlightableText
              blockKey={`${blockKey}-title`}
              text={block.title}
              {...textProps}
              as="h3"
              className="form-title"
            />
          )}
          <dl className="form-rows">
            {block.rows.map((row, i) => (
              <div
                key={i}
                className={`form-row ${row.isExample ? "is-example" : ""}`}
              >
                {row.isExample && row.label && (
                  <p className="example-label">{row.label}</p>
                )}
                {!row.isExample && row.label && (
                  <HighlightableText
                    blockKey={`${blockKey}-row-${i}-label`}
                    text={row.label}
                    {...textProps}
                    as="dt"
                  />
                )}
                <dd>
                  <TextWithAnswers
                    parts={row.parts}
                    answers={answers}
                    onAnswer={onAnswer}
                    blockKey={`${blockKey}-row-${i}`}
                    {...textProps}
                  />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      );

    case "flowChart":
      return (
        <FlowChart
          block={block}
          blockKey={blockKey}
          answers={answers}
          onAnswer={onAnswer}
          highlights={highlights}
          onAddHighlight={onAddHighlight}
          marks={marks}
        />
      );

    case "example":
      return (
        <div className="example-box">
          {block.label && <strong>{block.label}</strong>}
          <TextWithAnswers
            parts={block.parts}
            answers={answers}
            onAnswer={onAnswer}
            blockKey={`${blockKey}-ex`}
            {...textProps}
          />
        </div>
      );

    case "sentences":
      return (
        <ol className="sentence-list">
          {block.items.map((item) => (
            <li key={item.questionNumber}>
              <TextWithAnswers
                parts={item.parts}
                answers={answers}
                onAnswer={onAnswer}
                blockKey={`${blockKey}-s-${item.questionNumber}`}
                {...textProps}
              />
            </li>
          ))}
        </ol>
      );

    case "table":
      return (
        <div className="table-wrap">
          {block.title && (
            <HighlightableText
              blockKey={`${blockKey}-table-title`}
              text={block.title}
              {...textProps}
              as="h3"
              className="form-title"
            />
          )}
          <table className="exam-table">
            {block.headers && (
              <thead>
                <tr>
                  {block.headers.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.cells.map((cell, ci) => (
                    <td key={ci}>
                      <TextWithAnswers
                        parts={cell.parts}
                        answers={answers}
                        onAnswer={onAnswer}
                        blockKey={`${blockKey}-c-${ri}-${ci}`}
                        {...textProps}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "map":
    case "plan":
    case "diagram": {
      const src = resolveImage(block.image);
      return (
        <div className="visual-block">
          {block.title && (
            <HighlightableText
              blockKey={`${blockKey}-vis-title`}
              text={block.title}
              {...textProps}
              as="h3"
              className="form-title"
            />
          )}
          {src && (
            <figure className="visual-figure">
              <img src={src} alt={block.title ?? block.type} />
            </figure>
          )}
          <ul className="label-list">
            {block.labels.map((label) => (
              <li key={label.questionNumber}>
                {label.promptBefore && (
                  <HighlightableText
                    blockKey={`${blockKey}-lb-${label.questionNumber}-before`}
                    text={`${label.promptBefore} `}
                    {...textProps}
                    as="span"
                  />
                )}
                <AnswerBox
                  questionNumber={label.questionNumber}
                  value={answers[answerKey(label.questionNumber)] ?? ""}
                  onChange={(v) => onAnswer(label.questionNumber, v)}
                  maxWords={label.maxWords}
                  width="md"
                  mark={marks?.[answerKey(label.questionNumber)]}
                />
                {label.promptAfter && (
                  <HighlightableText
                    blockKey={`${blockKey}-lb-${label.questionNumber}-after`}
                    text={` ${label.promptAfter}`}
                    {...textProps}
                    as="span"
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      );
    }

    case "multipleChoice": {
      const deco = resolveImage(block.decorativeImage);
      return (
        <div className={`mcq-block ${deco ? "with-deco" : ""}`}>
          <div className="mcq-main">
            {block.title && (
              <HighlightableText
                blockKey={`${blockKey}-mcq-title`}
                text={block.title}
                {...textProps}
                as="h3"
                className="form-title"
              />
            )}
            {block.questions.map((q) => (
              <div key={q.questionNumber} className="mcq-item">
                <HighlightableText
                  blockKey={`${blockKey}-mcq-${q.questionNumber}`}
                  text={`${q.questionNumber} ${q.stem}`}
                  {...textProps}
                  as="p"
                  className="mcq-stem"
                />
                <div className="mcq-answer-row">
                  <AnswerBox
                    questionNumber={q.questionNumber}
                    value={answers[answerKey(q.questionNumber)] ?? ""}
                    onChange={(v) => onAnswer(q.questionNumber, v)}
                    allowedValues={q.options.map((o) => o.letter)}
                    width="sm"
                    mark={marks?.[answerKey(q.questionNumber)]}
                  />
                </div>
                <ul className="mcq-options">
                  {q.options.map((o) => {
                    const selected =
                      (answers[answerKey(q.questionNumber)] ?? "").toUpperCase() ===
                      o.letter.toUpperCase();
                    return (
                      <li key={o.letter}>
                        <button
                          type="button"
                          className={`option-btn ${selected ? "selected" : ""}`}
                          onClick={() => onAnswer(q.questionNumber, o.letter)}
                        >
                          <strong>{o.letter}</strong>{" "}
                          <HighlightableText
                            blockKey={`${blockKey}-mcq-${q.questionNumber}-opt-${o.letter}`}
                            text={o.text}
                            {...textProps}
                            as="span"
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          {deco && (
            <figure className="deco-figure">
              <img src={deco} alt="" />
            </figure>
          )}
        </div>
      );
    }

    case "matchingFromBox":
      return (
        <MatchingFromBox
          block={block}
          blockKey={blockKey}
          answers={answers}
          onAnswer={onAnswer}
          highlights={highlights}
          onAddHighlight={onAddHighlight}
          marks={marks}
        />
      );

    case "matchingInformation": {
      const paragraphs =
        block.paragraphs && block.paragraphs.length >= 2
          ? block.paragraphs
          : Array.from({ length: 10 }, (_, i) => {
              const letter = String.fromCharCode(65 + i);
              return { letter, text: `Paragraph ${letter}` };
            });
      return (
        <div className="matching-information-block">
          {reviewBanner}
          <MatchingFromBox
            block={{
              type: "matchingFromBox",
              boxTitle: block.boxTitle ?? "Paragraphs",
              options: paragraphs,
              itemsTitle: block.itemsTitle,
              items: block.items.map((item) => ({
                ...item,
                text:
                  item.text?.trim() ||
                  `(Statement ${item.questionNumber} — re-convert to restore text)`,
              })),
              needsReview: block.needsReview,
            }}
            blockKey={blockKey}
            answers={answers}
            onAnswer={onAnswer}
            highlights={highlights}
            onAddHighlight={onAddHighlight}
            marks={marks}
            allowReuseLetters
            hint="Drag a paragraph letter onto each statement, or tap a letter then a question."
          />
        </div>
      );
    }

    case "matchingHeadings":
      return <MatchingHeadingsList block={block} />;

    case "multiSelectLetters":
      return (
        <div className="multi-select-block">
          <HighlightableText
            blockKey={`${blockKey}-ms-prompt`}
            text={block.prompt}
            {...textProps}
            as="p"
          />
          <p className="hint">
            Choose {block.selectCount} letter
            {block.selectCount === 1 ? "" : "s"} — one per answer box.
          </p>
          <ul className="mcq-options">
            {block.options.map((o) => (
              <li key={o.letter}>
                <strong>{o.letter}</strong>{" "}
                <HighlightableText
                  blockKey={`${blockKey}-ms-opt-${o.letter}`}
                  text={o.text}
                  {...textProps}
                  as="span"
                />
              </li>
            ))}
          </ul>
          <div className="multi-slots">
            {block.questionNumbers.map((n) => (
              <AnswerBox
                key={n}
                questionNumber={n}
                value={answers[answerKey(n)] ?? ""}
                onChange={(v) => onAnswer(n, v)}
                allowedValues={block.options.map((o) => o.letter)}
                width="sm"
                mark={marks?.[answerKey(n)]}
              />
            ))}
          </div>
        </div>
      );

    case "passage": {
      const figList = [
        ...(block.figures ?? []),
        ...(block.figure ? [block.figure] : []),
      ].filter((f, i, arr) => {
        const key = f.imageDataUrl ?? `i:${f.sourceIndex ?? -1}`;
        return arr.findIndex((x) => (x.imageDataUrl ?? `i:${x.sourceIndex ?? -1}`) === key) === i;
      });
      const footnoteLines = [
        ...(block.footnotes ?? []),
        ...(block.footnote ? [block.footnote] : []),
      ];

      return (
        <article className="passage-block">
          {block.title && (
            <HighlightableText
              blockKey={`${blockKey}-pass-title`}
              text={block.title}
              {...textProps}
              as="h2"
              className="passage-title"
            />
          )}
          {block.subtitle && (
            <HighlightableText
              blockKey={`${blockKey}-pass-subtitle`}
              text={block.subtitle}
              {...textProps}
              as="h3"
              className="passage-subtitle"
            />
          )}
          {block.guidance && (
            <HighlightableText
              blockKey={`${blockKey}-pass-guidance`}
              text={block.guidance}
              {...textProps}
              as="p"
              className="passage-guidance"
            />
          )}
          {figList.length > 0 && (
            <div className="passage-figures">
              {figList.map((figRef, fi) => {
                const src = resolveImage(figRef);
                if (!src) return null;
                return (
                  <figure key={fi} className="passage-figure">
                    <img
                      src={src}
                      alt={figRef.caption ?? block.title ?? "Passage illustration"}
                    />
                    {figRef.caption && (
                      <figcaption>{figRef.caption}</figcaption>
                    )}
                  </figure>
                );
              })}
            </div>
          )}
          <div className="passage-body">
            {block.paragraphs.map((p, i) => (
              <div key={i} className="passage-para-wrap">
                {slotsBeforeParagraph(matchingHeadings, i).map((slot) => (
                  <HeadingDropSlot
                    key={slot.questionNumber}
                    questionNumber={slot.questionNumber}
                    mark={marks?.[answerKey(slot.questionNumber)]}
                  />
                ))}
                <HighlightableText
                  blockKey={`${blockKey}-p-${i}`}
                  text={p}
                  {...textProps}
                  as="p"
                />
              </div>
            ))}
          </div>
          {footnoteLines.length > 0 && (
            <footer className="passage-footnotes">
              {footnoteLines.map((line, i) => (
                <HighlightableText
                  key={i}
                  blockKey={`${blockKey}-fn-${i}`}
                  text={line}
                  {...textProps}
                  as="p"
                  className="passage-footnote"
                />
              ))}
            </footer>
          )}
        </article>
      );
    }

    case "trueFalseNotGiven":
    case "yesNoNotGiven":
      return (
        <div className="tfng-block judgment-block">
          <ul className="tfng-key">
            {block.key.map((k) => (
              <li key={k.value}>
                <strong>{k.value}</strong> {k.meaning}
              </li>
            ))}
          </ul>
          <div className="judgment-list">
            {block.statements.map((s) => (
              <div key={s.questionNumber} className="judgment-row">
                <div className="judgment-statement">
                  <span className="q-chip" aria-hidden>
                    {s.questionNumber}
                  </span>
                  <HighlightableText
                    blockKey={`${blockKey}-tf-${s.questionNumber}`}
                    text={s.text}
                    {...textProps}
                    as="span"
                    className="judgment-text"
                  />
                </div>
                <JudgmentChoice
                  questionNumber={s.questionNumber}
                  value={answers[answerKey(s.questionNumber)] ?? ""}
                  options={judgmentOptionsFromKey(block.key)}
                  onChange={(v) => onAnswer(s.questionNumber, v)}
                  mark={marks?.[answerKey(s.questionNumber)]}
                />
              </div>
            ))}
          </div>
        </div>
      );

    case "classify":
      return (
        <div className="classify-block">
          {block.prompt && (
            <HighlightableText
              blockKey={`${blockKey}-cl-prompt`}
              text={block.prompt}
              {...textProps}
              as="p"
              className="instr"
            />
          )}
          <ul className="category-key">
            {block.categories.map((c) => (
              <li key={c.letter}>
                <strong>{c.letter}</strong>{" "}
                <HighlightableText
                  blockKey={`${blockKey}-cat-${c.letter}`}
                  text={c.text}
                  {...textProps}
                  as="span"
                />
              </li>
            ))}
          </ul>
          {block.listTitle && (
            <HighlightableText
              blockKey={`${blockKey}-list-title`}
              text={block.listTitle}
              {...textProps}
              as="h3"
            />
          )}
          <ol>
            {block.items.map((item) => (
              <li key={item.questionNumber}>
                <HighlightableText
                  blockKey={`${blockKey}-cl-${item.questionNumber}`}
                  text={item.text}
                  {...textProps}
                  as="span"
                />
                <AnswerBox
                  questionNumber={item.questionNumber}
                  value={answers[answerKey(item.questionNumber)] ?? ""}
                  onChange={(v) => onAnswer(item.questionNumber, v)}
                  allowedValues={block.categories.map((c) => c.letter)}
                  width="sm"
                  mark={marks?.[answerKey(item.questionNumber)]}
                />
              </li>
            ))}
          </ol>
        </div>
      );

    default:
      return null;
  }
}
