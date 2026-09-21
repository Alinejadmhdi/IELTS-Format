import { z } from "zod";

/** Coerce model junk ("12", "Q12", null) into a finite positive int — never NaN. */
export function parseQuestionNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const m = value.trim().match(/(\d{1,3})/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
}

export const QuestionNumberSchema = z.preprocess((val) => {
  const n = parseQuestionNumber(val);
  return n ?? val;
}, z.number().int().positive());

export const WordLimitSchema = z.object({
  maxWords: z.number().optional(),
  allowNumber: z.boolean().optional(),
  raw: z.string().optional(),
});

export const AnswerSlotSchema = z.object({
  questionNumber: QuestionNumberSchema,
  maxWords: z.number().optional(),
  allowNumber: z.boolean().optional(),
  allowedValues: z.array(z.string()).optional(),
  placeholder: z.string().optional(),
});

export const TextPartSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({
    kind: z.literal("answer"),
    questionNumber: QuestionNumberSchema,
    maxWords: z.number().optional(),
    allowNumber: z.boolean().optional(),
    allowedValues: z.array(z.string()).optional(),
    width: z.enum(["sm", "md", "lg"]).optional(),
  }),
]);

export const FormRowSchema = z.object({
  label: z.string().optional(),
  parts: z.array(TextPartSchema),
  isExample: z.boolean().optional(),
});

export const OptionSchema = z.object({
  letter: z.string(),
  text: z.string(),
});

export const McqQuestionSchema = z.object({
  questionNumber: QuestionNumberSchema,
  stem: z.string(),
  options: z.array(OptionSchema),
});

export const LabelItemSchema = z.object({
  questionNumber: QuestionNumberSchema,
  promptBefore: z.string().optional(),
  promptAfter: z.string().optional(),
  maxWords: z.number().optional(),
});

export const TableCellSchema = z.object({
  parts: z.array(TextPartSchema),
});

export const TableRowSchema = z.object({
  cells: z.array(TableCellSchema),
});

export const CropBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

export const ImageRefSchema = z.object({
  imageDataUrl: z.string().optional(),
  sourceIndex: z.number().optional(),
  crop: CropBoxSchema.optional(),
  caption: z.string().optional(),
});

export const FormBlockSchema = z.object({
  type: z.literal("form"),
  title: z.string().optional(),
  rows: z.array(FormRowSchema),
  needsReview: z.boolean().optional(),
});

export const NotesBlockSchema = z.object({
  type: z.literal("notes"),
  title: z.string().optional(),
  rows: z.array(FormRowSchema),
  needsReview: z.boolean().optional(),
});

export const ExampleBlockSchema = z.object({
  type: z.literal("example"),
  label: z.string().optional(),
  parts: z.array(TextPartSchema),
  needsReview: z.boolean().optional(),
});

export const SentencesBlockSchema = z.object({
  type: z.literal("sentences"),
  items: z.array(
    z.object({
      questionNumber: QuestionNumberSchema,
      parts: z.array(TextPartSchema),
    }),
  ),
  needsReview: z.boolean().optional(),
});

export const TableBlockSchema = z.object({
  type: z.literal("table"),
  title: z.string().optional(),
  headers: z.array(z.string()).optional(),
  rows: z.array(TableRowSchema),
  needsReview: z.boolean().optional(),
});

const VisualLabelFields = {
  title: z.string().optional(),
  image: ImageRefSchema.optional(),
  labels: z.array(LabelItemSchema),
  needsReview: z.boolean().optional(),
};

export const MapBlockSchema = z.object({
  type: z.literal("map"),
  ...VisualLabelFields,
});

export const PlanBlockSchema = z.object({
  type: z.literal("plan"),
  ...VisualLabelFields,
});

export const DiagramBlockSchema = z.object({
  type: z.literal("diagram"),
  ...VisualLabelFields,
});

export const MultipleChoiceBlockSchema = z.object({
  type: z.literal("multipleChoice"),
  title: z.string().optional(),
  questions: z.array(McqQuestionSchema),
  decorativeImage: ImageRefSchema.optional(),
  needsReview: z.boolean().optional(),
});

export const MatchingFromBoxBlockSchema = z.object({
  type: z.literal("matchingFromBox"),
  boxTitle: z.string().optional(),
  options: z.array(OptionSchema),
  itemsTitle: z.string().optional(),
  items: z.array(
    z.object({
      questionNumber: QuestionNumberSchema,
      text: z.string(),
    }),
  ),
  needsReview: z.boolean().optional(),
});

