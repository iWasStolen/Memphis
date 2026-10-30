import { db } from "@/lib/db";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

/* ============================================================
   Memphis AI — universal file understanding pipeline.

   Every file that lands here gets:
     1. saved to disk          (upload/ai/<id>__<safe-name>)
     2. classified             (image / pdf / word / sheet / …)
     3. EXTRACTED              — text out of anything readable
        · text/code/data       → utf-8
        · pdf                  → pdf-parse (VLM fallback for scans)
        · docx / odt           → mammoth
        · xlsx / xls / csv     → sheet → CSV + sheet map
        · pptx                 → slide XML text
        · epub                 → zip XHTML text
        · zip                  → entry tree + nested text extraction
        · image                → GLM vision description (+ passed live
                                 to the vision model at chat time)
        · audio                → ffmpeg → GLM ASR transcription
        · video                → ffprobe meta + keyframes → vision
        · anything else        → magic bytes + printable strings
   The result is stored in AIFile.extracted so later turns can use
   the file without reprocessing.
   ============================================================ */

const run = promisify(execFile);

/* Resolve the heavy extraction libs from the project's REAL node_modules.
   Next's standalone output tracing misses their dynamic requires (the
   pdf.js worker, mammoth's argparse, …) — but this app always runs from
   the project root, so rooting require() there is bulletproof. */
const rootRequire = createRequire(path.join(process.cwd(), "package.json"));

export const UPLOAD_DIR = path.join(process.cwd(), "upload", "ai");

export const MAX_UPLOAD_BYTES = 40 * 1024 * 1024; // 40 MB
const MAX_EXTRACTED_CHARS = 200_000; // stored per file
const TEXT_CODE_EXTS = new Set([
  "txt", "md", "markdown", "log", "srt", "vtt", "sub", "ass", "nfo", "ini",
  "cfg", "conf", "env", "properties", "gitignore", "dockerignore", "editorconfig",
  "js", "mjs", "cjs", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "kt",
  "c", "h", "cpp", "hpp", "cc", "cs", "swift", "m", "mm", "php", "pl", "lua",
  "sh", "bash", "zsh", "fish", "ps1", "bat", "cmd", "sql", "r", "jl", "dart",
  "scala", "clj", "ex", "exs", "erl", "hs", "vim", "asm", "s", "graphql",
  "gql", "prisma", "dockerfile", "makefile", "cmake", "gradle", "tf", "hcl",
  "vue", "svelte", "astro", "ejs", "hbs", "pug", "twig", "liquid",
]);
const DATA_EXTS = new Set([
  "json", "jsonl", "ndjson", "json5", "yaml", "yml", "toml", "xml", "rss",
  "atom", "csv", "tsv", "psv", "proto", "pem", "csr", "crt", "htaccess",
]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "avif", "heic", "heif", "tiff"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "flac", "ogg", "oga", "m4a", "aac", "wma", "opus", "aiff", "aif", "weba", "mid"]);
const VIDEO_EXTS = new Set(["mp4", "mkv", "mov", "avi", "webm", "flv", "wmv", "mpg", "mpeg", "m4v", "3gp", "ts", "ogv"]);
const ARCHIVE_EXTS = new Set(["zip", "epub", "jar", "apk", "ipa", "war", "ear", "kmz", "docx", "xlsx", "pptx", "odt", "ods", "odp"]);
const PLAIN_ARCHIVE_EXTS = new Set(["zip", "jar", "apk", "ipa", "war", "ear", "kmz"]);

export type FileKind =
  | "image" | "audio" | "video" | "pdf" | "word" | "sheet" | "slides"
  | "ebook" | "archive" | "text" | "code" | "data" | "generated" | "other";

export interface FileMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: FileKind;
  status: string;
  error?: string;
  extractedPreview?: string;
  url: string;
}

