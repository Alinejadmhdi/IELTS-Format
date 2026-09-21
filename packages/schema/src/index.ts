import { z } from "zod";

export const WordLimitSchema = z.object({
  maxWords: z.number().optional(),
  allowNumber: z.boolean().optional(),
  raw: z.string().optional(),
});

export const AnswerSlotSchema = z.object({
  questionNumber: z.coerce.number(),
  maxWords: z.number().optional(),
  allowNumber: z.boolean().optional(),
  allowedValues: z.array(z.string()).optional(),
  placeholder: z.string().optional(),
});

export const TextPartSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({
    kind: z.literal("answer"),
    questionNumber: z.coerce.number(),
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
  questionNumber: z.coerce.number(),
  stem: z.string(),
  options: z.array(OptionSchema),
});

export const LabelItemSchema = z.object({
  questionNumber: z.coerce.number(),
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
      questionNumber: z.coerce.number(),
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
      questionNumber: z.coerce.number(),
      text: z.string(),
    }),
  ),
  needsReview: z.boolean().optional(),
});

export const MultiSelectLettersBlockSchema = z.object({
  type: z.literal("multiSelectLetters"),
  selectCount: z.coerce.number(),
  prompt: z.string(),
  options: z.array(OptionSchema),
  questionNumbers: z.array(z.coerce.number()),
  needsReview: z.boolean().optional(),
});

export const PassageBlockSchema = z.object({
  type: z.literal("passage"),
  title: z.string().optional(),
  guidance: z.string().optional(),
  paragraphs: z.array(z.string()),
  figure: ImageRefSchema.optional(),
  needsReview: z.boolean().optional(),
});

const JudgmentFields = {
  key: z.array(z.object({ value: z.string(), meaning: z.string() })),
  statements: z.array(
    z.object({
      questionNumber: z.coerce.number(),
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
      questionNumber: z.coerce.number(),
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
  return cleaned;
}

export function parseExamDocument(data: unknown): ExamDocument {
  return ExamDocumentSchema.parse(normalizeExamInput(data));
}

export function safeParseExamDocument(data: unknown) {
  return ExamDocumentSchema.safeParse(normalizeExamInput(data));
}
