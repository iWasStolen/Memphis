/* Unit test for src/lib/ai-compose.ts — run with: bun scripts/test-compose.ts */
import { buildFile, mdToDocx, slidesToPptx } from "@/lib/ai-compose";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";

const rootRequire = createRequire(path.join(process.cwd(), "package.json"));
const XLSX = rootRequire("xlsx");
const mammoth = rootRequire("mammoth");
const AdmZip = rootRequire("adm-zip");
const { execFile } = rootRequire("child_process") as typeof import("child_process");
const run = (cmd: string, args: string[]) =>
  new Promise<{ ok: boolean; out: string }>((res) => {
    execFile(cmd, args, { timeout: 120_000 }, (err: unknown, stdout: string | Buffer) =>
      res({ ok: !err, out: String(stdout ?? "") })
    );
  });

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

async function main() {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "compose-test-"));

  /* ---------- 1. CSV → XLSX (multi-sheet + numbers + semicolons) ---------- */
  console.log("\n[1] CSV → XLSX");
  const csv = [
    "<<<SHEET:Budget>>>",
    "Item,January,February",
    "Rent,1200,1200",
    'Coffee,"42,5",38',
    "<<<SHEET:Notes>>>",
    "Note;Priority",
    "buy milk;high",
    "ship it;low",
  ].join("\n");
  const x = await buildFile("budget.xlsx", csv);
  check("mime is xlsx", x.mime.includes("spreadsheetml"));
  check("bytes start with PK", x.buf.subarray(0, 2).toString("latin1") === "PK");
  const wb = XLSX.read(x.buf, { type: "buffer" });
  check("two sheets", wb.SheetNames.length === 2, `got ${wb.SheetNames.join(",")}`);
  check("sheet names kept", wb.SheetNames[0] === "Budget" && wb.SheetNames[1] === "Notes");
  const cell = XLSX.utils.sheet_to_json(wb.Sheets["Budget"], { header: 1 }) as unknown[][];
  check("numeric cell parsed", cell[1]?.[1] === 1200, `got ${JSON.stringify(cell[1])}`);
  check("quoted comma cell", cell[2]?.[1] === "42,5", `got ${JSON.stringify(cell[2])}`);
  const notes = XLSX.utils.sheet_to_json(wb.Sheets["Notes"], { header: 1 }) as unknown[][];
  check("semicolon sheet split", notes[0]?.[0] === "Note" && notes[1]?.[1] === "high", `got ${JSON.stringify(notes)}`);

  /* ---------- 2. Markdown → DOCX ---------- */
  console.log("\n[2] Markdown → DOCX");
  const md = [
    "# Quarterly Report",
    "",
    "Memphis AI made this **bold** and *italic* with `code` and a [link](https://example.com).",
    "",
    "## Details",
    "",
    "- first point",
    "- second point with **emphasis**",
    "",
    "1. step one",
    "2. step two",
    "",
    "> a wise quote appears here",
    "",
    "| Metric | Value |",
    "| --- | --- |",
    "| Users | 1200 |",
    "| Uptime | 99.9% |",
    "",
    "```python",
    "print('hello Memphis')",
    "```",
    "",
    "Closing paragraph.",
  ].join("\n");
  const d = await buildFile("report.docx", md);
  check("mime is docx", d.mime.includes("wordprocessingml"));
  check("bytes start with PK", d.buf.subarray(0, 2).toString("latin1") === "PK");
  const docxPath = path.join(tmp, "report.docx");
  await writeFile(docxPath, d.buf);
  const text = (await mammoth.extractRawText({ path: docxPath })).value;
  check("heading text", text.includes("Quarterly Report"));
  check("bold inline", text.includes("bold"));
  check("list items", text.includes("first point") && text.includes("step one"));
  check("quote", text.includes("wise quote"));
  check("table cells", text.includes("Users") && text.includes("1200"));
  check("code block", text.includes("print('hello Memphis')"));
  const zip = new AdmZip(d.buf);
  const entries = zip.getEntries().map((e: { entryName: string }) => e.entryName);
  check("document.xml present", entries.includes("word/document.xml"));
  check("styles.xml present", entries.includes("word/styles.xml"));
  const soffice1 = await run("soffice", ["--headless", "--convert-to", "pdf", "--outdir", tmp, docxPath]);
  check("soffice renders the docx", soffice1.ok, soffice1.out.slice(0, 200));

  /* ---------- 3. Slides → PPTX ---------- */
  console.log("\n[3] Slides → PPTX");
  const deck = [
    "<<<SLIDE>>>",
    "# Memphis AI",
    "- composes real files",
    "- xlsx, docx, pptx, pdf",
    "",
    "<<<SLIDE>>>",
    "# How it works",
    "- model writes structured text",
    "- server converts to real formats",
    "- download straight from chat",
  ].join("\n");
  const p = await buildFile("deck.pptx", deck);
  check("mime is pptx", p.mime.includes("presentationml"));
  const pzip = new AdmZip(p.buf);
  const pentries = pzip.getEntries().map((e: { entryName: string }) => e.entryName);
  check("presentation.xml", pentries.includes("ppt/presentation.xml"));
  check("slide1 + slide2", pentries.includes("ppt/slides/slide1.xml") && pentries.includes("ppt/slides/slide2.xml"));
  check("master + layout + theme", pentries.includes("ppt/slideMasters/slideMaster1.xml") && pentries.includes("ppt/slideLayouts/slideLayout1.xml") && pentries.includes("ppt/theme/theme1.xml"));
  check("slide rels", pentries.includes("ppt/slides/_rels/slide1.xml.rels"));
  const slide1 = pzip.readAsText("ppt/slides/slide1.xml");
  check("slide title text", slide1.includes("Memphis AI") && slide1.includes("composes real files"));
  const pptxPath = path.join(tmp, "deck.pptx");
  await writeFile(pptxPath, p.buf);
  const soffice2 = await run("soffice", ["--headless", "--convert-to", "pdf", "--outdir", tmp, pptxPath]);
  check("soffice renders the pptx", soffice2.ok, soffice2.out.slice(0, 200));

  /* ---------- 4. PDF end-to-end ---------- */
  console.log("\n[4] Markdown → PDF");
  const pdf = await buildFile("summary.pdf", "# Hello PDF\n\nThis paragraph has **bold** text and a list:\n\n- one\n- two\n");
  check("starts with %PDF", pdf.buf.subarray(0, 4).toString("latin1") === "%PDF");
  check("mime is pdf", pdf.mime === "application/pdf");
  check("size > 2 KB", pdf.buf.length > 2048, `${pdf.buf.length} bytes`);

  /* ---------- 5. plain text / code / data ---------- */
  console.log("\n[5] Text / code / data");
  const py = await buildFile("fib.py", "def fib(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n");
  check("py mime", py.mime === "text/x-python" && py.kind === "code");
  const js = await buildFile("script.js", "console.log('hi');\n");
  check("js mime", js.mime === "text/javascript");
  const json = await buildFile("config.json", '{"a": 1, "b": [2, 3]}');
  check("json mime", json.mime === "application/json" && json.kind === "data");
  const noExt = await buildFile("notes", "just some text\nwith lines\n");
  check("missing ext fallback", noExt.name.endsWith(".txt"), noExt.name);
  const legacy = await buildFile("old.xls", "A,B\n1,2\n");
  check("legacy .xls → .xlsx + note", legacy.name.endsWith(".xlsx") && !!legacy.note, legacy.name);

  await rm(tmp, { recursive: true, force: true }).catch(() => {});

  console.log(`\n===== ${pass} passed, ${fail} failed =====`);
  process.exit(fail ? 1 : 0);
}

void main();