export function safeName(name: string): string {
  return (
    name
      .replace(/[^\w.\- ]+/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "file"
  );
}

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

/* ---------------- classification ---------------- */

export function classify(name: string, mime: string): FileKind {
  const ext = extOf(name);
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/") || IMAGE_EXTS.has(ext)) return "image";
  if (m.startsWith("audio/") || AUDIO_EXTS.has(ext)) return "audio";
  if (m.startsWith("video/") || VIDEO_EXTS.has(ext)) return "video";
  if (ext === "pdf" || m === "application/pdf") return "pdf";
  if (["docx", "odt", "doc", "rtf"].includes(ext) || m.includes("wordprocessing") || m === "application/msword" || m === "text/rtf") return "word";
  if (["xlsx", "xls", "ods", "csv", "tsv"].includes(ext) || m.includes("spreadsheet") || m === "text/csv" || m.includes("excel")) return "sheet";
  if (["pptx", "ppt", "odp"].includes(ext) || m.includes("presentation") || m.includes("powerpoint")) return "slides";
  if (ext === "epub" || m === "application/epub+zip") return "ebook";
  if (PLAIN_ARCHIVE_EXTS.has(ext) || m === "application/zip" || m === "application/java-archive" || m === "application/vnd.android.package-archive") return "archive";
  if (["7z", "rar", "tar", "gz", "tgz", "bz2", "xz", "zst"].includes(ext)) return "archive";
  if (m.startsWith("text/") || ext === "txt" || ext === "md" || ext === "markdown" || m === "text/plain") {
    return TEXT_CODE_EXTS.has(ext) && !["txt", "md", "markdown"].includes(ext) ? "code" : "text";
  }
  if (TEXT_CODE_EXTS.has(ext)) return "code";
  if (DATA_EXTS.has(ext) || m.includes("json") || m.includes("xml") || m.includes("yaml")) return "data";
  if (m === "application/octet-stream" || m === "") {
    if (TEXT_CODE_EXTS.has(ext)) return "code";
    if (DATA_EXTS.has(ext)) return "data";
    return "other";
  }
  return "other";
}

/* ---------------- helpers ---------------- */

function clamp(text: string, max = MAX_EXTRACTED_CHARS): string {
  return text.length > max ? text.slice(0, max) + `\n\n[… truncated, ${text.length.toLocaleString()} chars total]` : text;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

function decodeUtf8(buf: Buffer): string | null {
  /* treat as text only if it's mostly printable */
  const sample = buf.subarray(0, 8192);
  let printable = 0;
  for (const b of sample) {
    if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127) || b >= 128) printable++;
    /* allow utf-8 multibyte (>=128) but also count control chars against */
    if (b < 9 || (b > 13 && b < 32)) printable -= 2;
  }
  if (printable / Math.max(1, sample.length) < 0.85) return null;
  return buf.toString("utf8");
}

function printableStrings(buf: Buffer, limit = 400): string[] {
  const out: string[] = [];
  let cur = "";
  const view = buf.subarray(0, 256 * 1024);
  for (const b of view) {
    if (b >= 32 && b < 127) cur += String.fromCharCode(b);
    else {
      if (cur.length >= 6) out.push(cur);
      cur = "";
    }
    if (out.length >= limit) break;
  }
  if (cur.length >= 6 && out.length < limit) out.push(cur);
  return out;
}

function magicInfo(buf: Buffer): string {
  const h = buf.subarray(0, 16);
  const hex = [...h].map((b) => b.toString(16).padStart(2, "0")).join(" ");
  const ascii = [...h].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
  const known: [string, string][] = [
    ["\x89PNG", "PNG image"],
    ["\xff\xd8\xff", "JPEG image"],
    ["GIF8", "GIF image"],
    ["BM", "BMP image"],
    ["PK\x03\x04", "ZIP container (docx/xlsx/pptx/jar/apk/epub…)"],
    ["%PDF", "PDF document"],
    ["{\\rtf", "RTF document"],
    ["ID3", "MP3 audio (ID3)"],
    ["OggS", "OGG media"],
    ["fLaC", "FLAC audio"],
    ["RIFF", "RIFF container (wav/avi/webp)"],
    ["\x1aE\xdf\xa3", "Matroska/WebM video"],
    ["ftyp" , "ISO-BMFF media (mp4/m4a/mov…)"],
    ["\x37\x7a\xbc\xaf", "7-Zip archive"],
    ["Rar!", "RAR archive"],
    ["ustar", "TAR archive"],
    ["\xfd7zXZ", "XZ archive"],
    ["\x1f\x8b", "GZIP stream"],
    ["SQLite format 3", "SQLite database"],
    ["\x7fELF", "ELF binary"],
    ["MZ", "Windows executable"],
    ["dex\n", "Android DEX"],
    ["wOFF", "WOFF font"],
    ["wOF2", "WOFF2 font"],
    ["OTTO", "OpenType font"],
    ["\x00\x01\x00\x00", "TrueType font"],
    ["II*\x00", "TIFF image"],
    ["II*", "TIFF image"],
  ];
  let label = "unknown binary";
  const head = buf.subarray(0, 64).toString("latin1");
  for (const [sig, name] of known) if (head.startsWith(sig)) { label = name; break; }
  return `magic bytes: ${hex}  (ascii: ${ascii})\ndetected format: ${label}`;
}

