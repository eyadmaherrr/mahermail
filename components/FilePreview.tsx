"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import { fmtSize } from "@/lib/client";
import { extOf, fileType, previewKind, typeLabel, type PreviewKind } from "@/lib/filetypes";

/** A file the previewer can show — an attachment on the server, or one picked from this computer. */
export type PreviewFile = {
  key: string;
  name: string;
  size: number;
  /** loads the bytes, reporting progress 0…1 when the size is known */
  load: (signal: AbortSignal, onProgress: (p: number) => void) => Promise<Blob>;
  /** server download link (used until the bytes are loaded) */
  href?: string;
};

/** An attachment stored with Resend, fetched through /api/files/…&raw=1 (see that route for why). */
export function remoteFile(key: string, name: string, size: number, href: string): PreviewFile {
  return { key, name, size, href, load: (signal, onProgress) => fetchWithProgress(`${href}&raw=1`, signal, onProgress, size) };
}

/** A file picked on this computer (e.g. an attachment in a message being written). */
export function localFile(key: string, file: File): PreviewFile {
  return { key, name: file.name, size: file.size, load: async () => file };
}

async function fetchWithProgress(url: string, signal: AbortSignal, onProgress: (p: number) => void, sizeHint: number) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error((await res.text().catch(() => "")) || `Couldn’t load the file (${res.status})`);
  const total = Number(res.headers.get("content-length")) || sizeHint || 0;
  if (!res.body || !total) return res.blob();
  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as BlobPart);
    received += value.length;
    onProgress(Math.min(1, received / total));
  }
  return new Blob(chunks);
}

/** Blob URL with a type from our allow-list (never one the file chose), revoked when it's no longer shown. */
function useObjectUrl(blob: Blob | undefined, mime: string) {
  // created and revoked by the same effect, so a re-run (e.g. React Strict Mode) never leaves
  // an element pointing at a URL that was already revoked
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) { setUrl(null); return; }
    const u = URL.createObjectURL(new Blob([blob], { type: mime || "application/octet-stream" }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob, mime]);
  return url;
}

const TEXT_LIMIT = 2 * 1024 * 1024; // show the first 2 MB of very large text files
const ROW_LIMIT = 2000;

type Load = { status: "loading" | "ready" | "error"; progress: number; blob?: Blob; error?: string };

