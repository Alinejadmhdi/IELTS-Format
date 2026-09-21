import { useCallback, useEffect, useState, type ClipboardEvent as ReactClipboardEvent } from "react";

type Props = {
  files: File[];
  previews: string[];
  onFiles: (files: File[], previews: string[]) => void;
};

function filesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const fromFiles = Array.from(data.files ?? []).filter((f) =>
    f.type.startsWith("image/"),
  );
  if (fromFiles.length) return fromFiles;

  const out: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) out.push(file);
    }
  }
  return out.map((file, i) => {
    if (file.name && file.name !== "image.png" && file.name !== "blob") {
      return file;
    }
    const ext = file.type.split("/")[1] || "png";
    return new File([file], `pasted-${Date.now()}-${i}.${ext}`, {
      type: file.type,
    });
  });
}

export function Dropzone({ files, previews, onFiles }: Props) {
  const [dragging, setDragging] = useState(false);
  const [pasteFlash, setPasteFlash] = useState(false);

  const ingest = useCallback(
    async (list: FileList | File[]) => {
      const next = Array.from(list).filter((f) => f.type.startsWith("image/"));
      if (!next.length) return;
      const merged = [...files, ...next];
      const urls = await Promise.all(
        merged.map(
          (f) =>
            new Promise<string>((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => resolve(String(r.result));
              r.onerror = () => reject(r.error);
              r.readAsDataURL(f);
            }),
        ),
      );
      onFiles(merged, urls);
      setPasteFlash(true);
      window.setTimeout(() => setPasteFlash(false), 600);
    },
    [files, onFiles],
  );

  const onPasteImages = useCallback(
    (e: ClipboardEvent | ReactClipboardEvent) => {
      const images = filesFromClipboard(e.clipboardData);
      if (!images.length) return;
      e.preventDefault();
      void ingest(images);
    },
    [ingest],
  );

  useEffect(() => {
    const onWindowPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const images = filesFromClipboard(e.clipboardData);
      if (!images.length) return;
      e.preventDefault();
      void ingest(images);
    };
    window.addEventListener("paste", onWindowPaste);
    return () => window.removeEventListener("paste", onWindowPaste);
  }, [ingest]);

  return (
    <div className="dropzone-panel">
      <div
        className={`dropzone ${dragging ? "dragging" : ""} ${pasteFlash ? "pasted" : ""}`}
        tabIndex={0}
        role="button"
        aria-label="Drop or paste IELTS screenshots"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("label")) return;
          (e.currentTarget as HTMLElement).focus();
        }}
        onPaste={onPasteImages}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void ingest(e.dataTransfer.files);
        }}
      >
        <p className="drop-title">Drop or paste IELTS screenshots here</p>
        <p className="drop-sub">
          Listening or Reading pages — drag &amp; drop, Ctrl+V / Cmd+V, or choose
          files (one or several).
        </p>
        <label className="file-btn">
          Choose images
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void ingest(e.target.files);
            }}
          />
        </label>
      </div>
      {previews.length > 0 && (
        <div className="preview-strip">
          {previews.map((src, i) => (
            <figure key={i}>
              <img src={src} alt={`Upload ${i + 1}`} />
              <figcaption>{files[i]?.name ?? `Page ${i + 1}`}</figcaption>
            </figure>
          ))}
          <button
            type="button"
            className="linkish"
            onClick={() => onFiles([], [])}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
