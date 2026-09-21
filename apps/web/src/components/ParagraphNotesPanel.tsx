import { useEffect, useMemo, useState } from "react";
import type { ExamDocument } from "@ielts/schema";
import {
  collectPassageParagraphs,
  downloadTextFile,
  formatParagraphNotesExport,
  loadParagraphNotes,
  saveParagraphNotes,
  type ParagraphNote,
} from "../lib/paragraphNotes";

type Props = {
  exam: ExamDocument;
};

export function ParagraphNotesPanel({ exam }: Props) {
  const paragraphs = useMemo(() => collectPassageParagraphs(exam), [exam]);
  const [notes, setNotes] = useState<Record<string, ParagraphNote>>({});

  useEffect(() => {
    const saved = loadParagraphNotes(exam.id);
    const next: Record<string, ParagraphNote> = {};
    for (const p of paragraphs) {
      next[p.id] = saved[p.id] ?? {
        id: p.id,
        label: p.label,
        preview: p.preview,
        answersFrom: "",
        notes: "",
      };
      next[p.id].label = p.label;
      next[p.id].preview = p.preview;
    }
    setNotes(next);
  }, [exam.id, paragraphs]);

  useEffect(() => {
    if (!Object.keys(notes).length) return;
    saveParagraphNotes(exam.id, notes);
  }, [exam.id, notes]);

  if (!paragraphs.length) return null;

  function update(id: string, patch: Partial<ParagraphNote>) {
    setNotes((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      return { ...prev, [id]: { ...cur, ...patch } };
    });
  }

  function onExport() {
    const ordered = paragraphs.map(
      (p) =>
        notes[p.id] ?? {
          id: p.id,
          label: p.label,
          preview: p.preview,
          answersFrom: "",
          notes: "",
        },
    );
    const text = formatParagraphNotesExport(exam.title, ordered);
    const safe = (exam.title || exam.id || "reading")
      .replace(/[^\w\-]+/g, "-")
      .slice(0, 40);
    downloadTextFile(`paragraph-notes-${safe}.txt`, text);
  }

  return (
    <section className="paragraph-notes-panel" aria-label="Paragraph answer map">
      <header>
        <div>
          <h2>Paragraph notes</h2>
          <p className="muted small">
            For each passage paragraph, note which answers came from it and any
            extra detail.
          </p>
        </div>
        <button type="button" className="secondary" onClick={onExport}>
          Export paragraph notes
        </button>
      </header>

      <div className="paragraph-notes-grid">
        {paragraphs.map((p) => {
          const note = notes[p.id];
          if (!note) return null;
          return (
            <article key={p.id} className="paragraph-note-card">
              <h3>
                <span className="para-label">Paragraph {note.label}</span>
              </h3>
              <p className="para-preview" title={p.fullText}>
                {note.preview}
                {note.preview.length >= 120 ? "…" : ""}
              </p>
              <label>
                Answers from this paragraph
                <input
                  value={note.answersFrom}
                  onChange={(e) =>
                    update(p.id, { answersFrom: e.target.value })
                  }
                  placeholder="e.g. 1, 7, 11 — or vi, FALSE"
                  autoComplete="off"
                />
              </label>
              <label>
                More information
                <textarea
                  value={note.notes}
                  onChange={(e) => update(p.id, { notes: e.target.value })}
                  rows={3}
                  placeholder="Keywords, traps, paraphrase…"
                />
              </label>
            </article>
          );
        })}
      </div>
    </section>
  );
}
