import type { ExamDocument, TextPart } from "@ielts/schema";

function collectFromParts(parts: TextPart[], into: Set<number>) {
  for (const p of parts) {
    if (p.kind === "answer") into.add(p.questionNumber);
  }
}

/** Collect every question number that has an answer box in the exam. */
export function collectQuestionNumbers(exam: ExamDocument): number[] {
  const nums = new Set<number>();

  for (const section of exam.sections) {
    for (const group of section.groups) {
      for (const block of group.blocks) {
        switch (block.type) {
          case "form":
          case "notes":
            for (const row of block.rows) collectFromParts(row.parts, nums);
            break;
          case "flowChart":
            for (const step of block.steps) collectFromParts(step.parts, nums);
            break;
          case "example":
            collectFromParts(block.parts, nums);
            break;
          case "sentences":
            for (const item of block.items) {
              nums.add(item.questionNumber);
              collectFromParts(item.parts, nums);
            }
            break;
          case "table":
            for (const row of block.rows) {
              for (const cell of row.cells) collectFromParts(cell.parts, nums);
            }
            break;
          case "map":
          case "plan":
          case "diagram":
            for (const label of block.labels) nums.add(label.questionNumber);
            break;
          case "matchingFromBox":
            for (const item of block.items) nums.add(item.questionNumber);
            break;
          case "matchingHeadings":
            for (const slot of block.slots) nums.add(slot.questionNumber);
            break;
          case "matchingInformation":
            for (const item of block.items) nums.add(item.questionNumber);
            break;
          case "multipleChoice":
            for (const q of block.questions) nums.add(q.questionNumber);
            break;
          case "multiSelectLetters":
            for (const n of block.questionNumbers) nums.add(n);
            break;
          case "trueFalseNotGiven":
          case "yesNoNotGiven":
            for (const s of block.statements) nums.add(s.questionNumber);
            break;
          case "classify":
            for (const item of block.items) nums.add(item.questionNumber);
            break;
          default:
            break;
        }
      }
    }
  }

  return [...nums].sort((a, b) => a - b);
}

/**
 * Question-number groups that are marked "in any order" on the paper
 * (multi-select letter questions share one answer pool).
 */
export function collectAnyOrderGroups(exam: ExamDocument): number[][] {
  const groups: number[][] = [];
  for (const section of exam.sections) {
    for (const group of section.groups) {
      for (const block of group.blocks) {
        if (block.type !== "multiSelectLetters") continue;
        const nums = [...block.questionNumbers].sort((a, b) => a - b);
        if (nums.length >= 2) groups.push(nums);
      }
    }
  }
  return groups;
}