async function ffprobeMeta(file: string): Promise<string> {
  try {
    const { stdout } = await run("ffprobe", [
      "-v", "error", "-show_entries",
      "format=duration,size,bit_rate,format_name:stream=index,codec_name,codec_type,width,height",
      "-of", "json", file,
    ], { timeout: 20_000 });
    const j = JSON.parse(stdout) as {
      format?: Record<string, string>;
      streams?: { codec_name?: string; codec_type?: string; width?: number; height?: number }[];
    };
    const parts: string[] = [];
    if (j.format) {
      if (j.format.format_name) parts.push(`format: ${j.format.format_name}`);
      if (j.format.duration) parts.push(`duration: ${Math.round(parseFloat(j.format.duration))}s`);
      if (j.format.bit_rate) parts.push(`bitrate: ${Math.round(parseInt(j.format.bit_rate) / 1000)} kbps`);
    }
    for (const s of j.streams ?? []) {
      if (s.codec_type === "video") parts.push(`video: ${s.width}x${s.height} ${s.codec_name ?? ""}`.trim());
      if (s.codec_type === "audio") parts.push(`audio: ${s.codec_name ?? ""}`.trim());
    }
    return parts.join(", ");
  } catch {
    return "";
  }
}

/* ---------------- GLM helpers (z-ai-web-dev-sdk, server only) ---------------- */

type VisionPart = {
  type: "text" | "image_url" | "file_url";
  text?: string;
  image_url?: { url: string };
  file_url?: { url: string };
};

async function visionDescribe(
  parts: VisionPart[],
  instruction: string
): Promise<string> {
  const { default: ZAI } = await import("z-ai-web-dev-sdk");
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.createVision({
    messages: [{ role: "user", content: [{ type: "text", text: instruction }, ...parts] }],
    thinking: { type: "disabled" },
  } as Parameters<typeof zai.chat.completions.createVision>[0]);
  const obj = completion as { choices?: { message?: { content?: string } }[] };
  return (obj?.choices?.[0]?.message?.content ?? "").trim();
}

async function asrTranscribe(wavPath: string): Promise<string> {
  const { default: ZAI } = await import("z-ai-web-dev-sdk");
  const zai = await ZAI.create();
  const buf = await readFile(wavPath);
  const res = (await zai.audio.asr.create({
    file_base64: buf.toString("base64"),
  })) as { text?: string };
  return (res?.text ?? "").trim();
}

/* ---------------- per-kind extractors ---------------- */

async function extractPdf(buf: Buffer): Promise<string> {
  const { PDFParse } = rootRequire("pdf-parse") as typeof import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy().catch(() => {});
  }
}

async function extractDocx(buf: Buffer): Promise<string> {
  const mammoth = rootRequire("mammoth") as typeof import("mammoth");
  const r = await mammoth.extractRawText({ buffer: buf });
  return r.value;
}

async function extractSheet(buf: Buffer, name: string): Promise<string> {
  const XLSX = rootRequire("xlsx") as typeof import("xlsx");
  const wb = XLSX.read(buf, { type: "buffer" });
  const out: string[] = [`Workbook: ${name} — ${wb.SheetNames.length} sheet(s): ${wb.SheetNames.join(", ")}`];
  for (const s of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[s]);
    out.push(`\n===== sheet "${s}" =====\n${csv}`);
  }
  return out.join("\n");
}