export default function FilePreview({ files, index, onIndex, onClose }: {
  files: PreviewFile[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const file = files[index];
  const { kind, mime } = previewKind(file.name);
  const [load, setLoad] = useState<Load>({ status: "loading", progress: 0 });
  // a preview that turns out not to work in this browser (e.g. HEIC in Chrome) falls back to the file card
  const [unsupported, setUnsupported] = useState(false);
  const markUnsupported = useCallback(() => setUnsupported(true), []); // stable, so renderers don't re-parse

  useEffect(() => {
    setUnsupported(false);
    if (kind === "other") { setLoad({ status: "ready", progress: 1 }); return; } // nothing to render — don't download it
    const ac = new AbortController();
    setLoad({ status: "loading", progress: 0 });
    file.load(ac.signal, (p) => setLoad((s) => (s.status === "loading" ? { ...s, progress: p } : s)))
      .then((blob) => setLoad({ status: "ready", progress: 1, blob }))
      .catch((e) => { if (!ac.signal.aborted) setLoad({ status: "error", progress: 0, error: (e as Error).message }); });
    return () => ac.abort();
    // a new file means a new load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.key]);

  // keys belong to the previewer while it's open (capture phase, so the app's own shortcuts don't also fire)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      else if (e.key === "ArrowRight" && index < files.length - 1) onIndex(index + 1);
      else if (e.target instanceof HTMLMediaElement && (e.key === " " || e.key.startsWith("Arrow"))) return; // let media controls work
      else return void e.stopPropagation();
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, files.length, onIndex, onClose]);

  // download the bytes we already have (right name, no second fetch); otherwise use the server link
  const downloadUrl = useObjectUrl(load.blob, "application/octet-stream");
  const viewUrl = useObjectUrl(
    load.blob && ["image", "pdf", "video", "audio", "text", "code", "json", "csv", "html"].includes(kind) ? load.blob : undefined,
    ["text", "code", "json", "csv", "html"].includes(kind) ? "text/plain;charset=utf-8" : mime,
  );

  const target = typeof document !== "undefined" ? (document.querySelector(".root") ?? document.body) : null;
  if (!target) return null;

  return createPortal(
    <div className="pv" role="dialog" aria-modal="true" aria-label={`Preview of ${file.name}`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <header className="pv-bar">
        <span className="ext" data-type={fileType(file.name)}>{(extOf(file.name) || "file").slice(0, 4)}</span>
        <div className="pv-title">
          <b title={file.name}>{file.name}</b>
          <small>{typeLabel(file.name)} · {fmtSize(file.size || load.blob?.size || 0)}</small>
        </div>
        {files.length > 1 && (
          <div className="pv-pager">
            <button className="icon-btn" title="Previous file (←)" disabled={index === 0} onClick={() => onIndex(index - 1)}><Icon name="back" /></button>
            <span>{index + 1} of {files.length}</span>
            <button className="icon-btn" title="Next file (→)" disabled={index === files.length - 1} onClick={() => onIndex(index + 1)}><Icon name="fwd" /></button>
          </div>
        )}
        <span className="spacer" />
        {viewUrl && (
          <a className="icon-btn" href={viewUrl} target="_blank" rel="noreferrer" title="Open in a new tab"><Icon name="max" /></a>
        )}
        <a
          className="btn sm pv-download"
          href={downloadUrl ?? file.href ?? undefined}
          download={file.name}
          target={downloadUrl ? undefined : "_blank"}
          rel="noreferrer"
          aria-disabled={!downloadUrl && !file.href}
        >
          <Icon name="download" />Download
        </a>
        <button className="icon-btn" title="Close (Esc)" onClick={onClose}><Icon name="x" /></button>
      </header>

      <div className="pv-stage" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        {load.status === "loading" ? (
          <div className="pv-loading">
            <span className="spinner" />
            <div className="pv-progress"><span style={{ width: `${Math.round(load.progress * 100)}%` }} /></div>
            <small>Loading {file.name}…</small>
          </div>
        ) : load.status === "error" ? (
          <FileCard file={file} kind={kind} message={`Couldn’t load this file: ${load.error}`} />
        ) : kind === "other" || unsupported || !load.blob ? (
          <FileCard file={file} kind={kind} message={unsupported ? "This browser can’t display this format." : undefined} />
        ) : (
          <Renderer key={file.key} kind={kind} name={file.name} blob={load.blob} url={viewUrl} mime={mime} onUnsupported={markUnsupported} />
        )}
      </div>
    </div>,
    target,
  );
}

function Renderer({ kind, name, blob, mime, onUnsupported }: {
  kind: PreviewKind; name: string; blob: Blob; url: string | null; mime: string; onUnsupported: () => void;
}) {
  switch (kind) {
    case "image": return <ImageView blob={blob} mime={mime} onError={onUnsupported} />;
    case "pdf": return <PdfView blob={blob} />;
    case "video": case "audio": return <MediaView kind={kind} blob={blob} mime={mime} onError={onUnsupported} />;
    case "csv": return <CsvView blob={blob} tabs={extOf(name) === "tsv"} />;
    case "html": return <HtmlView blob={blob} />;
    case "docx": return <DocxView blob={blob} onError={onUnsupported} />;
    case "sheet": return <SheetView blob={blob} onError={onUnsupported} />;
    case "zip": return <ZipView blob={blob} onError={onUnsupported} />;
    default: return <TextView blob={blob} json={kind === "json"} />;
  }
}

/* ---------------- renderers ---------------- */

function ImageView({ blob, mime, onError }: { blob: Blob; mime: string; onError: () => void }) {
  const url = useObjectUrl(blob, mime);
  const [zoom, setZoom] = useState(false);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`pv-image${zoom ? " zoom" : ""}`} src={url} alt="" onClick={() => setZoom((z) => !z)} onError={onError} title={zoom ? "Fit to window" : "Actual size"} />;
}

function PdfView({ blob }: { blob: Blob }) {
  const url = useObjectUrl(blob, "application/pdf");
  return url ? <iframe className="pv-doc" src={`${url}#view=FitH`} title="PDF preview" /> : null;
}

function MediaView({ kind, blob, mime, onError }: { kind: "video" | "audio"; blob: Blob; mime: string; onError: () => void }) {
  const url = useObjectUrl(blob, mime);
  if (!url) return null;
  return kind === "video"
    ? <video className="pv-video" src={url} controls autoPlay={false} onError={onError} />
    : <div className="pv-audio"><Icon name="clip" /><audio src={url} controls onError={onError} /></div>;
}

function useText(blob: Blob) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    blob.slice(0, TEXT_LIMIT).text().then((t) => live && setText(t));
    return () => { live = false; };
  }, [blob]);
  return { text, truncated: blob.size > TEXT_LIMIT };
}

