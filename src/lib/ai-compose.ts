import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { safeName, extOf, classify, type FileKind } from "@/lib/ai-files";

/* ============================================================
   Memphis AI — universal file COMPOSITION pipeline.

   The chat model writes plain text in a simple protocol
   (see COMPOSE_SYSTEM in /api/ai/chat); this library turns
   that into real, ready-to-use files:

     · text / code / data / markup   → written verbatim
     · .xlsx / .xls                  → CSV (or <<<SHEET:Name>>>
                                      sections) → real workbook
     · .docx                         → Markdown → real Word
                                      document (headings, lists,
                                      tables, code, quotes)
     · .pptx                         → <<<SLIDE>>> blocks → real
                                      PowerPoint deck (16:9, dark)
     · .pdf                          → Markdown → Word → LibreOffice
                                      headless → PDF (falls back
                                      to .docx when soffice is
                                      unavailable)
     · legacy .doc / .ppt requests   → modern format + a note

   Heavy libs (jszip, xlsx) are resolved through the project's
   real node_modules — same trick as ai-files.ts, so the
   standalone build keeps working.
   ============================================================ */

const run = promisify(execFile);
const rootRequire = createRequire(path.join(process.cwd(), "package.json"));

interface ZipLike {
  file(name: string, content: string): unknown;
  generateAsync(opts: { type: "nodebuffer"; compression: "DEFLATE" }): Promise<Buffer>;
}
function loadJSZip(): new () => ZipLike {
  return rootRequire("jszip") as new () => ZipLike;
}

export interface BuiltFile {
  name: string;
  mime: string;
  buf: Buffer;
  kind: FileKind;
  note?: string; // shown to the user when something was adapted
}

export const MAX_COMPOSE_FILES = 6; /* files per composed reply */
export const MAX_COMPOSE_CHARS = 300_000; /* chars per composed file */

/* ================================================================
   File-composition protocol parser
   ================================================================

   The chat model streams  <<<FILE: name.ext>>> …content… <<<END>>>
   blocks (optionally several) followed by a short prose summary.
   This parser splits the stream LIVE: prose goes to the chat bubble
   as deltas, file content goes to the "composing…" box via
   onFileStart/onFileDelta, and the collected blocks are converted to
   real files afterwards.

   Markers routinely arrive split across chunks (the model streams
   token by token), so this is a proper 3-state machine — prose →
   header → file — that holds back a small tail until it can't be a
   partial marker anymore. */

export class ComposeParser {
  private buf = "";
  private state: "prose" | "header" | "file" = "prose";
  private name = "";
  private content = "";
  files: { name: string; content: string }[] = [];
  prose = "";

