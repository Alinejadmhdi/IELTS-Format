import { answerKey, type AnswersMap } from "./persistence";

export type AnswerKeyMap = Record<string, string[]>;

/** Questions that share one unordered answer pool (e.g. 38–40 → B,C,F). */
export type AnyOrderGroup = {
  questions: number[];
  /** Optional explicit pool from the key text; otherwise taken from per-Q key entries. */
  answers?: string[];
};

export type MarkStatus = "correct" | "incorrect" | "blank" | "missing-key";

export type MarkResult = {
  status: MarkStatus;
  expected?: string[];
};

/** Normalize for IELTS-style loose matching. */
export function normalizeAnswer(raw: string): string {
  return raw
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s*\|\s*/g, " ")
    .replace(/[`,.;:!?()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Letter answers like "A C", "A,C", "ac" → sorted unique letters. */
function normalizeLetters(raw: string): string | null {
  const letters = raw
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .split("")
    .filter(Boolean);
  if (!letters.length) return null;
  if (letters.length === 1 && normalizeAnswer(raw).length > 1) {
    return null;
  }
  if (!/^[A-Za-z\s,;/|.-]+$/.test(raw.trim())) return null;
  const words = raw.trim().split(/[\s,;/|.-]+/).filter(Boolean);
  if (words.some((w) => w.length > 1)) return null;
  return [...new Set(letters)].sort().join("");
}

function splitAlternatives(value: string): string[] {
  return value
    .split(/\s*(?:\/|\bor\b|\|)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function addAnswer(key: AnswerKeyMap, n: number, value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return;
  const k = answerKey(n);
  const alts = splitAlternatives(cleaned);
  key[k] = [...new Set([...(key[k] ?? []), ...alts])];
}

function extractLetterPool(raw: string): string[] {
  const letters = [
    ...raw.toUpperCase().matchAll(/\b([A-G])\b/g),
  ].map((m) => m[1]);
  return [...new Set(letters)];
}

function rangeQuestions(from: number, to: number): number[] {
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  const out: number[] = [];
  for (let n = a; n <= b; n++) out.push(n);
  return out;
}

/**
 * Parse "in any order" pools from key text, e.g.:
 *   38-40 B, C, F
 *   38–40 (in any order) B C F
 *   Questions 38-40 IN ANY ORDER: B, C, F
 *   38&39&40 B/C/F
 */
export function parseAnyOrderGroups(raw: string): AnyOrderGroup[] {
  const groups: AnyOrderGroup[] = [];
  const text = raw.replace(/\r/g, "");

  const patterns: RegExp[] = [
    // 38-40 … B, C, F (optional "in any order")
    /(\d+)\s*[-–—to]+\s*(\d+)\s*(?:\([^)]*any\s*order[^)]*\)|\(?\s*in\s+any\s+order\s*\)?)?\s*[:.\-]?\s*((?:[A-Ga-g](?:\s*[,;/&\s]\s*)?)+)/gi,
    // 38&39&40 B C F
    /(\d+)(?:\s*[&+,]\s*(\d+)){1,6}\s*(?:\([^)]*any\s*order[^)]*\)|\(?\s*in\s+any\s+order\s*\)?)?\s*[:.\-]?\s*((?:[A-Ga-g](?:\s*[,;/&\s]\s*)?)+)/gi,
  ];

  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const full = m[0];
      const nums = [...full.matchAll(/\d+/g)].map((x) => Number(x[0]));
      const letters = extractLetterPool(m[m.length - 1] ?? full);
      if (nums.length < 2 || letters.length < 2) continue;

      let questions: number[];
      if (nums.length === 2 && /[-–—to]/i.test(full)) {
        questions = rangeQuestions(nums[0], nums[1]);
      } else {
        questions = [...new Set(nums)].sort((a, b) => a - b);
      }
      // Prefer letter count matching question count when it's a range
      if (letters.length < 2 || questions.length < 2) continue;
      groups.push({ questions, answers: letters });
    }
  }

  // Standalone "IN ANY ORDER: B, C, F" after a "Questions 38-40" header
  const headerRe =
    /questions?\s+(\d+)\s*[-–—to]+\s*(\d+)([\s\S]{0,120}?)(?:in\s+any\s+order)\s*[:.\-]?\s*((?:[A-Ga-g](?:\s*[,;/&\s]\s*)?)+)/gi;
  for (const m of text.matchAll(headerRe)) {
    const questions = rangeQuestions(Number(m[1]), Number(m[2]));
    const letters = extractLetterPool(m[4]);
    if (questions.length >= 2 && letters.length >= 2) {
      groups.push({ questions, answers: letters });
    }
  }

  return dedupeGroups(groups);
}

function dedupeGroups(groups: AnyOrderGroup[]): AnyOrderGroup[] {
  const seen = new Set<string>();
  const out: AnyOrderGroup[] = [];
  for (const g of groups) {
    const q = [...g.questions].sort((a, b) => a - b);
    const id = q.join(",");
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      questions: q,
      answers: g.answers ? [...new Set(g.answers.map((a) => a.toUpperCase()))] : undefined,
    });
  }
  return out;
}

/**
 * Parse pasted answer keys — one-per-line OR glued / inline, e.g.:
 *   Questions 11-15
 *   11 C
 *   14 A15 C
 *   38-40 B, C, F (in any order)
 */
export function parseAnswerKeyText(raw: string): {
  key: AnswerKeyMap;
  count: number;
  warnings: string[];
  anyOrderGroups: AnyOrderGroup[];
} {
  const key: AnswerKeyMap = {};
  const warnings: string[] = [];
  const anyOrderGroups = parseAnyOrderGroups(raw);

  // Strip section headers like "Questions 11-15" / "Question 13" so those
  // numbers are not treated as answers (and can't steal the next line via \s).
  let text = raw
    .replace(/\r/g, "")
    .replace(/questions?\s+\d+\s*[-–—to]+\s*\d+/gi, "\n")
    .replace(/^[\t ]*questions?\s+\d+\s*[:.\-–—]?[\t ]*$/gim, "\n")
    .replace(/^(?:answers?|answer\s*key|listening|reading|section)\b.*$/gim, "\n");

  // Remove explicit any-order range lines so they don't create junk per-Q parses
  text = text.replace(
    /(\d+)\s*[-–—to&+]+\s*(\d+)[^\n]*(?:any\s*order)?[^\n]*[A-Ga-g]/gi,
    "\n",
  );

  // Pass 1: compact letter / judgment answers (same line only — never cross \n)
  const compactRe =
    /(\d+)[^\S\n]*(?:[.):\-–—][^\S\n]*)?(TRUE|FALSE|YES|NO|NOT[^\S\n]+GIVEN|NG|[A-Ga-g])(?=[^\S\n]*\d|[^\S\n]*$|[^A-Za-z\n])/gi;
  for (const m of text.matchAll(compactRe)) {
    addAnswer(key, Number(m[1]), m[2].replace(/\s+/g, " "));
  }

  // Pass 2: word / phrase answers
  const startRe = /(\d+)[^\S\n]*[.):\-–—]?[^\S\n]*/g;
  const starts: Array<{ n: number; valueStart: number; index: number }> = [];
  for (const m of text.matchAll(startRe)) {
    const valueStart = m.index! + m[0].length;
    const nextChar = text[valueStart];
    if (nextChar === undefined || !/\S/.test(nextChar)) continue;
    // Don't treat the bare number inside a leftover "Question N" header
    const before = text.slice(Math.max(0, m.index! - 12), m.index!);
    if (/questions?\s*$/i.test(before)) continue;
    starts.push({ n: Number(m[1]), valueStart, index: m.index! });
  }

  for (let i = 0; i < starts.length; i++) {
    const cur = starts[i];
    const k = answerKey(cur.n);
    if (key[k]?.length) continue;

    const end = i + 1 < starts.length ? starts[i + 1].index : text.length;
    let value = text.slice(cur.valueStart, end).trim();
    // Keep to the current line for phrase answers (headers / next Q on new lines)
    const nl = value.indexOf("\n");
    if (nl >= 0) value = value.slice(0, nl).trim();
    value = value.replace(/^[:.\-–—)\s]+/, "").replace(/[,;\s]+$/g, "").trim();
    if (!value) continue;
    if (/^questions?\b/i.test(value)) continue;
    if (/^(\d+\s*[A-Ga-g]\s*)+$/i.test(value)) continue;
    addAnswer(key, cur.n, value);
  }

  // Pass 3: classic one-answer-per-line
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^questions?\s+\d+\b/i.test(trimmed) && !/\d\s+[A-Za-z]/.test(trimmed)) {
      continue;
    }
    const match = trimmed.match(
      /^(?:q(?:uestion)?\s*)?(\d+)\s*[.):\-–—]?\s+(.+)$/i,
    );
    if (!match) continue;
    const n = Number(match[1]);
    const rest = match[2].trim();
    if (!rest) continue;
    const gluedOnLine = [
      ...rest.matchAll(
        /(\d+)[^\S\n]*(?:[.):\-–—][^\S\n]*)?(TRUE|FALSE|YES|NO|NOT[^\S\n]+GIVEN|NG|[A-Ga-g])(?=[^\S\n]*\d|[^\S\n]*$|[^A-Za-z\n])/gi,
      ),
    ];
    if (gluedOnLine.length >= 1 && /^\s*[A-Ga-g]\s*\d/i.test(rest)) continue;
    if (gluedOnLine.length >= 2) continue;
    addAnswer(key, n, rest);
  }

  // Fill per-question key slots from any-order pools (for display / fallback)
  for (const g of anyOrderGroups) {
    if (!g.answers?.length) continue;
    g.questions.forEach((n, i) => {
      const letter = g.answers![i] ?? g.answers![0];
      if (!key[answerKey(n)]?.length) addAnswer(key, n, letter);
    });
  }

  const count = Object.keys(key).length;
  if (count === 0 && raw.trim()) {
    warnings.push("No numbered answers found — check the paste format.");
  }

  return { key, count, warnings: warnings.slice(0, 8), anyOrderGroups };
}

export function answersMatch(userRaw: string, expectedAlts: string[]): boolean {
  const user = userRaw.trim();
  if (!user || !expectedAlts.length) return false;

  const userLetters = normalizeLetters(user);
  const userNorm = normalizeAnswer(user);

  return expectedAlts.some((alt) => {
    const altLetters = normalizeLetters(alt);
    if (userLetters && altLetters) return userLetters === altLetters;
    return normalizeAnswer(alt) === userNorm;
  });
}

function letterToken(raw: string): string | null {
  const t = raw.trim().toUpperCase();
  if (/^[A-G]$/.test(t)) return t;
  const letters = normalizeLetters(raw);
  return letters && letters.length === 1 ? letters : null;
}

function poolFromKey(
  key: AnswerKeyMap,
  questions: number[],
  explicit?: string[],
): string[] {
  if (explicit?.length) {
    return explicit.map((a) => a.toUpperCase());
  }
  const pool: string[] = [];
  for (const n of questions) {
    const alts = key[answerKey(n)] ?? [];
    for (const alt of alts) {
      const L = letterToken(alt);
      if (L) pool.push(L);
      else pool.push(alt);
    }
  }
  return pool;
}

function markAnyOrderGroup(
  answers: AnswersMap,
  key: AnswerKeyMap,
  group: AnyOrderGroup,
  out: Record<string, MarkResult>,
) {
  const pool = poolFromKey(key, group.questions, group.answers);
  if (!pool.length) {
    for (const n of group.questions) {
      out[answerKey(n)] = { status: "missing-key" };
    }
    return;
  }

  const remaining = [...pool];
  const expectedDisplay = [...new Set(pool)];

  for (const n of group.questions) {
    const k = answerKey(n);
    const user = (answers[k] ?? "").trim();
    if (!user) {
      out[k] = { status: "blank", expected: expectedDisplay };
      continue;
    }
    const token = letterToken(user) ?? normalizeAnswer(user);
    const idx = remaining.findIndex((r) => {
      const rt = letterToken(r) ?? normalizeAnswer(r);
      return rt === token;
    });
    if (idx >= 0) {
      remaining.splice(idx, 1);
      out[k] = { status: "correct", expected: expectedDisplay };
    } else {
      out[k] = { status: "incorrect", expected: expectedDisplay };
    }
  }
}

function mergeAnyOrderGroups(
  fromKey: AnyOrderGroup[],
  fromExam: number[][],
): AnyOrderGroup[] {
  const merged = dedupeGroups([
    ...fromKey,
    ...fromExam.map((questions) => ({ questions })),
  ]);
  return merged;
}

export function markAnswers(
  answers: AnswersMap,
  key: AnswerKeyMap,
  questionNumbers: number[],
  options?: {
    anyOrderGroups?: AnyOrderGroup[];
    examAnyOrderGroups?: number[][];
  },
): Record<string, MarkResult> {
  const out: Record<string, MarkResult> = {};
  const groups = mergeAnyOrderGroups(
    options?.anyOrderGroups ?? [],
    options?.examAnyOrderGroups ?? [],
  );

  const inGroup = new Set<number>();
  for (const g of groups) {
    // Only apply if we have key material for at least one question in the group
    const hasKey = g.questions.some(
      (n) => (key[answerKey(n)]?.length ?? 0) > 0 || (g.answers?.length ?? 0) > 0,
    );
    if (!hasKey) continue;
    markAnyOrderGroup(answers, key, g, out);
    for (const n of g.questions) inGroup.add(n);
  }

  for (const n of questionNumbers) {
    if (inGroup.has(n)) continue;
    const k = answerKey(n);
    const expected = key[k];
    const user = (answers[k] ?? "").trim();
    if (!expected?.length) {
      out[k] = { status: "missing-key" };
      continue;
    }
    if (!user) {
      out[k] = { status: "blank", expected };
      continue;
    }
    out[k] = {
      status: answersMatch(user, expected) ? "correct" : "incorrect",
      expected,
    };
  }
  return out;
}

export function scoreMarks(marks: Record<string, MarkResult>): {
  correct: number;
  incorrect: number;
  blank: number;
  missingKey: number;
  total: number;
} {
  let correct = 0;
  let incorrect = 0;
  let blank = 0;
  let missingKey = 0;
  for (const m of Object.values(marks)) {
    if (m.status === "correct") correct += 1;
    else if (m.status === "incorrect") incorrect += 1;
    else if (m.status === "blank") blank += 1;
    else missingKey += 1;
  }
  return {
    correct,
    incorrect,
    blank,
    missingKey,
    total: Object.keys(marks).length,
  };
}