function TextView({ blob, json }: { blob: Blob; json: boolean }) {
  const { text, truncated } = useText(blob);
  const [wrap, setWrap] = useState(true);
  const shown = useMemo(() => {
    if (text === null || !json) return text;
    try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; } // not valid JSON → as-is
  }, [text, json]);
  if (shown === null) return <span className="spinner" />;
  return (
    <div className="pv-sheet">
      <div className="pv-tools">
        <span>{shown.split("\n").length.toLocaleString()} lines{truncated ? " · showing the first 2 MB" : ""}</span>
        <span className="spacer" />
        <button className="btn ghost sm" onClick={() => setWrap((w) => !w)}>{wrap ? "Don’t wrap" : "Wrap lines"}</button>
      </div>
      <pre className={`pv-text${wrap ? " wrap" : ""}`}>{shown}</pre>
    </div>
  );
}

/** Minimal CSV/TSV parser — handles quoted fields, escaped quotes and newlines inside quotes. */
function parseDelimited(text: string, sep: string, limit: number) {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length && rows.length < limit; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if ((field || row.length) && rows.length < limit) { row.push(field); rows.push(row); }
  return rows;
}

function CsvView({ blob, tabs }: { blob: Blob; tabs: boolean }) {
  const { text } = useText(blob);
  const rows = useMemo(() => (text === null ? null : parseDelimited(text, tabs ? "\t" : ",", ROW_LIMIT + 1)), [text, tabs]);
  if (!rows) return <span className="spinner" />;
  const [head, ...body] = rows;
  return (
    <div className="pv-sheet">
      <div className="pv-tools"><span>{Math.min(body.length, ROW_LIMIT).toLocaleString()} rows{body.length > ROW_LIMIT ? ` · showing the first ${ROW_LIMIT.toLocaleString()}` : ""}</span></div>
      <div className="pv-table-wrap">
        <table className="pv-table">
          <thead><tr><th>#</th>{head?.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
          <tbody>{body.slice(0, ROW_LIMIT).map((r, i) => <tr key={i}><td>{i + 1}</td>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

// Untrusted markup is shown in a sandboxed frame: no scripts, no remote loads, no navigation.
const FRAME_CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data: blob:">`;

function HtmlView({ blob }: { blob: Blob }) {
  const { text } = useText(blob);
  const [source, setSource] = useState(false);
  if (text === null) return <span className="spinner" />;
  return (
    <div className="pv-sheet">
      <div className="pv-tools">
        <span>Shown safely: scripts and remote content are blocked</span>
        <span className="spacer" />
        <div className="segmented">
          <button className={source ? "" : "on"} onClick={() => setSource(false)}>Page</button>
          <button className={source ? "on" : ""} onClick={() => setSource(true)}>Source</button>
        </div>
      </div>
      {source
        ? <pre className="pv-text wrap">{text}</pre>
        : <iframe className="pv-doc white" sandbox="" srcDoc={`<!doctype html><html><head><meta charset="utf-8">${FRAME_CSP}</head><body>${text}</body></html>`} title="Page preview" />}
    </div>
  );
}

function DocxView({ blob, onError }: { blob: Blob; onError: () => void }) {
  const [busy, setBusy] = useState(true);
  // allow-same-origin only so we can draw into the frame; without allow-scripts nothing inside can run
  return (
    <div className="pv-sheet">
      {busy && <div className="pv-tools"><span className="spinner" /><span>Laying out pages…</span></div>}
      <iframe
        className="pv-doc docx"
        sandbox="allow-same-origin"
        title="Word document preview"
        srcDoc={`<!doctype html><html><head><meta charset="utf-8">${FRAME_CSP}<style>body{margin:0;background:#e9eef3}.docx-wrapper{background:#e9eef3!important;padding:24px!important}.docx-wrapper>section.docx{box-shadow:0 4px 18px rgba(11,45,77,.15)!important;margin-bottom:24px!important}</style></head><body></body></html>`}
        onLoad={async (e) => {
          const doc = e.currentTarget.contentDocument;
          if (!doc) return;
          try {
            const { renderAsync } = await import("docx-preview");
            await renderAsync(blob, doc.body, doc.head, { inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true, useBase64URL: true });
          } catch {
            onError();
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function SheetView({ blob, onError }: { blob: Blob; onError: () => void }) {
  const [book, setBook] = useState<{ names: string[]; html: (n: string) => string; rows: (n: string) => number } | null>(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await blob.arrayBuffer(), { type: "array", sheetRows: ROW_LIMIT + 1, cellDates: true });
        if (!live) return;
        setBook({
          names: wb.SheetNames,
          // sheet_to_html escapes cell text; it's still shown in a sandboxed frame
          html: (n) => XLSX.utils.sheet_to_html(wb.Sheets[n], { header: "", footer: "" }),
          rows: (n) => {
            const ref = wb.Sheets[n]["!ref"];
            return ref ? XLSX.utils.decode_range(ref).e.r + 1 : 0;
          },
        });
      } catch {
        if (live) onError();
      }
    })();
    return () => { live = false; };
  }, [blob, onError]);

  if (!book) return <span className="spinner" />;
  const name = book.names[active];
  const style = "body{margin:0;font:13px/1.4 -apple-system,Segoe UI,Arial,sans-serif;color:#17212b}table{border-collapse:collapse}td,th{border:1px solid #e3e8ef;padding:4px 8px;white-space:nowrap;max-width:420px;overflow:hidden;text-overflow:ellipsis}tr:nth-child(even) td{background:#f7fafc}tr:first-child td{background:#edf4f9;font-weight:600;position:sticky;top:0}";
  return (
    <div className="pv-sheet">
      <div className="pv-tools">
        {book.names.length > 1 ? (
          <div className="pv-tabs" role="tablist">
            {book.names.map((n, i) => (
              <button key={n} role="tab" aria-selected={i === active} className={i === active ? "on" : ""} onClick={() => setActive(i)}>{n}</button>
            ))}
          </div>
        ) : <span>{name}</span>}
        <span className="spacer" />
        <span>{book.rows(name) > ROW_LIMIT ? `Showing the first ${ROW_LIMIT.toLocaleString()} rows` : `${book.rows(name).toLocaleString()} rows`}</span>
      </div>
      <iframe
        key={name}
        className="pv-doc white"
        sandbox=""
        title={`Sheet ${name}`}
        srcDoc={`<!doctype html><html><head><meta charset="utf-8">${FRAME_CSP}<style>${style}</style></head><body>${book.html(name)}</body></html>`}
      />
    </div>
  );
}

function ZipView({ blob, onError }: { blob: Blob; onError: () => void }) {
  const [entries, setEntries] = useState<{ name: string; dir: boolean; size: number; date: Date }[] | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(blob); // only reads the directory — nothing is extracted
        if (!live) return;
        setEntries(Object.values(zip.files).map((f) => ({
          name: f.name,
          dir: f.dir,
          size: (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0,
          date: f.date,
        })).sort((a, b) => a.name.localeCompare(b.name)));
      } catch {
        if (live) onError();
      }
    })();
    return () => { live = false; };
  }, [blob, onError]);

  if (!entries) return <span className="spinner" />;
  const files = entries.filter((e) => !e.dir);
  return (
    <div className="pv-sheet">
      <div className="pv-tools"><span>{files.length.toLocaleString()} files · {fmtSize(files.reduce((n, f) => n + f.size, 0))} uncompressed</span></div>
      <div className="pv-table-wrap">
        <table className="pv-table">
          <thead><tr><th>Name</th><th>Size</th><th>Modified</th></tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.name}>
                <td className={e.dir ? "dir" : ""}>{e.dir ? "📁 " : ""}{e.name}</td>
                <td>{e.dir ? "" : fmtSize(e.size)}</td>
                <td>{e.date.toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FileCard({ file, kind, message }: { file: PreviewFile; kind: PreviewKind; message?: string }) {
  return (
    <div className="pv-card glass-thick">
      <span className="ext big" data-type={fileType(file.name)}>{(extOf(file.name) || "file").slice(0, 4)}</span>
      <b>{file.name}</b>
      <small>{typeLabel(file.name)} · {fmtSize(file.size)}</small>
      <p>{message ?? (kind === "other" ? "There’s no preview for this type of file. Download it to open it with an app on your computer." : "")}</p>
    </div>
  );
}
