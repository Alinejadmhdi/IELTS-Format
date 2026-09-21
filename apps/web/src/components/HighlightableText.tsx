import { useCallback, useRef } from "react";
import {
  mergeRangesForBlock,
  type HighlightRange,
} from "../lib/persistence";

type Props = {
  blockKey: string;
  text: string;
  highlights: HighlightRange[];
  onAddHighlight: (h: Omit<HighlightRange, "id">) => void;
  as?: "p" | "div" | "span" | "h2" | "h3" | "dt";
  className?: string;
};

type Node = { type: "text" | "mark"; value: string };

function applyHighlights(text: string, ranges: HighlightRange[]): Node[] {
  const relevant = mergeRangesForBlock(
    ranges
      .filter((h) => h.end > h.start && h.start < text.length)
      .map((h) => ({
        ...h,
        start: Math.max(0, h.start),
        end: Math.min(text.length, h.end),
      })),
  );

  if (!relevant.length) return [{ type: "text", value: text }];

  const nodes: Node[] = [];
  let cursor = 0;
  for (const h of relevant) {
    if (h.start > cursor) {
      nodes.push({ type: "text", value: text.slice(cursor, h.start) });
    }
    // Slice from cursor so overlapping ranges never reprint earlier characters
    const from = Math.max(h.start, cursor);
    if (h.end > from) {
      nodes.push({ type: "mark", value: text.slice(from, h.end) });
    }
    cursor = Math.max(cursor, h.end);
  }
  if (cursor < text.length) {
    nodes.push({ type: "text", value: text.slice(cursor) });
  }
  return nodes;
}

function offsetsInElement(
  el: HTMLElement,
  range: Range,
): { start: number; end: number } | null {
  if (!el.contains(range.commonAncestorContainer)) return null;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  const selected = range.toString();
  return { start, end: start + selected.length };
}

export function HighlightableText({
  blockKey,
  text,
  highlights,
  onAddHighlight,
  as: Tag = "p",
  className,
}: Props) {
  const ref = useRef<HTMLElement | null>(null);

  const onMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !ref.current || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    if (
      !ref.current.contains(range.commonAncestorContainer) ||
      !ref.current.contains(sel.anchorNode) ||
      !ref.current.contains(sel.focusNode)
    ) {
      return;
    }

    const selected = sel.toString();
    if (!selected.trim()) return;

    const offsets = offsetsInElement(ref.current, range);
    if (!offsets || offsets.end <= offsets.start) return;

    onAddHighlight({
      blockKey,
      start: offsets.start,
      end: offsets.end,
      text: selected,
    });
    sel.removeAllRanges();
  }, [blockKey, onAddHighlight]);

  const nodes = applyHighlights(
    text,
    highlights.filter((h) => h.blockKey === blockKey),
  );

  return (
    <Tag
      ref={ref as never}
      className={`highlightable ${className ?? ""}`}
      onMouseUp={onMouseUp}
      title="Select text to highlight"
    >
      {nodes.map((n, i) =>
        n.type === "mark" ? (
          <mark key={i} className="exam-hl">
            {n.value}
          </mark>
        ) : (
          <span key={i}>{n.value}</span>
        ),
      )}
    </Tag>
  );
}
