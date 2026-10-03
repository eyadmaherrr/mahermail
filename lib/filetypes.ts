// How each kind of file is previewed. Decided from the file name only — never from what the
// file (or its sender) claims to be — and every blob we hand to the browser gets a type from
// this allow-list, so e.g. an HTML file renamed to .pdf is still shown as a PDF, not run as a page.

export type PreviewKind =
  | "image" | "pdf" | "video" | "audio"
  | "text" | "code" | "json" | "csv" | "html"
  | "docx" | "sheet" | "zip" | "other";

const KINDS: Record<string, [PreviewKind, string]> = {
  // images (svg is only ever shown through <img>, where it can't run script)
  png: ["image", "image/png"], jpg: ["image", "image/jpeg"], jpeg: ["image", "image/jpeg"],
  gif: ["image", "image/gif"], webp: ["image", "image/webp"], bmp: ["image", "image/bmp"],
  ico: ["image", "image/x-icon"], avif: ["image", "image/avif"], svg: ["image", "image/svg+xml"],
  heic: ["image", "image/heic"], heif: ["image", "image/heif"], tif: ["image", "image/tiff"], tiff: ["image", "image/tiff"],
  // documents
  pdf: ["pdf", "application/pdf"],
  docx: ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xlsx: ["sheet", ""], xlsm: ["sheet", ""], xls: ["sheet", ""], ods: ["sheet", ""], numbers: ["sheet", ""],
  csv: ["csv", ""], tsv: ["csv", ""],
  // media
  mp4: ["video", "video/mp4"], m4v: ["video", "video/mp4"], webm: ["video", "video/webm"],
  mov: ["video", "video/quicktime"], ogv: ["video", "video/ogg"],
  mp3: ["audio", "audio/mpeg"], wav: ["audio", "audio/wav"], ogg: ["audio", "audio/ogg"],
  oga: ["audio", "audio/ogg"], m4a: ["audio", "audio/mp4"], aac: ["audio", "audio/aac"],
  flac: ["audio", "audio/flac"], opus: ["audio", "audio/ogg"],
  // text
  txt: ["text", ""], log: ["text", ""], md: ["text", ""], markdown: ["text", ""], rtf: ["text", ""],
  ini: ["text", ""], cfg: ["text", ""], conf: ["text", ""], env: ["text", ""], ics: ["text", ""], vcf: ["text", ""],
  json: ["json", ""], geojson: ["json", ""],
  html: ["html", ""], htm: ["html", ""],
  xml: ["code", ""], js: ["code", ""], mjs: ["code", ""], ts: ["code", ""], tsx: ["code", ""], jsx: ["code", ""],
  css: ["code", ""], scss: ["code", ""], py: ["code", ""], java: ["code", ""], c: ["code", ""], h: ["code", ""],
  cpp: ["code", ""], cs: ["code", ""], go: ["code", ""], rb: ["code", ""], php: ["code", ""], rs: ["code", ""],
  swift: ["code", ""], kt: ["code", ""], sh: ["code", ""], bat: ["code", ""], ps1: ["code", ""], sql: ["code", ""],
  yml: ["code", ""], yaml: ["code", ""], toml: ["code", ""],
  // archives
  zip: ["zip", ""],
};

export const extOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

export function previewKind(name: string): { kind: PreviewKind; mime: string } {
  const hit = KINDS[extOf(name)];
  return hit ? { kind: hit[0], mime: hit[1] } : { kind: "other", mime: "" };
}

const LABELS: Partial<Record<PreviewKind, string>> = {
  image: "Image", pdf: "PDF document", video: "Video", audio: "Audio", text: "Text", code: "Code",
  json: "JSON", csv: "Spreadsheet (CSV)", html: "Web page", docx: "Word document", sheet: "Spreadsheet", zip: "ZIP archive",
};
const OTHER_LABELS: Record<string, string> = {
  doc: "Word document (old format)", ppt: "PowerPoint", pptx: "PowerPoint presentation", key: "Keynote presentation",
  pages: "Pages document", odt: "OpenDocument text", odp: "OpenDocument presentation", rar: "RAR archive",
  "7z": "7-Zip archive", gz: "GZip archive", tar: "TAR archive", exe: "Windows program", msi: "Windows installer",
  dmg: "macOS disk image", apk: "Android app", eml: "Email message", psd: "Photoshop file", ai: "Illustrator file",
};

export function typeLabel(name: string) {
  const { kind } = previewKind(name);
  return LABELS[kind] ?? OTHER_LABELS[extOf(name)] ?? (extOf(name) ? `${extOf(name).toUpperCase()} file` : "File");
}

/** Colour family for the little extension badge on attachment cards. */
export function fileType(name: string) {
  const { kind } = previewKind(name);
  if (kind === "pdf") return "pdf";
  if (kind === "image") return "image";
  if (kind === "sheet" || kind === "csv") return "sheet";
  if (kind === "docx" || kind === "text" || ["doc", "pages", "odt", "rtf"].includes(extOf(name))) return "doc";
  if (kind === "zip" || ["rar", "7z", "gz", "tar"].includes(extOf(name))) return "archive";
  return "other";
}
