import type { ExamDocument } from "@ielts/schema";

export type ParagraphNote = {
  id: string;
  label: string;
  preview: string;
  /** Question numbers / letters that came from this paragraph */
  answersFrom: string;
  /** Extra notes */
  notes: string;
};

function letterAt(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

/** Detect "A", "A.", "A)", etc. at the start of a paragraph. */
export function detectParagraphLabel(text: string, fallbackIndex: number): string {
  const trimmed = text.trim();
  const m = trimmed.match(/^([A-Ia-i])(?:\s*[.\)\]：:\-–—]|\s+)/);
  if (m) return m[1].toUpperCase();
  return letterAt(fallbackIndex);
}

export function collectPassageParagraphs(exam: ExamDocument): Array<{
  id: string;
  label: string;
  preview: string;
  fullText: string;
}> {
  const rows: Array<{
    id: string;
    label: string;
    preview: string;
    fullText: string;
  }> = [];
  let i = 0;
  for (const section of exam.sections) {
    for (const group of section.groups) {
      for (const block of group.blocks) {
        if (block.type !== "passage") continue;
        for (const p of block.paragraphs) {
          const label = detectParagraphLabel(p, i);
          const id = `${section.id}:${group.id}:${i}`;
          const preview = p.replace(/\s+/g, " ").trim().slice(0, 120);
          rows.push({ id, label, preview, fullText: p });
          i += 1;
        }
      }
    }
  }
  return rows;
}

const notesKey = (examId: string) => `ielts-format:para-notes:${examId}`;

export function loadParagraphNotes(examId: string): Record<string, ParagraphNote> {
  try {
    const raw = localStorage.getItem(notesKey(examId));
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ParagraphNote>;
  } catch {
    return {};
  }
}

export function saveParagraphNotes(
  examId: string,
  notes: Record<string, ParagraphNote>,
) {
  localStorage.setItem(notesKey(examId), JSON.stringify(notes));
}

export function clearParagraphNotes(examId: string) {
  const base = examId.replace(/__attempt-\d+$/, "");
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (
      k === notesKey(examId) ||
      k.startsWith(`ielts-format:para-notes:${base}`)
    ) {
      toRemove.push(k);
    }
  }
  for (const k of toRemove) localStorage.removeItem(k);
}

export function formatParagraphNotesExport(
  examTitle: string | undefined,
  notes: ParagraphNote[],
): string {
  const lines: string[] = [
    `# Paragraph answer map${examTitle ? ` — ${examTitle}` : ""}`,
    `Exported: ${new Date().toISOString()}`,
    "",
  ];
  for (const n of notes) {
    lines.push(`## Paragraph ${n.label}`);
    lines.push(`Preview: ${n.preview}${n.preview.length >= 120 ? "…" : ""}`);
    lines.push(`Answers from this paragraph: ${n.answersFrom.trim() || "(none)"}`);
    lines.push(`Notes: ${n.notes.trim() || "(none)"}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
