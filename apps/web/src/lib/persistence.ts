export type AnswersMap = Record<string, string>;

export type HighlightRange = {
  id: string;
  blockKey: string;
  start: number;
  end: number;
  text: string;
};

export type PersistedState = {
  examId: string;
  answers: AnswersMap;
  highlights: HighlightRange[];
};

const keyFor = (examId: string) => `ielts-format:${examId}`;

export function loadPersisted(examId: string): PersistedState | null {
  try {
    const raw = localStorage.getItem(keyFor(examId));
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

export function savePersisted(state: PersistedState) {
  localStorage.setItem(keyFor(state.examId), JSON.stringify(state));
}

/** Drop saved answers/highlights for an exam id and any prior attempts. */
export function clearPersistedForExam(examId: string) {
  const base = examId.replace(/__attempt-\d+$/, "");
  const prefix = `ielts-format:${base}`;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k === prefix || k.startsWith(`${prefix}__attempt-`)) {
      toRemove.push(k);
    }
  }
  for (const k of toRemove) localStorage.removeItem(k);
}

/** Unique id so each convert/sample load is a new unanswered attempt. */
export function withFreshAttemptId(exam: { id: string }): string {
  const base = exam.id.replace(/__attempt-\d+$/, "") || "exam";
  return `${base}__attempt-${Date.now()}`;
}

export function countWords(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function answerKey(n: number): string {
  return String(n);
}

/** Merge a new highlight into the list, unioning overlaps on the same block. */
export function addMergedHighlight(
  prev: HighlightRange[],
  next: Omit<HighlightRange, "id">,
): HighlightRange[] {
  const others = prev.filter((h) => h.blockKey !== next.blockKey);
  const same = [
    ...prev.filter((h) => h.blockKey === next.blockKey),
    { ...next, id: `new-${Date.now()}` },
  ];
  return [
    ...others,
    ...mergeRangesForBlock(same).map((h, i) => ({
      ...h,
      id: h.id.startsWith("new-") ? `${Date.now()}-${i}` : h.id,
    })),
  ];
}

export function mergeRangesForBlock(ranges: HighlightRange[]): HighlightRange[] {
  const sorted = [...ranges]
    .filter((h) => h.end > h.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const out: HighlightRange[] = [];
  for (const h of sorted) {
    const last = out[out.length - 1];
    if (last && h.start <= last.end) {
      last.end = Math.max(last.end, h.end);
    } else {
      out.push({ ...h });
    }
  }
  return out;
}