async function extractZipText(buf: Buffer, name: string, deep: boolean): Promise<string> {
  const AdmZip = rootRequire("adm-zip") as typeof import("adm-zip");
  const zip = new AdmZip(buf);
  const entries = zip.getEntries();
  const out: string[] = [`Archive: ${name} — ${entries.length} entr${entries.length === 1 ? "y" : "ies"}`];
  const tree = entries.slice(0, 300).map((e) => `${e.isDirectory ? "dir " : "    "}${e.entryName}${e.isDirectory ? "" : ` (${e.header.size} B)`}`);
  out.push(tree.join("\n"));
  if (deep) {
    let budget = 60_000;
    for (const e of entries) {
      if (e.isDirectory || budget <= 0) continue;
      const en = e.entryName.toLowerCase();
      const isText =
        /\.(txt|md|csv|tsv|json|jsonl|xml|html?|css|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|sh|sql|yml|yaml|toml|ini|cfg|log|srt|vtt|env|svg|graphml|pom|gradle)$/i.test(en) ||
        /(^|\/)(readme|license|changelog|makefile|dockerfile)/i.test(en);
      if (!isText) continue;
      const data = e.getData();
      if (data.length > 512 * 1024) continue;
      const text = decodeUtf8(data);
      if (!text) continue;
      const piece = text.slice(0, Math.min(4_000, budget));
      budget -= piece.length;
      out.push(`\n===== ${e.entryName} =====\n${piece}`);
    }
  }
  return out.join("\n");
}

async function extractPptx(buf: Buffer, name: string): Promise<string> {
  const AdmZip = rootRequire("adm-zip") as typeof import("adm-zip");
  const zip = new AdmZip(buf);
  const out: string[] = [`Presentation: ${name}`];
  const slideEntries = zip.getEntries()
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a, b) => {
      const n = (s: string) => parseInt(s.match(/slide(\d+)\.xml/)?.[1] ?? "0", 10);
      return n(a.entryName) - n(b.entryName);
    });
  for (const e of slideEntries) {
    const xml = e.getData().toString("utf8");
    const texts = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
      .map((m) => m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))
      .join("\n");
    if (texts.trim()) out.push(`\n===== ${e.entryName.replace("ppt/slides/", "").replace(".xml", "")} =====\n${texts}`);
  }
  return out.join("\n");
}

async function extractEpub(buf: Buffer, name: string): Promise<string> {
  const AdmZip = rootRequire("adm-zip") as typeof import("adm-zip");
  const zip = new AdmZip(buf);
  const out: string[] = [`E-book: ${name}`];
  const docs = zip.getEntries()
    .filter((e) => /\.(xhtml|html?)$/i.test(e.entryName))
    .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));
  let budget = 120_000;
  for (const e of docs) {
    if (budget <= 0) break;
    const html = e.getData().toString("utf8");
    const text = stripHtml(html);
    if (!text) continue;
    const piece = text.slice(0, Math.min(20_000, budget));
    budget -= piece.length;
    out.push(`\n===== ${e.entryName} =====\n${piece}`);
  }
  return out.join("\n");
}

async function extractAudio(file: string): Promise<string> {
  const meta = await ffprobeMeta(file);
  const lines = [`Audio file${meta ? ` (${meta})` : ""}.`];
  /* convert to 16 kHz mono wav for ASR; cap ~25 MB source */
  const stat = await readFile(file).then((b) => b.length).catch(() => 0);
  if (stat > 25 * 1024 * 1024) {
    lines.push("Audio too large to transcribe (>25 MB) — ask the user to trim it.");
    return lines.join("\n");
  }
  try {
    const tmp = `${file}.asr.wav`;
    await run("ffmpeg", ["-y", "-i", file, "-ac", "1", "-ar", "16000", "-vn", tmp], { timeout: 120_000 });
    const text = await asrTranscribe(tmp);
    await unlink(tmp).catch(() => {});
    if (text) lines.push(`\nTranscription:\n${text}`);
    else lines.push("\n(No speech detected in this audio.)");
  } catch (e) {
    lines.push(`\n(Automatic transcription failed: ${e instanceof Error ? e.message : "unknown error"}.)`);
  }
  return lines.join("\n");
}