  feed(
    chunk: string,
    cbs: {
      onProse: (t: string) => void;
      onFileStart: (name: string) => void;
      onFileDelta: (name: string, t: string) => void;
    }
  ): void {
    this.buf += chunk;
    for (;;) {
      if (this.state === "prose") {
        const i = this.buf.indexOf("<<<FILE:");
        if (i === -1) {
          /* hold back a tail that could still become a marker */
          const safe = Math.max(0, this.buf.length - 7);
          const out = this.buf.slice(0, safe);
          this.buf = this.buf.slice(safe);
          if (out) {
            this.prose += out;
            cbs.onProse(out);
          }
          return;
        }
        const before = this.buf.slice(0, i);
        if (before) {
          this.prose += before;
          cbs.onProse(before);
        }
        this.buf = this.buf.slice(i + 8);
        this.state = "header";
        continue;
      }
      if (this.state === "header") {
        const j = this.buf.indexOf(">>>");
        if (j === -1) {
          if (this.buf.length > 160) {
            /* runaway header — not a real marker; flush and rescan as prose */
            const txt = this.buf;
            this.prose += txt;
            cbs.onProse(txt);
            this.buf = "";
            this.state = "prose";
          }
          return;
        }
        this.name = this.buf
          .slice(0, j)
          .trim()
          .replace(/^["'`]+|["'`]+$/g, "")
          .trim();
        this.buf = this.buf.slice(j + 3);
        this.state = "file";
        this.content = "";
        cbs.onFileStart(this.name);
        continue;
      }
      /* state === "file" */
      const j = this.buf.indexOf("<<<END>>>");
      if (j === -1) {
        const safe = Math.max(0, this.buf.length - 8); /* partial-marker tail */
        const out = this.buf.slice(0, safe);
        this.buf = this.buf.slice(safe);
        if (out && this.content.length < MAX_COMPOSE_CHARS) {
          const piece = out.slice(0, MAX_COMPOSE_CHARS - this.content.length);
          this.content += piece;
          cbs.onFileDelta(this.name, piece);
        }
        return;
      }
      const body = this.buf.slice(0, j);
      if (body && this.content.length < MAX_COMPOSE_CHARS) {
        const piece = body.slice(0, MAX_COMPOSE_CHARS - this.content.length);
        this.content += piece;
        cbs.onFileDelta(this.name, piece);
      }
      this.files.push({ name: this.name, content: this.cleanup(this.content) });
      this.content = "";
      this.state = "prose";
      this.buf = this.buf.slice(j + 9); /* '<<<END>>>' is 9 chars */
    }
  }

  /* stream ended — keep an unterminated file with whatever arrived */
  end(): { name: string; content: string }[] {
    if (this.state === "file" && this.name) {
      if (this.buf && this.content.length < MAX_COMPOSE_CHARS)
        this.content += this.buf.slice(0, MAX_COMPOSE_CHARS - this.content.length);
      this.files.push({ name: this.name, content: this.cleanup(this.content) });
      this.buf = "";
      this.state = "prose";
    } else if (this.buf) {
      this.prose += this.buf;
      this.buf = "";
    }
    return this.files;
  }

  /* strip stray code fences the model may have added despite orders
     (markdown files are exempt — they can legitimately end with ```),
     then trim surrounding blank space */
  private cleanup(c: string): string {
    const nl = c.replace(/\r\n?/g, "\n");
    const keepFences = /\.(md|markdown)$/i.test(this.name);
    const stripped = keepFences
      ? nl
      : nl
          .replace(/^(?:\s*```[\w+#.-]*[ \t]*\n)+/, "")
          .replace(/(?:\n[ \t]*```[ \t]*)+\s*$/, "");
    return stripped.replace(/^\n+/, "").replace(/\s+$/, "");
  }
}

/* Deterministic safety net for extension drift: the model sometimes
   emits a generic .md/.txt even when the user explicitly asked for a
   concrete format. If the request names one (pdf / word / slides /
   excel) and the emitted file is generic, return the extension the
   user actually asked for. */
export function retargetExt(name: string, request: string): string | null {
  const ext = extOf(name).toLowerCase();
  if (ext !== "md" && ext !== "markdown" && ext !== "txt" && ext !== "") return null;
  const r = request.toLowerCase();
  if (/\bpdfs?\b/.test(r)) return "pdf";
  if (/\bdocx\b|\bword\b|\.doc\b/.test(r)) return "docx";
  if (/\bpptx\b|\bpowerpoint\b|\bslides?\b|\bdeck\b|\bpresentation\b/.test(r)) return "pptx";
  if (/\bxlsx\b|\bexcel\b|\bspreadsheet\b/.test(r)) return "xlsx";
  return null;
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const PDF_MIME = "application/pdf";

const TEXT_MIME: Record<string, string> = {
  txt: "text/plain", md: "text/markdown", markdown: "text/markdown", log: "text/plain",
  csv: "text/csv", tsv: "text/tab-separated-values", psv: "text/plain",
  json: "application/json", jsonl: "application/jsonl", ndjson: "application/jsonl", json5: "application/json",
  xml: "application/xml", rss: "application/xml", atom: "application/xml",
  yaml: "text/yaml", yml: "text/yaml", toml: "text/plain", ini: "text/plain", cfg: "text/plain",
  conf: "text/plain", env: "text/plain", properties: "text/plain",
  html: "text/html", htm: "text/html", css: "text/css", scss: "text/plain", less: "text/plain",
  js: "text/javascript", mjs: "text/javascript", cjs: "text/javascript", jsx: "text/javascript",
  ts: "text/typescript", tsx: "text/typescript", vue: "text/plain", svelte: "text/plain", astro: "text/plain",
  py: "text/x-python", rb: "text/x-ruby", go: "text/x-go", rs: "text/x-rust", java: "text/x-java",
  kt: "text/x-kotlin", c: "text/x-c", h: "text/x-c", cpp: "text/x-c++", hpp: "text/x-c++", cc: "text/x-c++",
  cs: "text/x-csharp", swift: "text/x-swift", m: "text/x-objc", mm: "text/x-objc", php: "text/x-php",
  pl: "text/x-perl", lua: "text/x-lua", sh: "text/x-shellscript", bash: "text/x-shellscript",
  zsh: "text/x-shellscript", fish: "text/x-shellscript", ps1: "text/plain", bat: "text/plain", cmd: "text/plain",
  sql: "application/sql", r: "text/x-r", jl: "text/x-julia", dart: "text/x-dart", scala: "text/x-scala",
  clj: "text/x-clojure", ex: "text/x-elixir", exs: "text/x-elixir", erl: "text/x-erlang", hs: "text/x-haskell",
  graphql: "text/plain", gql: "text/plain", prisma: "text/plain", dockerfile: "text/plain",
  makefile: "text/plain", cmake: "text/plain", gradle: "text/plain", tf: "text/plain", hcl: "text/plain",
  svg: "image/svg+xml", ics: "text/calendar", vcf: "text/vcard", rtf: "application/rtf",
  srt: "text/plain", vtt: "text/vtt", gitignore: "text/plain", editorconfig: "text/plain",
};

const CODE_FONT_EXTS = new Set([
  "js", "mjs", "cjs", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "kt", "c", "h",
  "cpp", "hpp", "cc", "cs", "swift", "m", "mm", "php", "pl", "lua", "sh", "bash", "zsh",
  "sql", "r", "jl", "dart", "scala", "clj", "ex", "exs", "erl", "hs", "vue", "svelte",
]);

/* ---------------- xml helpers ---------------- */

function xe(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/* ================================================================
   CSV → XLSX
   ================================================================ */

function detectSep(csv: string): string {
  const firstLine = csv.slice(0, csv.indexOf("\n") === -1 ? csv.length : csv.indexOf("\n"));
  const semi = (firstLine.match(/;/g) ?? []).length;
  const comma = (firstLine.match(/,/g) ?? []).length;
  return semi > comma ? ";" : ",";
}

/* robust CSV/semicolon-SV tokenizer → array of arrays
   (handles quoted fields with embedded separators + newlines) */
function parseCsvAoa(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === sep) {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (c !== "\r") {
      cur += c;
    }
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    rows.push(row);
  }
  /* drop blank rows */
  return rows.filter((r) => r.length > 1 || (r[0] ?? "").trim() !== "");
}

const NUMERIC_RE = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function csvToXlsx(content: string): Buffer {
  const XLSX = rootRequire("xlsx") as typeof import("xlsx");

  /* <<<SHEET:Name>>> lines split the workbook into sheets */
  const sections: { name: string; csv: string }[] = [];
  const parts = content.split(/^<<<SHEET:(.*)>>>$/m);
  if (parts.length === 1) {
    sections.push({ name: "Sheet1", csv: content });
  } else {
    if (parts[0].trim()) sections.push({ name: "Sheet1", csv: parts[0] });
    for (let i = 1; i < parts.length; i += 2) {
      sections.push({
        name: (parts[i] ?? "").trim().slice(0, 28) || `Sheet${sections.length + 1}`,
        csv: parts[i + 1] ?? "",
      });
    }
  }

  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const s of sections) {
    const csv = s.csv.replace(/^[\r\n]+/, "").replace(/[\r\n\s]+$/, "");
    if (!csv) continue;
    const aoa = parseCsvAoa(csv, detectSep(csv)).map((r) =>
      r.map((c) => (NUMERIC_RE.test(c) ? Number(c) : c))
    );
    if (!aoa.length) continue;
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    let name = s.name.replace(/[\\/?*[\]:]/g, " ").trim() || "Sheet";
    let k = 2;
    while (used.has(name)) name = `${s.name.slice(0, 25)} ${k++}`;
    used.add(name);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  if (!wb.SheetNames.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["(empty)"]]), "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/* ================================================================
   Markdown → DOCX (minimal OOXML, jszip)
   ================================================================ */

type Block =
  | { t: "h"; level: number; text: string }
  | { t: "p"; text: string }
  | { t: "list"; ordered: boolean; items: string[] }
  | { t: "quote"; text: string }
  | { t: "code"; text: string }
  | { t: "hr" }
  | { t: "table"; head: string[]; rows: string[][] };

function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = line.match(/^```[\w+#.-]*\s*$/);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++; /* closing fence (or EOF) */
      blocks.push({ t: "code", text: body.join("\n") });
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      blocks.push({ t: "h", level: Math.min(4, h[1].length), text: h[2].replace(/\s*#+\s*$/, "").trim() });
      i++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ t: "hr" });
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push({ t: "quote", text: body.join(" ") });
      continue;
    }
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const ordered = !!ol;
      const items: string[] = [];
      while (i < lines.length) {
        const l = lines[i];
        if (ordered) {
          const m = l.match(/^\s*\d+[.)]\s+(.*)$/);
          if (m) {
            items.push(m[1]);
            i++;
            continue;
          }
        } else {
          const m = l.match(/^\s*[-*+]\s+(.*)$/);
          if (m) {
            items.push(m[1]);
            i++;
            continue;
          }
        }
        if (/^\s{2,}\S/.test(l) && items.length) {
          items[items.length - 1] += ` ${l.trim()}`;
          i++;
          continue;
        }
        break;
      }
      blocks.push({ t: "list", ordered, items });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(
          lines[i]
            .trim()
            .replace(/^\||\|$/g, "")
            .split("|")
            .map((c) => c.trim())
        );
        i++;
      }
      const isSep = (r: string[]) => r.every((c) => c === "" || /^:?-{2,}:?$/.test(c));
      blocks.push({ t: "table", head: rows[0] ?? [], rows: rows.slice(1).filter((r) => !isSep(r)) });
      continue;
    }
    /* plain paragraph — consecutive simple lines joined */
    const body: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^```/.test(lines[i]) &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !/^\s*\|.*\|\s*$/.test(lines[i])
    ) {
      body.push(lines[i++]);
    }
    if (body.length) blocks.push({ t: "p", text: body.join(" ") });
    else i++; /* safety net */
  }
  return blocks;
}

interface RunOpts {
  b?: boolean;
  i?: boolean;
  code?: boolean;
}

function docxRun(text: string, o: RunOpts = {}): string {
  const rPr =
    o.b || o.i || o.code
      ? `<w:rPr>${o.b ? "<w:b/>" : ""}${o.i ? "<w:i/>" : ""}${
          o.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="19"/>' : ""
        }</w:rPr>`
      : "";
  return `<w:r>${rPr}<w:t xml:space="preserve">${xe(text)}</w:t></w:r>`;
}

/* inline markdown → runs (code > links > bold > italic, recursive) */
function inlineRuns(text: string, o: RunOpts = {}): string {
  if (!text) return "";
  const ci = text.indexOf("`");
  if (ci !== -1) {
    const ce = text.indexOf("`", ci + 1);
    if (ce !== -1 && ce > ci + 1) {
      return (
        inlineRuns(text.slice(0, ci), o) +
        docxRun(text.slice(ci + 1, ce), { ...o, code: true }) +
        inlineRuns(text.slice(ce + 1), o)
      );
    }
  }
  const lm = text.match(/\[([^\]\n]+)\]\(([^)\s]+)\)/);
  if (lm && lm.index !== undefined) {
    return (
      inlineRuns(text.slice(0, lm.index), o) +
      docxRun(`${lm[1]} (${lm[2]})`, o) +
      inlineRuns(text.slice(lm.index + lm[0].length), o)
    );
  }
  const bm = text.match(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/);
  if (bm && bm.index !== undefined) {
    return (
      inlineRuns(text.slice(0, bm.index), o) +
      inlineRuns(bm[1] ?? bm[2] ?? "", { ...o, b: true }) +
      inlineRuns(text.slice(bm.index + bm[0].length), o)
    );
  }
  const im = text.match(/\*([^*\n]+)\*|(?<![A-Za-z0-9])_([^_\n]+)_(?![A-Za-z0-9])/);
  if (im && im.index !== undefined) {
    return (
      inlineRuns(text.slice(0, im.index), o) +
      inlineRuns(im[1] ?? im[2] ?? "", { ...o, i: true }) +
      inlineRuns(text.slice(im.index + im[0].length), o)
    );
  }
  return docxRun(text, o);
}

