import type { Block, ImageRef } from "@ielts/schema";
import { AnswerBox } from "./AnswerBox";
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
}: Props) {
  if (block.needsReview) {
    return (
      <div className="needs-review">
        <p>This block may need manual review after conversion.</p>
      </div>
    );
  }

  const textProps = { highlights, onAddHighlight, marks };

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
        <div className="matching-block">
          <div className="option-box">
            {block.boxTitle && (
              <HighlightableText
                blockKey={`${blockKey}-box-title`}
                text={block.boxTitle}
                {...textProps}
                as="h3"
              />
            )}
            <ul>
              {block.options.map((o) => (
                <li key={o.letter}>
                  <strong>{o.letter}</strong>{" "}
                  <HighlightableText
                    blockKey={`${blockKey}-opt-${o.letter}`}
                    text={o.text}
                    {...textProps}
                    as="span"
                  />
                </li>
              ))}
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
            <ul>
              {block.items.map((item) => (
                <li key={item.questionNumber}>
                  <HighlightableText
                    blockKey={`${blockKey}-item-${item.questionNumber}`}
                    text={item.text}
                    {...textProps}
                    as="span"
                    className="item-text"
                  />
                  <AnswerBox
                    questionNumber={item.questionNumber}
                    value={answers[answerKey(item.questionNumber)] ?? ""}
                    onChange={(v) => onAnswer(item.questionNumber, v)}
                    allowedValues={block.options.map((o) => o.letter)}
                    width="sm"
                    mark={marks?.[answerKey(item.questionNumber)]}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      );

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
      const fig = resolveImage(block.figure);
      return (
        <article className="passage-block">
          {block.title && (
            <HighlightableText
              blockKey={`${blockKey}-pass-title`}
              text={block.title}
              {...textProps}
              as="h2"
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
          {fig && (
            <figure className="passage-figure">
              <img src={fig} alt={block.figure?.caption ?? "Passage figure"} />
              {block.figure?.caption && <figcaption>{block.figure.caption}</figcaption>}
            </figure>
          )}
          <div className="passage-body">
            {block.paragraphs.map((p, i) => (
              <HighlightableText
                key={i}
                blockKey={`${blockKey}-p-${i}`}
                text={p}
                {...textProps}
                as="p"
              />
            ))}
          </div>
        </article>
      );
    }

    case "trueFalseNotGiven":
    case "yesNoNotGiven":
      return (
        <div className="tfng-block">
          <ul className="tfng-key">
            {block.key.map((k) => (
              <li key={k.value}>
                <strong>{k.value}</strong> {k.meaning}
              </li>
            ))}
          </ul>
          <ol className="tfng-list">
            {block.statements.map((s) => (
              <li key={s.questionNumber}>
                <HighlightableText
                  blockKey={`${blockKey}-tf-${s.questionNumber}`}
                  text={s.text}
                  {...textProps}
                  as="p"
                />
                <AnswerBox
                  questionNumber={s.questionNumber}
                  value={answers[answerKey(s.questionNumber)] ?? ""}
                  onChange={(v) => onAnswer(s.questionNumber, v)}
                  allowedValues={block.key.map((k) => k.value)}
                  width="md"
                  mark={marks?.[answerKey(s.questionNumber)]}
                />
              </li>
            ))}
          </ol>
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