async function extractVideo(file: string, name: string): Promise<string> {
  const meta = await ffprobeMeta(file);
  const lines = [`Video file "${name}"${meta ? ` — ${meta}` : ""}.`];
  try {
    /* pull up to 4 evenly spaced keyframes and have GLM describe them */
    const durMatch = meta.match(/duration: (\d+)s/);
    const dur = durMatch ? parseInt(durMatch[1], 10) : 0;
    const frames: string[] = [];
    const points = [0.15, 0.4, 0.65, 0.9];
    for (const p of points) {
      const t = Math.max(0, Math.floor((dur || 10) * p));
      const out = `${file}.frame${frames.length}.jpg`;
      try {
        await run("ffmpeg", ["-y", "-ss", String(t), "-i", file, "-frames:v", "1", "-q:v", "4", out], { timeout: 30_000 });
        const b = await readFile(out).catch(() => null);
        if (b && b.length > 500) frames.push(`data:image/jpeg;base64,${b.toString("base64")}`);
        await unlink(out).catch(() => {});
      } catch { /* skip frame */ }
    }
    if (frames.length) {
      const desc = await visionDescribe(
        frames.map((url) => ({ type: "image_url" as const, image_url: { url } })),
        "These are keyframes sampled from one video, in order. Describe what the video shows: subject, setting, action, any on-screen text, and the apparent genre/purpose. Be specific and concise."
      );
      if (desc) lines.push(`\nVisual analysis of sampled frames:\n${desc}`);
    } else {
      lines.push("\n(Could not sample frames — the file may be corrupt or use an exotic codec.)");
    }
  } catch (e) {
    lines.push(`\n(Visual analysis failed: ${e instanceof Error ? e.message : "unknown error"}.)`);
  }
  return lines.join("\n");
}

async function extractImage(buf: Buffer, mime: string, name: string): Promise<string> {
  const dataMime = mime.startsWith("image/") && mime !== "image/svg+xml" ? mime : "image/png";
  try {
    const desc = await visionDescribe(
      [{ type: "image_url", image_url: { url: `data:${dataMime};base64,${buf.toString("base64")}` } }],
      `Describe this image ("${name}") thoroughly for someone who cannot see it: subject, setting, colors, style, any legible text (transcribe it), notable details, and the image's apparent purpose. Use compact prose.`
    );
    if (desc) return `Image "${name}".\n${desc}`;
  } catch { /* fall through */ }
  return `Image "${name}" (visual description unavailable right now — the raw image is still attached and can be viewed).`;
}

function extractBinaryFallback(buf: Buffer, name: string, kind: FileKind): string {
  const sha = createHash("sha256").update(buf.subarray(0, 1024 * 1024)).digest("hex").slice(0, 32);
  const lines = [
    `File "${name}" — ${kind} — ${(buf.length / 1024).toFixed(1)} KB — sha256(prefix): ${sha}`,
    magicInfo(buf),
  ];
  const strings = printableStrings(buf, 200);
  if (strings.length) {
    lines.push(`\nReadable strings found inside (first ${strings.length}):`);
    lines.push(strings.slice(0, 200).map((s) => "  " + s.slice(0, 200)).join("\n"));
  } else {
    lines.push("\nNo readable strings — likely pure binary data.");
  }
  return lines.join("\n");
}

/* ---------------- main entry ---------------- */