export const MatchingHeadingsBlockSchema = z.object({
  type: z.literal("matchingHeadings"),
  listTitle: z.string().optional(),
  headings: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
    }),
  ),
  slots: z.array(
    z.object({
      questionNumber: QuestionNumberSchema,
      /** 0-based index: drop zone appears before this paragraph in the passage. */
      beforeParagraph: z.preprocess((v) => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : v; }, z.number().int().nonnegative()),
    }),
  ),
  needsReview: z.boolean().optional(),
});

/**
 * "Which paragraph contains the following information?"
 * Numbered statements on the questions side; answers are paragraph letters A–J.
 * Do NOT confuse with matchingHeadings (List of Headings / roman numerals).
 */
export const MatchingInformationBlockSchema = z.object({
  type: z.literal("matchingInformation"),
  boxTitle: z.string().optional(),
  /** Paragraph letters available as answers, e.g. A–J. */
  paragraphs: z.array(OptionSchema).optional(),
  itemsTitle: z.string().optional(),
  items: z.array(
    z.object({
      questionNumber: QuestionNumberSchema,
      text: z.string(),
    }),
  ),
  needsReview: z.boolean().optional(),
});

export const MultiSelectLettersBlockSchema = z.object({
  type: z.literal("multiSelectLetters"),
  selectCount: z.preprocess((v) => { const n = parseQuestionNumber(v); return n ?? v; }, z.number().int().positive()),
  prompt: z.string(),
  options: z.array(OptionSchema),
  questionNumbers: z.array(QuestionNumberSchema),
  needsReview: z.boolean().optional(),
});

export const PassageBlockSchema = z.object({
  type: z.literal("passage"),
  /** Main passage title (e.g. article headline). */
  title: z.string().optional(),
  /** Line under the title (byline, section label, etc.). */
  subtitle: z.string().optional(),
  guidance: z.string().optional(),
  paragraphs: z.array(z.string()),
  /** Primary illustration / photo in the passage. */
  figure: ImageRefSchema.optional(),
  /** Extra illustrations (diagrams, photos) with captions. */
  figures: z.array(ImageRefSchema).optional(),
  /** Single footnote / source line under the passage. */
  footnote: z.string().optional(),
  /** Multiple footnotes when the paper has several. */
  footnotes: z.array(z.string()).optional(),
  needsReview: z.boolean().optional(),
});

const JudgmentFields = {
  key: z.array(z.object({ value: z.string(), meaning: z.string() })),
  statements: z.array(
    z.object({
      questionNumber: QuestionNumberSchema,
      text: z.string(),
    }),
  ),
  needsReview: z.boolean().optional(),
};

export const TfngBlockSchema = z.object({
  type: z.literal("trueFalseNotGiven"),
  ...JudgmentFields,
});

export const YnngBlockSchema = z.object({
  type: z.literal("yesNoNotGiven"),
  ...JudgmentFields,
});

export const ClassifyBlockSchema = z.object({
  type: z.literal("classify"),
  prompt: z.string().optional(),
  categories: z.array(OptionSchema),
  listTitle: z.string().optional(),
  items: z.array(
    z.object({
      questionNumber: QuestionNumberSchema,
      text: z.string(),
    }),
  ),
  needsReview: z.boolean().optional(),
});

export const BlockSchema = z.discriminatedUnion("type", [
  FormBlockSchema,
  NotesBlockSchema,
  ExampleBlockSchema,
  SentencesBlockSchema,
  TableBlockSchema,
  MapBlockSchema,
  PlanBlockSchema,
  DiagramBlockSchema,
  MultipleChoiceBlockSchema,
  MatchingFromBoxBlockSchema,
  MatchingHeadingsBlockSchema,
  MatchingInformationBlockSchema,
  MultiSelectLettersBlockSchema,
  PassageBlockSchema,
  TfngBlockSchema,
  YnngBlockSchema,
  ClassifyBlockSchema,
]);

export const QuestionGroupSchema = z.object({
  id: z.string(),
  heading: z.string().optional(),
  instructions: z.array(z.string()).optional(),
  wordLimit: WordLimitSchema.optional(),
  blocks: z.array(BlockSchema),
});

export const SectionSchema = z.object({
  id: z.string(),
  heading: z.string(),
  questionRange: z.string().optional(),
  groups: z.array(QuestionGroupSchema),
});

