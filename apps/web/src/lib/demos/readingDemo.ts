import type { ExamDocument } from "@ielts/schema";

/** Demo Reading exam from Bronze Age / taotie samples. */
export const readingDemo: ExamDocument = {
  id: "demo-reading-bronze-age",
  module: "reading",
  title: "Reading Passage (demo)",
  sections: [
    {
      id: "reading-1",
      heading: "READING PASSAGE",
      questionRange: "1-13",
      groups: [
        {
          id: "passage",
          instructions: [
            "You should spend about 20 minutes on Questions 1–13, which are based on the Reading Passage below.",
          ],
          blocks: [
            {
              type: "passage",
              title: "The Bronze Age of China",
              subtitle: "Ritual vessels, jade, and the taotie motif",
              guidance:
                "You should spend about 20 minutes on Questions 1–13, which are based on the Reading Passage below.",
              figure: { sourceIndex: 0, caption: "Taotie mask on a bronze ritual vessel" },
              paragraphs: [
                "The Bronze Age in China began around 2000 B.C. and brought major changes in society, including the growth of towns and cities and more complex social order. Ritual and ceremony became central, and bronze objects played an important role in social and religious life.",
                "The Yellow River valley in Henan Province was a centre of advanced culture. The Shang dynasty (ca. 1600–1050 B.C.) developed a powerful state; later the Zhou people conquered the Shang. After the Western Zhou period came the Eastern Zhou, including the Spring and Autumn and Warring States eras, ending with unification under the Qin in 221 B.C.",
                "The Shang and Zhou eras are often called the Bronze Age of China. Bronze — an alloy of copper and tin — was used for weapons, chariot fittings, and ritual vessels. The taotie is a frontal animal-like mask with prominent eyes in high relief, a nose, jaws, fangs, horns, ears, and eyebrows. Other motifs include dragons, birds, and geometric patterns.",
                "Jade was also important in late Neolithic and Bronze Age cultures, used in burial rites, sacrificial offerings, and formal ceremonies. The quality and style of jade carving changed over time.",
              ],
              footnote:
                "Adapted from museum exhibition notes on Shang and Zhou ritual art.",
            },
          ],
        },
        {
          id: "g1-6",
          heading: "Questions 1–6",
          instructions: [
            "Do the following statements agree with the information given in the Reading Passage?",
            "Write:",
          ],
          blocks: [
            {
              type: "trueFalseNotGiven",
              key: [
                {
                  value: "TRUE",
                  meaning: "if the statement agrees with the information",
                },
                {
                  value: "FALSE",
                  meaning: "if the statement contradicts the information",
                },
                {
                  value: "NOT GIVEN",
                  meaning: "if there is no information on this",
                },
              ],
              statements: [
                {
                  questionNumber: 1,
                  text: "As the migration of people to towns and cities took place, Chinese society became more unified.",
                },
                {
                  questionNumber: 2,
                  text: "According to evidence that has been unearthed, the Zhou people lost power to the Shang.",
                },
                {
                  questionNumber: 3,
                  text: "At the end of the Zhou dynasty, there were nine powers seeking to rule China.",
                },
                {
                  questionNumber: 4,
                  text: "Iron was introduced to China from outside.",
                },
                {
                  questionNumber: 5,
                  text: "There was only one type of taotie.",
                },
                {
                  questionNumber: 6,
                  text: "There is some proof that later jade carving was superior to earlier examples.",
                },
              ],
            },
          ],
        },
        {
          id: "g7-12",
          heading: "Questions 7–12",
          instructions: ["Classify the following descriptions as relating to"],
          blocks: [
            {
              type: "classify",
              prompt: "Classify the following descriptions as relating to",
              categories: [
                { letter: "A", text: "Bronze" },
                { letter: "B", text: "Taotie" },
                { letter: "C", text: "Jade" },
              ],
              listTitle: "List of Descriptions",
              items: [
                {
                  questionNumber: 7,
                  text: "Its features depended on when and where it was made.",
                },
                {
                  questionNumber: 8,
                  text: "Its meaning in one period of history is still a mystery.",
                },
                {
                  questionNumber: 9,
                  text: "Its decoration illustrates issues the elite in China dealt with.",
                },
                {
                  questionNumber: 10,
                  text: "It was not worked with the same degree of sophistication as in previous times.",
                },
                {
                  questionNumber: 11,
                  text: "It possibly sprang up spontaneously without any help from beyond China.",
                },
                {
                  questionNumber: 12,
                  text: "It was used for keeping a record of formal agreements between states.",
                },
              ],
            },
          ],
        },
        {
          id: "g13",
          heading: "Question 13",
          instructions: ["Choose the correct letter A, B, C or D."],
          blocks: [
            {
              type: "multipleChoice",
              questions: [
                {
                  questionNumber: 13,
                  stem: "Which of the following is the most suitable title for the Reading Passage?",
                  options: [
                    { letter: "A", text: "The importance of jade carvings" },
                    { letter: "B", text: "The Chinese Bronze Age" },
                    { letter: "C", text: "The decline of the Bronze Age" },
                    { letter: "D", text: "How iron was introduced to China" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