export async function processUpload(
  sessionId: string,
  originalName: string,
  mime: string,
  buf: Buffer
): Promise<FileMeta> {
  const kind = classify(originalName, mime);
  const name = safeName(originalName);

  /* create the record first so the id names the file on disk */
  const rec = await db.aIFile.create({
    data: {
      sessionId,
      name,
      mime: mime || "application/octet-stream",
      size: buf.length,
      kind,
      path: "",
      status: "processing",
    },
  });
  const file = path.join(UPLOAD_DIR, `${rec.id}__${name}`);
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(file, buf);
  await db.aIFile.update({ where: { id: rec.id }, data: { path: file } });

  let extracted = "";
  let error = "";
  try {
    switch (kind) {
      case "text":
      case "code":
      case "data": {
        const t = decodeUtf8(buf);
        if (t === null) throw new Error("file is not valid UTF-8 text");
        extracted = t;
        break;
      }
      case "pdf": {
        extracted = await extractPdf(buf);
        /* scanned / image-only PDFs yield almost no text — fall back to GLM file understanding */
        if (extracted.replace(/\s/g, "").length < 120) {
          try {
            const desc = await visionDescribe(
              [{ type: "file_url", file_url: { url: `data:application/pdf;base64,${buf.toString("base64")}` } }],
              `This PDF ("${name}") has little or no embedded text (likely scanned images). Describe its content: what the document is, key information, and transcribe important text you can see.`
            );
            if (desc) extracted = extracted ? `${extracted}\n\n[Visual analysis]\n${desc}` : `[Visual analysis of scanned PDF]\n${desc}`;
          } catch { /* keep whatever text we got */ }
        }
        break;
      }
      case "word": {
        if (extOf(name) === "docx" || extOf(name) === "odt") {
          extracted = await extractDocx(buf);
        } else if (extOf(name) === "rtf") {
          extracted = stripRtf(buf.toString("latin1"));
        } else {
          /* legacy .doc — binary format; try strings + GLM */
          extracted = extractBinaryFallback(buf, name, kind);
        }
        break;
      }
      case "sheet": {
        if (extOf(name) === "csv" || extOf(name) === "tsv") {
          extracted = buf.toString("utf8");
        } else {
          extracted = await extractSheet(buf, name);
        }
        break;
      }
      case "slides": {
        if (extOf(name) === "pptx") extracted = await extractPptx(buf, name);
        else extracted = extractBinaryFallback(buf, name, kind);
        break;
      }
      case "ebook":
        extracted = await extractEpub(buf, name);
        break;
      case "archive": {
        if (extOf(name) === "epub") extracted = await extractEpub(buf, name);
        else if (["zip", "jar", "apk", "ipa", "war", "ear", "kmz"].includes(extOf(name)) || buf.subarray(0, 2).toString("latin1") === "PK")
          extracted = await extractZipText(buf, name, true);
        else extracted = extractBinaryFallback(buf, name, kind);
        break;
      }
      case "image":
        extracted = await extractImage(buf, mime, name);
        break;
      case "audio":
        extracted = await extractAudio(file);
        break;
      case "video":
        extracted = await extractVideo(file, name);
        break;
      default: {
        const t = decodeUtf8(buf);
        if (t !== null) extracted = t;
        else extracted = extractBinaryFallback(buf, name, kind);
      }
    }
    extracted = clamp(extracted.trim());
    if (!extracted) extracted = `(No content could be extracted from "${name}".)`;
  } catch (e) {
    error = e instanceof Error ? e.message : "extraction failed";
  }

  const updated = await db.aIFile.update({
    where: { id: rec.id },
    data: {
      extracted,
      error,
      status: error ? "error" : "ready",
    },
  });

  return metaOf(updated);
}

function stripRtf(rtf: string): string {
  return rtf
    .replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function metaOf(f: {
  id: string; name: string; mime: string; size: number; kind: string;
  status: string; error: string; extracted: string;
}): FileMeta {
  return {
    id: f.id,
    name: f.name,
    mime: f.mime,
    size: f.size,
    kind: f.kind as FileKind,
    status: f.status,
    error: f.error || undefined,
    extractedPreview: f.extracted ? f.extracted.slice(0, 400) : undefined,
    url: `/api/ai/files/${f.id}/raw`,
  };
}

/* Build the context block the chat model sees for a file. */
export function fileContextBlock(meta: { name: string; kind: string; size: number; extracted: string }, budget: number): string {
  const body = meta.extracted.length > budget
    ? meta.extracted.slice(0, budget) + `\n[… truncated — ${meta.extracted.length.toLocaleString()} chars available on request]`
    : meta.extracted;
  return `[attached file: ${meta.name} — ${meta.kind}, ${(meta.size / 1024).toFixed(1)} KB]\n${body}\n[/attached file]`;
}