export const ExamDocumentSchema = z.object({
  id: z.string(),
  module: z.enum(["listening", "reading", "unknown"]),
  title: z.string().optional(),
  sections: z.array(SectionSchema),
  sourceImages: z.array(z.string()).optional(),
});

export type TextPart = z.infer<typeof TextPartSchema>;
export type FormRow = z.infer<typeof FormRowSchema>;
export type Block = z.infer<typeof BlockSchema>;
export type MatchingFromBoxBlock = z.infer<typeof MatchingFromBoxBlockSchema>;
export type MatchingHeadingsBlock = z.infer<typeof MatchingHeadingsBlockSchema>;
export type MatchingInformationBlock = z.infer<
  typeof MatchingInformationBlockSchema
>;
export type QuestionGroup = z.infer<typeof QuestionGroupSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type ExamDocument = z.infer<typeof ExamDocumentSchema>;
export type AnswerSlot = z.infer<typeof AnswerSlotSchema>;
export type Option = z.infer<typeof OptionSchema>;
export type ImageRef = z.infer<typeof ImageRefSchema>;
export type CropBox = z.infer<typeof CropBoxSchema>;

/** Qwen often returns null for optional fields — strip before Zod. */
export function stripNulls(value: unknown): unknown {
  if (value === null) return undefined;
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === null) continue;
      out[k] = stripNulls(v);
    }
    return out;
  }
  return value;
}

/** Fix answer TextParts with missing/NaN questionNumbers before Zod runs. */
export function sanitizeTextParts(parts: unknown): unknown[] {
  if (!Array.isArray(parts)) return [];
  const out: unknown[] = [];
  for (const raw of parts) {
    if (!raw || typeof raw !== "object") continue;
    const p = { ...(raw as Record<string, unknown>) };
    const kind = p.kind;
    if (kind === "text") {
      out.push({ kind: "text", text: String(p.text ?? "") });
      continue;
    }
    // answer (or missing kind with questionNumber)
    if (kind === "answer" || p.questionNumber != null || p.question_number != null) {
      const n = parseQuestionNumber(p.questionNumber ?? p.question_number);
      if (n == null) {
        // Bad blank — keep as a visible gap, don't fail the whole exam
        out.push({ kind: "text", text: "……" });
        continue;
      }
      out.push({
        kind: "answer",
        questionNumber: n,
        ...(typeof p.maxWords === "number" ? { maxWords: p.maxWords } : {}),
        ...(typeof p.allowNumber === "boolean"
          ? { allowNumber: p.allowNumber }
          : {}),
        ...(Array.isArray(p.allowedValues)
          ? { allowedValues: p.allowedValues }
          : {}),
        ...(p.width === "sm" || p.width === "md" || p.width === "lg"
          ? { width: p.width }
          : {}),
      });
      continue;
    }
    if (typeof p.text === "string") {
      out.push({ kind: "text", text: p.text });
    }
  }
  return out;
}

function sanitizeQuestionNumberField(
  obj: Record<string, unknown>,
  key = "questionNumber",
): boolean {
  const n = parseQuestionNumber(obj[key]);
  if (n == null) return false;
  obj[key] = n;
  return true;
}

