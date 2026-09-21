import type { ExamDocument } from "@ielts/schema";

/** Minimal fallback when vision is unavailable — Listening Section 1 style. */
export function mockExamFromHint(
  moduleHint: "auto" | "listening" | "reading",
  imageCount: number,
): ExamDocument {
  if (moduleHint === "reading") {
    return {
      id: `mock-reading-${Date.now()}`,
      module: "reading",
      title: "Mock Reading (bridge mock mode)",
      sourceImages: Array.from({ length: imageCount }, (_, i) => `upload-${i}`),
      sections: [
        {
          id: "r1",
          heading: "READING PASSAGE",
          questionRange: "1-13",
          groups: [
            {
              id: "p",
              instructions: [
                "Mock mode: start the Playwright vision bridge + LLMs2API for real OCR.",
              ],
              blocks: [
                {
                  type: "passage",
                  paragraphs: [
                    "This is mock Reading content. Convert with the vision bridge to extract the real passage from your screenshot.",
                  ],
                  figure: { sourceIndex: 0 },
                },
                {
                  type: "trueFalseNotGiven",
                  key: [
                    { value: "TRUE", meaning: "agrees" },
                    { value: "FALSE", meaning: "contradicts" },
                    { value: "NOT GIVEN", meaning: "no information" },
                  ],
                  statements: [
                    {
                      questionNumber: 1,
                      text: "Placeholder statement — replace via real parse.",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
  }

  return {
    id: `mock-listening-${Date.now()}`,
    module: "listening",
    title: "Mock Listening (bridge mock mode)",
    sourceImages: Array.from({ length: imageCount }, (_, i) => `upload-${i}`),
    sections: [
      {
        id: "s1",
        heading: "SECTION 1 Questions 1–10",
        questionRange: "1-10",
        groups: [
          {
            id: "g",
            heading: "Questions 1–6",
            instructions: [
              "Mock mode is on. Use Sample Listening in the UI, or set BRIDGE_MODE=playwright with LLMs2API.",
              "Complete the form below.",
            ],
            wordLimit: { maxWords: 2, raw: "NO MORE THAN TWO WORDS" },
            blocks: [
              {
                type: "form",
                title: "Health Centre Registration",
                rows: [
                  {
                    label: "Registration for the entire",
                    parts: [
                      {
                        kind: "answer",
                        questionNumber: 1,
                        maxWords: 2,
                        width: "lg",
                      },
                    ],
                  },
                  {
                    label: "Name:",
                    parts: [
                      { kind: "text", text: "Clara " },
                      {
                        kind: "answer",
                        questionNumber: 2,
                        maxWords: 2,
                        width: "md",
                      },
                    ],
                  },
                ],
              },
              {
                type: "map",
                title: "Map (from upload if present)",
                image: { sourceIndex: Math.min(1, Math.max(0, imageCount - 1)) },
                labels: [
                  { questionNumber: 9, promptBefore: "Health centre" },
                  { questionNumber: 10, promptBefore: "Small park" },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}