function docxPara(runs: string, style?: string): string {
  const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${pPr}${runs || docxRun(" ")}</w:p>`;
}

function tableXml(b: { head: string[]; rows: string[][] }): string {
  const borders = ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="555555"/>`)
    .join("");
  const cell = (text: string, header: boolean) =>
    `<w:tc><w:tcPr>${header ? '<w:shd w:val="clear" w:fill="E8EDF2"/>' : ""}<w:tcW w:w="0" w:type="auto"/></w:tcPr>${docxPara(inlineRuns(text, header ? { b: true } : {}))}</w:tc>`;
  const head = `<w:tr>${(b.head.length ? b.head : [" "]).map((c) => cell(c, true)).join("")}</w:tr>`;
  const rows = b.rows
    .slice(0, 400)
    .map((r) => `<w:tr>${r.map((c) => cell(c, false)).join("")}</w:tr>`)
    .join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr>${head}${rows}</w:tbl>`;
}

function docxBodyXml(blocks: Block[]): string {
  const out: string[] = [];
  const afterTable = () => {
    if (out.length && out[out.length - 1].endsWith("</w:tbl>")) out.push("<w:p/>");
  };
  for (const b of blocks) {
    switch (b.t) {
      case "h":
        afterTable();
        out.push(docxPara(inlineRuns(b.text, { b: true }), `Heading${b.level}`));
        break;
      case "p":
        afterTable();
        out.push(docxPara(inlineRuns(b.text)));
        break;
      case "hr":
        afterTable();
        out.push(
          `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr></w:pPr></w:p>`
        );
        break;
      case "quote":
        afterTable();
        out.push(
          `<w:p><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="4" w:color="4A5568"/></w:pBdr><w:ind w:left="360"/></w:pPr>${inlineRuns(b.text, { i: true }) || docxRun(" ")}</w:p>`
        );
        break;
      case "code": {
        afterTable();
        const lines = b.text.split("\n").slice(0, 800);
        for (const ln of lines) out.push(docxPara(docxRun(ln || " ", { code: true }), "CodePara"));
        break;
      }
      case "list":
        afterTable();
        b.items.slice(0, 300).forEach((item, k) => {
          const label = b.ordered ? `${k + 1}. ` : "\u2022 ";
          out.push(`<w:p><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>${inlineRuns(label + item)}</w:p>`);
        });
        break;
      case "table":
        out.push(tableXml(b));
        break;
    }
  }
  afterTable();
  return out.join("");
}

const DOCX_STYLES = `${XML_HEAD}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
<w:pPr><w:keepNext/><w:spacing w:before="320" w:after="140"/></w:pPr>
<w:rPr><w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/><w:b/><w:color w:val="1F3864"/><w:sz w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
<w:pPr><w:keepNext/><w:spacing w:before="260" w:after="120"/></w:pPr>
<w:rPr><w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/><w:b/><w:color w:val="2E74B5"/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
<w:pPr><w:keepNext/><w:spacing w:before="220" w:after="100"/></w:pPr>
<w:rPr><w:b/><w:color w:val="2E74B5"/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
<w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/></w:pPr>
<w:rPr><w:b/><w:i/><w:color w:val="2E74B5"/><w:sz w:val="23"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="CodePara"><w:name w:val="Code Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/>
<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:shd w:val="clear" w:fill="F5F5F5"/><w:ind w:left="240"/></w:pPr>
<w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="19"/></w:rPr></w:style>
</w:styles>`;

export async function mdToDocx(md: string, title: string): Promise<Buffer> {
  const JSZip = loadJSZip();
  const zip = new JSZip();
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  zip.file(
    "[Content_Types].xml",
    `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`
  );
  zip.file(
    "_rels/.rels",
    `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`
  );
  zip.file(
    "docProps/core.xml",
    `${XML_HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${xe(title.slice(0, 120))}</dc:title><dc:creator>Memphis AI</dc:creator><cp:lastModifiedBy>Memphis AI</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`
  );
  zip.file(
    "docProps/app.xml",
    `${XML_HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Memphis AI</Application></Properties>`
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
  );
  zip.file("word/styles.xml", DOCX_STYLES);
  zip.file(
    "word/document.xml",
    `${XML_HEAD}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${docxBodyXml(parseBlocks(md))}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body>
</w:document>`
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/* ================================================================
   Slides → PPTX (minimal OOXML, jszip)
   ================================================================ */

const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";

interface Slide {
  title: string;
  bullets: string[];
}

function parseSlides(content: string, fallbackTitle: string): Slide[] {
  const parts = content
    .split(/^\s*<<<SLIDE>>>\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
  const slides = parts.map((p) => {
    const lines = p
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const first = lines[0] ?? "Slide";
    const title = first.replace(/^#+\s*/, "").slice(0, 120);
    const bullets = lines
      .slice(1)
      .map((l) => l.replace(/^[-*+]\s*/, ""))
      .filter(Boolean)
      .slice(0, 9)
      .map((s) => s.slice(0, 240));
    return { title, bullets };
  });
  if (!slides.length) slides.push({ title: fallbackTitle, bullets: [] });
  return slides.slice(0, 40);
}

function slideXml(s: Slide): string {
  const bullets = s.bullets.length
    ? s.bullets
        .map(
          (b) => `<a:p><a:pPr marL="342900" indent="-342900"><a:buClr><a:srgbClr val="38BDF8"/></a:buClr><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="\u2022"/></a:pPr><a:r><a:rPr lang="en-US" sz="1800" dirty="0"><a:solidFill><a:srgbClr val="E5E7EB"/></a:solidFill></a:rPr><a:t>${xe(b)}</a:t></a:r></a:p>`
        )
        .join("")
    : `<a:p><a:endParaRPr lang="en-US"/></a:p>`;
  return `${XML_HEAD}<p:sld xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}">
<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="0B1220"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="838200" y="457200"/><a:ext cx="10477500" cy="1600200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
<p:txBody><a:bodyPr wrap="square" anchor="t"><a:normAutofit fontScale="100000" lnSpcReduction="0"/></a:bodyPr><a:lstStyle/>
<a:p><a:pPr algn="l"/><a:r><a:rPr lang="en-US" sz="3400" b="1" dirty="0"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>${xe(s.title)}</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="990600" y="2286000"/><a:ext cx="10210800" cy="4000500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
<p:txBody><a:bodyPr wrap="square" anchor="t"><a:normAutofit fontScale="100000" lnSpcReduction="0"/></a:bodyPr><a:lstStyle/>${bullets}</p:txBody></p:sp>
</p:spTree></p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

const THEME_XML = `${XML_HEAD}<a:theme xmlns:a="${A_NS}" name="Memphis"><a:themeElements>
<a:clrScheme name="Memphis"><a:dk1><a:srgbClr val="0B1220"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="F3F4F6"/></a:lt2>
<a:accent1><a:srgbClr val="38BDF8"/></a:accent1><a:accent2><a:srgbClr val="818CF8"/></a:accent2>
<a:accent3><a:srgbClr val="34D399"/></a:accent3><a:accent4><a:srgbClr val="FBBF24"/></a:accent4>
<a:accent5><a:srgbClr val="FB7185"/></a:accent5><a:accent6><a:srgbClr val="A78BFA"/></a:accent6>
<a:hlink><a:srgbClr val="38BDF8"/></a:hlink><a:folHlink><a:srgbClr val="818CF8"/></a:folHlink></a:clrScheme>
<a:fontScheme name="Memphis"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>
<a:fmtScheme name="Memphis"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
<a:lnStyleLst><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
</a:themeElements></a:theme>`;

export async function slidesToPptx(content: string, title: string): Promise<Buffer> {
  const JSZip = loadJSZip();
  const zip = new JSZip();
  const slides = parseSlides(content, title);
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");

  const overrides = slides
    .map(
      (_, i) =>
        `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
    )
    .join("");
  zip.file(
    "[Content_Types].xml",
    `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
${overrides}
</Types>`
  );
  zip.file(
    "_rels/.rels",
    `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`
  );
  zip.file(
    "docProps/core.xml",
    `${XML_HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${xe(title.slice(0, 120))}</dc:title><dc:creator>Memphis AI</dc:creator><cp:lastModifiedBy>Memphis AI</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`
  );
  zip.file(
    "docProps/app.xml",
    `${XML_HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Memphis AI</Application><Slides>${slides.length}</Slides></Properties>`
  );
  zip.file(
    "ppt/presentation.xml",
    `${XML_HEAD}<p:presentation xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}" saveSubsetFonts="1">
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
<p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("")}</p:sldIdLst>
<p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`
  );
  const themeRid = `rId${slides.length + 2}`;
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
${slides
  .map(
    (_, i) =>
      `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`
  )
  .join("\n")}
<Relationship Id="${themeRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
</Relationships>`
  );
  zip.file("ppt/theme/theme1.xml", THEME_XML);
  zip.file(
    "ppt/slideMasters/slideMaster1.xml",
    `${XML_HEAD}<p:sldMaster xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}">
<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="0B1220"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
<p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="3600"/></a:lvl1pPr></p:titleStyle>
<p:bodyStyle><a:lvl1pPr><a:defRPr sz="2000"/></a:lvl1pPr></p:bodyStyle>
<p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles>
</p:sldMaster>`
  );
  zip.file(
    "ppt/slideMasters/_rels/slideMaster1.xml.rels",
    `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`
  );
  zip.file(
    "ppt/slideLayouts/slideLayout1.xml",
    `${XML_HEAD}<p:sldLayout xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}" type="blank" preserve="1">
<p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`
  );
  zip.file(
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`
  );
  slides.forEach((s, i) => {
    zip.file(`ppt/slides/slide${i + 1}.xml`, slideXml(s));
    zip.file(
      `ppt/slides/_rels/slide${i + 1}.xml.rels`,
      `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`
    );
  });
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/* ================================================================
   DOCX → PDF (LibreOffice headless, unique profile per call)
   ================================================================ */

async function docxToPdf(docxBuf: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "memphis-pdf-"));
  try {
    const docxPath = path.join(dir, "doc.docx");
    await writeFile(docxPath, docxBuf);
    await run(
      "soffice",
      [
        "--headless", "--norestore", "--nolockcheck",
        `-env:UserInstallation=file://${dir}/lo`,
        "--convert-to", "pdf", "--outdir", dir, docxPath,
      ],
      { timeout: 120_000 }
    );
    const pdf = await readFile(path.join(dir, "doc.pdf"));
    if (!pdf.subarray(0, 4).toString("latin1").startsWith("%PDF")) throw new Error("conversion produced no PDF");
    return pdf;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/* ================================================================
   main entry — turn (name, model text) into a real file
   ================================================================ */

export async function buildFile(rawName: string, content: string): Promise<BuiltFile> {
  let name = safeName(rawName).trim();
  if (!name) name = "file.txt";
  let ext = extOf(name);
  if (!ext) {
    name += CODE_HINT_EXT(content);
    ext = extOf(name);
  }
  const note = undefined;

  switch (ext) {
    case "xlsx":
    case "xlsm": {
      const buf = csvToXlsx(content);
      return { name, mime: XLSX_MIME, buf, kind: classify(name, XLSX_MIME), note };
    }
    case "xls": {
      const buf = csvToXlsx(content);
      const renamed = name.replace(/\.xls$/i, ".xlsx");
      return { name: renamed, mime: XLSX_MIME, buf, kind: "sheet", note: "saved as .xlsx (modern Excel format)" };
    }
    case "docx": {
      const buf = await mdToDocx(content, name);
      return { name, mime: DOCX_MIME, buf, kind: "word", note };
    }
    case "doc": {
      const buf = await mdToDocx(content, name);
      const renamed = name.replace(/\.doc$/i, ".docx");
      return { name: renamed, mime: DOCX_MIME, buf, kind: "word", note: "saved as .docx (modern Word format)" };
    }
    case "pdf": {
      const docxBuf = await mdToDocx(content, name);
      try {
        const buf = await docxToPdf(docxBuf);
        return { name, mime: PDF_MIME, buf, kind: "pdf", note };
      } catch {
        const renamed = name.replace(/\.pdf$/i, ".docx");
        return { name: renamed, mime: DOCX_MIME, buf: docxBuf, kind: "word", note: "PDF export isn't available on this server right now — saved as .docx instead" };
      }
    }
    case "pptx": {
      const buf = await slidesToPptx(content, name.replace(/\.pptx$/i, ""));
      return { name, mime: PPTX_MIME, buf, kind: "slides", note };
    }
    case "ppt": {
      const buf = await slidesToPptx(content, name.replace(/\.ppt$/i, ""));
      const renamed = name.replace(/\.ppt$/i, ".pptx");
      return { name: renamed, mime: PPTX_MIME, buf, kind: "slides", note: "saved as .pptx (modern PowerPoint format)" };
    }
    default: {
      const mime = TEXT_MIME[ext] ?? (CODE_FONT_EXTS.has(ext) ? "text/plain" : "text/plain");
      const buf = Buffer.from(content, "utf8");
      return { name, mime, buf, kind: classify(name, mime), note };
    }
  }
}

/* when the model forgot the extension, guess one from the content */
function CODE_HINT_EXT(content: string): string {
  const head = content.slice(0, 400).trim();
  if (/^\s*[{[]/.test(head)) return ".json";
  if (/^<!DOCTYPE html|^<html/i.test(head)) return ".html";
  if (/^<\?xml/i.test(head)) return ".xml";
  if (/^<<<SLIDE>>>/m.test(content)) return ".pptx";
  if (/^#{1,4}\s/m.test(content) && content.includes("\n")) return ".md";
  if (/^[-\w.]+\s*,\s*[-\w.]/m.test(head)) return ".csv";
  return ".txt";
}