function sanitizeBlockDeep(block: Record<string, unknown>) {
  if (Array.isArray(block.parts)) {
    block.parts = sanitizeTextParts(block.parts);
  }
  if (Array.isArray(block.rows)) {
    block.rows = block.rows.map((row) => {
      if (!row || typeof row !== "object") return row;
      const r = { ...(row as Record<string, unknown>) };
      if (Array.isArray(r.parts)) r.parts = sanitizeTextParts(r.parts);
      if (Array.isArray(r.cells)) {
        r.cells = r.cells.map((cell) => {
          if (!cell || typeof cell !== "object") return cell;
          const c = { ...(cell as Record<string, unknown>) };
          if (Array.isArray(c.parts)) c.parts = sanitizeTextParts(c.parts);
          return c;
        });
      }
      return r;
    });
  }
  if (Array.isArray(block.items)) {
    block.items = block.items
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const it = { ...(item as Record<string, unknown>) };
        if (Array.isArray(it.parts)) it.parts = sanitizeTextParts(it.parts);
        if ("questionNumber" in it || "question_number" in it) {
          if (!sanitizeQuestionNumberField(it) && !sanitizeQuestionNumberField(it, "question_number")) {
            return null;
          }
          if (it.question_number != null && it.questionNumber == null) {
            it.questionNumber = it.question_number;
            delete it.question_number;
          }
        }
        if (typeof it.text !== "string" && !Array.isArray(it.parts)) {
          it.text = String(it.text ?? it.information ?? "");
        }
        return it;
      })
      .filter(Boolean);
  }
  if (Array.isArray(block.statements)) {
    block.statements = block.statements
      .map((s) => {
        if (!s || typeof s !== "object") return null;
        const st = { ...(s as Record<string, unknown>) };
        if (!sanitizeQuestionNumberField(st)) return null;
        if (typeof st.text !== "string") st.text = String(st.text ?? "");
        return st;
      })
      .filter(Boolean);
  }
  if (Array.isArray(block.questions)) {
    block.questions = block.questions
      .map((q) => {
        if (!q || typeof q !== "object") return null;
        const qq = { ...(q as Record<string, unknown>) };
        if (!sanitizeQuestionNumberField(qq)) return null;
        return qq;
      })
      .filter(Boolean);
  }
  if (Array.isArray(block.labels)) {
    block.labels = block.labels
      .map((l) => {
        if (!l || typeof l !== "object") return null;
        const lb = { ...(l as Record<string, unknown>) };
        if (!sanitizeQuestionNumberField(lb)) return null;
        return lb;
      })
      .filter(Boolean);
  }
  if (Array.isArray(block.slots)) {
    block.slots = block.slots
      .map((s) => {
        if (!s || typeof s !== "object") return null;
        const sl = { ...(s as Record<string, unknown>) };
        if (!sanitizeQuestionNumberField(sl)) return null;
        const bp = sl.beforeParagraph;
        const n =
          typeof bp === "number"
            ? bp
            : typeof bp === "string"
              ? Number(bp)
              : 0;
        sl.beforeParagraph = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
        return sl;
      })
      .filter(Boolean);
  }
  if (Array.isArray(block.questionNumbers)) {
    block.questionNumbers = block.questionNumbers
      .map((n) => parseQuestionNumber(n))
      .filter((n): n is number => n != null);
  }
}

