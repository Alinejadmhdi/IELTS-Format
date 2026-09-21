import type { ExamDocument } from "@ielts/schema";

/** Demo Listening exam covering sample patterns from Sections 1–4. */
export const listeningDemo: ExamDocument = {
  id: "demo-listening-s1-s4",
  module: "listening",
  title: "Listening practice (demo)",
  sections: [
    {
      id: "sec-1",
      heading: "SECTION 1 Questions 1–10",
      questionRange: "1-10",
      groups: [
        {
          id: "g1-6",
          heading: "Questions 1–6",
          instructions: [
            "Complete the form below.",
            "Write NO MORE THAN TWO WORDS for each answer.",
          ],
          wordLimit: { maxWords: 2, raw: "NO MORE THAN TWO WORDS" },
          blocks: [
            {
              type: "form",
              title: "Health Centre Registration",
              rows: [
                {
                  isExample: true,
                  label: "Example",
                  parts: [
                    { kind: "text", text: "Reason for visit: " },
                    { kind: "text", text: "Registration" },
                    { kind: "text", text: " and appointment" },
                  ],
                },
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
                    { kind: "answer", questionNumber: 2, maxWords: 2, width: "md" },
                  ],
                },
                {
                  label: "Date of birth:",
                  parts: [
                    { kind: "answer", questionNumber: 3, maxWords: 2, width: "md" },
                    { kind: "text", text: " 1990" },
                  ],
                },
                {
                  label: "Old address:",
                  parts: [{ kind: "text", text: "72 Crocket Street" }],
                },
                {
                  label: "Current address:",
                  parts: [
                    { kind: "answer", questionNumber: 4, maxWords: 2, width: "lg" },
                  ],
                },
                {
                  label: "Post code:",
                  parts: [
                    { kind: "answer", questionNumber: 5, maxWords: 2, width: "sm" },
                  ],
                },
                {
                  label: "Acceptable documents:",
                  parts: [
                    { kind: "text", text: "Tenancy " },
                    { kind: "answer", questionNumber: 6, maxWords: 2, width: "md" },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: "g7-8",
          heading: "Questions 7 and 8",
          instructions: [
            "Complete the sentences below.",
            "Write NO MORE THAN TWO WORDS for each answer.",
          ],
          wordLimit: { maxWords: 2, raw: "NO MORE THAN TWO WORDS" },
          blocks: [
            {
              type: "sentences",
              items: [
                {
                  questionNumber: 7,
                  parts: [
                    { kind: "text", text: "Clara has to " },
                    { kind: "answer", questionNumber: 7, maxWords: 2, width: "md" },
                    { kind: "text", text: " her daughter from school." },
                  ],
                },
                {
                  questionNumber: 8,
                  parts: [
                    { kind: "text", text: "Clara's appointment is at 4 pm on " },
                    { kind: "answer", questionNumber: 8, maxWords: 2, width: "md" },
                    { kind: "text", text: "." },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: "g9-10",
          heading: "Questions 9 and 10",
          instructions: ["Label the map below."],
          blocks: [
            {
              type: "map",
              title: "North Street area",
              image: { sourceIndex: 1 },
              labels: [
                {
                  questionNumber: 9,
                  promptBefore: "Health centre",
                },
                {
                  questionNumber: 10,
                  promptBefore: "Small park",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "sec-2",
      heading: "SECTION 2 Questions 11–20",
      questionRange: "11-20",
      groups: [
        {
          id: "g11-16",
          heading: "Questions 11–16",
          instructions: [
            "Which change has been made to each part of the theatre?",
            "Choose SIX answers from the box and write the correct letter, A–G, next to Questions 11–16.",
          ],
          blocks: [
            {
              type: "matchingFromBox",
              boxTitle: "Theatre changes",
              options: [
                { letter: "A", text: "enlarged" },
                { letter: "B", text: "replaced" },
                { letter: "C", text: "access added" },
                { letter: "D", text: "thoroughly cleaned" },
                { letter: "E", text: "modernised" },
                { letter: "F", text: "totally rebuilt" },
                { letter: "G", text: "moved" },
              ],
              itemsTitle: "Part of the theatre",
              items: [
                { questionNumber: 11, text: "façade" },
                { questionNumber: 12, text: "auditorium" },
                { questionNumber: 13, text: "foyer" },
                { questionNumber: 14, text: "coffee machine" },
                { questionNumber: 15, text: "roof terrace" },
                { questionNumber: 16, text: "shop" },
              ],
            },
          ],
        },
        {
          id: "g17-20",
          heading: "Questions 17–20",
          instructions: ["Choose the correct letter A, B or C."],
          blocks: [
            {
              type: "multipleChoice",
              decorativeImage: { sourceIndex: 2 },
              questions: [
                {
                  questionNumber: 17,
                  stem: "The information pack contains",
                  options: [
                    { letter: "A", text: "a programme." },
                    { letter: "B", text: "details about summer events." },
                    { letter: "C", text: "a list of organisers." },
                  ],
                },
                {
                  questionNumber: 18,
                  stem: "How many free tickets will those below 16 years of age be allocated for the matinee performance?",
                  options: [
                    { letter: "A", text: "100" },
                    { letter: "B", text: "200" },
                    { letter: "C", text: "300" },
                  ],
                },
                {
                  questionNumber: 19,
                  stem: "On Wednesdays, the reduction on ticket prices for theatre members will be",
                  options: [
                    { letter: "A", text: "25%." },
                    { letter: "B", text: "50%." },
                    { letter: "C", text: "33%." },
                  ],
                },
                {
                  questionNumber: 20,
                  stem: "A new development at the theatre is the",
                  options: [
                    { letter: "A", text: "regular lectures on cinematography." },
                    { letter: "B", text: "weekly workshops and master classes." },
                    { letter: "C", text: "regular lectures and master classes." },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "sec-3",
      heading: "SECTION 3 Questions 21–30",
      questionRange: "21-30",
      groups: [
        {
          id: "g21",
          heading: "Question 21",
          instructions: ["Choose the correct letter A, B or C."],
          blocks: [
            {
              type: "multipleChoice",
              questions: [
                {
                  questionNumber: 21,
                  stem: "Zahra's talk is about how",
                  options: [
                    {
                      letter: "A",
                      text: "smartphone technology makes young people's lives easier.",
                    },
                    {
                      letter: "B",
                      text: "certain new discoveries led to smartphone technology.",
                    },
                    {
                      letter: "C",
                      text: "the technology of smartphones affects people's lives.",
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: "g22-24",
          heading: "Questions 22–24",
          instructions: ["Choose THREE letters, A–G."],
          blocks: [
            {
              type: "multiSelectLetters",
              selectCount: 3,
              prompt:
                "Which THREE of the following elements of conducting Zahra's research are mentioned as not yet decided?",
              questionNumbers: [22, 23, 24],
              options: [
                { letter: "A", text: "length of the questionnaire" },
                { letter: "B", text: "images to use" },
                { letter: "C", text: "volume of statistics" },
                { letter: "D", text: "duration of interviews" },
                { letter: "E", text: "period of research" },
                { letter: "F", text: "age of interviewees" },
                { letter: "G", text: "exact aims" },
              ],
            },
          ],
        },
        {
          id: "g25-30",
          heading: "Questions 25–30",
          instructions: [
            "Complete the table below.",
            "Write ONE WORD AND/OR A NUMBER for each answer.",
          ],
          wordLimit: {
            maxWords: 1,
            allowNumber: true,
            raw: "ONE WORD AND/OR A NUMBER",
          },
          blocks: [
            {
              type: "table",
              title: "Questionnaire on gadgets",
              headers: ["Thomas's smartphone", "Use", "Score"],
              rows: [
                {
                  cells: [
                    { parts: [{ kind: "text", text: "Communication" }] },
                    {
                      parts: [
                        { kind: "text", text: "Excluding phoning\n• for almost " },
                        {
                          kind: "answer",
                          questionNumber: 25,
                          maxWords: 1,
                          allowNumber: true,
                          width: "sm",
                        },
                        { kind: "text", text: "\n• less for texts" },
                      ],
                    },
                    { parts: [{ kind: "text", text: "8" }] },
                  ],
                },
                {
                  cells: [
                    { parts: [{ kind: "text", text: "Studying" }] },
                    {
                      parts: [
                        {
                          kind: "text",
                          text: "Preparing assignments and recording ",
                        },
                        {
                          kind: "answer",
                          questionNumber: 26,
                          maxWords: 1,
                          allowNumber: true,
                          width: "sm",
                        },
                      ],
                    },
                    {
                      parts: [
                        {
                          kind: "answer",
                          questionNumber: 27,
                          maxWords: 1,
                          allowNumber: true,
                          width: "sm",
                        },
                      ],
                    },
                  ],
                },
                {
                  cells: [
                    { parts: [{ kind: "text", text: "Entertainment" }] },
                    {
                      parts: [
                        {
                          kind: "text",
                          text: "For listening to music, etc and for TV ",
                        },
                        {
                          kind: "answer",
                          questionNumber: 28,
                          maxWords: 1,
                          allowNumber: true,
                          width: "sm",
                        },
                      ],
                    },
                    { parts: [{ kind: "text", text: "7" }] },
                  ],
                },
                {
                  cells: [
                    { parts: [{ kind: "text", text: "Other" }] },
                    {
                      parts: [
                        {
                          kind: "text",
                          text: "Eventually for organising his whole domestic ",
                        },
                        {
                          kind: "answer",
                          questionNumber: 29,
                          maxWords: 1,
                          allowNumber: true,
                          width: "sm",
                        },
                      ],
                    },
                    {
                      parts: [
                        {
                          kind: "answer",
                          questionNumber: 30,
                          maxWords: 1,
                          allowNumber: true,
                          width: "sm",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "sec-4",
      heading: "SECTION 4 Questions 31–40",
      questionRange: "31-40",
      groups: [
        {
          id: "g31-35",
          heading: "Questions 31–35",
          instructions: ["Choose the correct letter A, B or C."],
          blocks: [
            {
              type: "multipleChoice",
              title: "Cloud-seeding to provide rain",
              questions: [
                {
                  questionNumber: 31,
                  stem: "Boreholes provide water for",
                  options: [
                    { letter: "A", text: "industrial use." },
                    { letter: "B", text: "agricultural purposes." },
                    { letter: "C", text: "domestic consumption." },
                  ],
                },
                {
                  questionNumber: 32,
                  stem: "According to the speaker, in the past people have tried to induce rain by",
                  options: [
                    { letter: "A", text: "supernatural means." },
                    { letter: "B", text: "using fires." },
                    { letter: "C", text: "special dances." },
                  ],
                },
                {
                  questionNumber: 33,
                  stem: "There is some proof that seeding clouds increases rainfall by",
                  options: [
                    { letter: "A", text: "15%." },
                    { letter: "B", text: "55%." },
                    { letter: "C", text: "25%." },
                  ],
                },
                {
                  questionNumber: 34,
                  stem: "According to the speaker, why do some people not support cloud seeding?",
                  options: [
                    { letter: "A", text: "The benefits of the practice are limited." },
                    { letter: "B", text: "The costs of the equipment are too great." },
                    {
                      letter: "C",
                      text: "The effects of playing with nature are unknown.",
                    },
                  ],
                },
                {
                  questionNumber: 35,
                  stem: "With the amounts of money involved in agriculture, weather control",
                  options: [
                    { letter: "A", text: "deserves more investment." },
                    { letter: "B", text: "is worthy of attention." },
                    { letter: "C", text: "is a surprising success story." },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: "g36-40",
          heading: "Questions 36–40",
          instructions: [
            "Label the diagram below.",
            "Write NO MORE THAN TWO WORDS for each answer.",
          ],
          wordLimit: { maxWords: 2, raw: "NO MORE THAN TWO WORDS" },
          blocks: [
            {
              type: "diagram",
              title: "How cloud seeding works",
              image: { sourceIndex: 6 },
              labels: [
                {
                  questionNumber: 36,
                  promptAfter: "flares dropped from aeroplane",
                  maxWords: 2,
                },
                {
                  questionNumber: 37,
                  promptBefore: "Drops of water combine with crystals to make it",
                  promptAfter: "and then fall as rain or snow",
                  maxWords: 2,
                },
                {
                  questionNumber: 38,
                  promptBefore: "Ground seeding",
                  maxWords: 2,
                },
                {
                  questionNumber: 39,
                  promptAfter: "with propane",
                  maxWords: 2,
                },
                {
                  questionNumber: 40,
                  promptBefore:
                    "Silver iodide crystals carried up by heat to",
                  maxWords: 2,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