function normalizeExamInput(data: unknown): unknown {
  const cleaned = stripNulls(data) as Record<string, unknown> | undefined;
  if (!cleaned || typeof cleaned !== "object") return data;
  if (typeof cleaned.id !== "string" || !cleaned.id) {
    cleaned.id = `exam-${Date.now()}`;
  }
  if (typeof cleaned.module === "string") {
    const m = cleaned.module.toLowerCase();
    cleaned.module =
      m === "listening" || m === "reading" ? m : "unknown";
  } else if (!cleaned.module) {
    cleaned.module = "unknown";
  }

  // Passage field aliases + misclassified matching-information repair
  const sections = cleaned.sections;
  if (Array.isArray(sections)) {
    for (const section of sections) {
      if (!section || typeof section !== "object") continue;
      const groups = (section as Record<string, unknown>).groups;
      if (!Array.isArray(groups)) continue;
      for (const group of groups) {
        if (!group || typeof group !== "object") continue;
        const g = group as Record<string, unknown>;
        const instr = Array.isArray(g.instructions)
          ? g.instructions.join(" ").toLowerCase()
          : "";
        const heading = typeof g.heading === "string" ? g.heading.toLowerCase() : "";
        const looksLikeMatchInfo =
          /which\s+paragraph\s+contains|contains\s+the\s+following\s+information/i.test(
            `${instr} ${heading}`,
          );
        const blocks = g.blocks;
        if (!Array.isArray(blocks)) continue;
        for (let bi = 0; bi < blocks.length; bi++) {
          const block = blocks[bi];
          if (!block || typeof block !== "object") continue;
          const b = block as Record<string, unknown>;
          sanitizeBlockDeep(b);

          if (b.type === "passage") {
            if (!b.subtitle && typeof b.subheading === "string") {
              b.subtitle = b.subheading;
            }
            if (!b.subtitle && typeof b.subTitle === "string") {
              b.subtitle = b.subTitle;
            }
            if (!b.footnote && typeof b.footernote === "string") {
              b.footnote = b.footernote;
            }
            if (!b.footnote && typeof b.footerNote === "string") {
              b.footnote = b.footerNote;
            }
            if (!b.figures && Array.isArray(b.illustrations)) {
              b.figures = b.illustrations;
            }
            if (
              !b.figure &&
              b.illustration &&
              typeof b.illustration === "object"
            ) {
              b.figure = b.illustration;
            }
            continue;
          }

          // Models often emit matchingHeadings for "Which paragraph contains…"
          // with headings = Paragraph A–J. Convert to matchingInformation.
          if (b.type === "matchingHeadings" || b.type === "matchingInformation") {
            const headings = Array.isArray(b.headings) ? b.headings : [];
            const paraLike =
              headings.length >= 2 &&
              headings.every((h) => {
                if (!h || typeof h !== "object") return false;
                const t = String(
                  (h as Record<string, unknown>).text ??
                    (h as Record<string, unknown>).id ??
                    "",
                ).trim();
                return /^(paragraph\s+)?[A-J]$/i.test(t);
              });

            if (
              b.type === "matchingHeadings" &&
              (paraLike || looksLikeMatchInfo)
            ) {
              const paragraphs = (paraLike ? headings : []).map((h) => {
                const row = h as Record<string, unknown>;
                const raw = String(row.text ?? row.id ?? "").trim();
                const letter =
                  raw.match(/\b([A-J])\b/i)?.[1]?.toUpperCase() ?? "A";
                return { letter, text: `Paragraph ${letter}` };
              });
              const fromItems = Array.isArray(b.items)
                ? b.items
                : Array.isArray(b.statements)
                  ? b.statements
                  : null;
              const fromSlots = Array.isArray(b.slots)
                ? b.slots.map((s) => {
                    const row = s as Record<string, unknown>;
                    return {
                      questionNumber: Number(row.questionNumber),
                      text:
                        typeof row.text === "string"
                          ? row.text
                          : typeof row.information === "string"
                            ? row.information
                            : "",
                    };
                  })
                : [];
              const items = (fromItems ?? fromSlots).filter(
                (it) =>
                  it &&
                  typeof it === "object" &&
                  Number.isFinite(Number((it as { questionNumber?: number }).questionNumber)),
              );
              blocks[bi] = {
                type: "matchingInformation",
                boxTitle:
                  typeof b.listTitle === "string"
                    ? b.listTitle
                    : typeof b.boxTitle === "string"
                      ? b.boxTitle
                      : "Paragraphs",
                paragraphs:
                  paragraphs.length >= 2
                    ? paragraphs
                    : defaultParagraphOptions("A", "J"),
                items,
                needsReview:
                  items.some(
                    (it) =>
                      !(it as { text?: string }).text ||
                      !(it as { text?: string }).text!.trim(),
                  ) || undefined,
              };
              continue;
            }

            if (b.type === "matchingInformation") {
              if (!Array.isArray(b.paragraphs) || b.paragraphs.length < 2) {
                b.paragraphs = defaultParagraphOptions("A", "J");
              }
              if (!Array.isArray(b.items) && Array.isArray(b.statements)) {
                b.items = b.statements;
              }
            }
          }
        }
      }
    }
  }

  return cleaned;
}

function defaultParagraphOptions(from: string, to: string) {
  const a = from.toUpperCase().charCodeAt(0);
  const b = to.toUpperCase().charCodeAt(0);
  const out: Array<{ letter: string; text: string }> = [];
  for (let c = Math.min(a, b); c <= Math.max(a, b); c++) {
    const letter = String.fromCharCode(c);
    out.push({ letter, text: `Paragraph ${letter}` });
  }
  return out;
}

/**
 * Ensure reading passages keep a visible image when the model omitted figure
 * but screenshots were uploaded (first image is usually the passage page).
 */
export function ensureReadingPassageFigures(
  exam: ExamDocument,
  imageCount: number,
): ExamDocument {
  if (exam.module !== "reading" || imageCount <= 0) return exam;
  let changed = false;
  const sections = exam.sections.map((section) => ({
    ...section,
    groups: section.groups.map((group) => ({
      ...group,
      blocks: group.blocks.map((block) => {
        if (block.type !== "passage") return block;
        const hasFig =
          !!block.figure ||
          (Array.isArray(block.figures) && block.figures.length > 0);
        if (hasFig) return block;
        changed = true;
        return {
          ...block,
          figure: {
            sourceIndex: 0,
            caption: block.title ? undefined : "Reading passage",
          },
        };
      }),
    })),
  }));
  return changed ? { ...exam, sections } : exam;
}

export function parseExamDocument(data: unknown): ExamDocument {
  return ExamDocumentSchema.parse(normalizeExamInput(data));
}

export function safeParseExamDocument(data: unknown) {
  return ExamDocumentSchema.safeParse(normalizeExamInput(data));
}
