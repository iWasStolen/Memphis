/* ComposeParser unit test — simulates token-by-token streaming.
   run: bun scripts/test-parser.ts */
import { ComposeParser } from "@/lib/ai-compose";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

function run(text: string, chunkSizes: number[]) {
  const p = new ComposeParser();
  const started: string[] = [];
  const deltas: string[] = [];
  const prose: string[] = [];
  const cbs = {
    onProse: (t: string) => prose.push(t),
    onFileStart: (name: string) => started.push(name),
    onFileDelta: (_name: string, t: string) => deltas.push(t),
  };
  let i = 0, k = 0;
  while (i < text.length) {
    const size = chunkSizes[k % chunkSizes.length];
    p.feed(text.slice(i, i + size), cbs);
    i += size;
    k++;
  }
  p.end();
  return { p, started, deltas: deltas.join(""), prose: prose.join("") };
}

console.log("\n[A] single file, 1-char chunks (worst case)");
{
  const text = `<<<FILE: test.py>>>print("hi")\nprint("bye")\n<<<END>>>\nAll done!`;
  const { p, started, deltas, prose } = run(text, [1]);
  check("file parsed", p.files.length === 1, JSON.stringify(p.files));
  check("name", p.files[0]?.name === "test.py", p.files[0]?.name);
  check("content", p.files[0]?.content === `print("hi")\nprint("bye")`, JSON.stringify(p.files[0]?.content));
  check("fileStart fired", started.length === 1 && started[0] === "test.py", JSON.stringify(started));
  check("deltas complete", deltas === `print("hi")\nprint("bye")\n`, JSON.stringify(deltas));
  check("prose after END", p.prose.includes("All done!"), JSON.stringify(p.prose));
  check("prose has no markers", !p.prose.includes("<<<"), JSON.stringify(p.prose));
}

console.log("\n[B] awkward split points");
{
  const text = `Sure!\n<<<FILE: a.csv>>>x,y\n1,2\n<<<END>>>Here is A.\n<<<FILE: b.md>>># hi\n<<<END>>>And B.\n<<<FILE: c.txt>>>tail without end`;
  /* splits exactly at marker boundaries: "<<<FILE:" is 8 chars */
  const { p, started, prose } = run(text, [3, 5, 8, 2, 11, 1]);
  check("three files (last unterminated)", p.files.length === 3, JSON.stringify(p.files.map((f) => f.name)));
  check("names", p.files[0]?.name === "a.csv" && p.files[1]?.name === "b.md" && p.files[2]?.name === "c.txt", JSON.stringify(p.files.map((f) => f.name)));
  check("file contents", p.files[0]?.content === "x,y\n1,2" && p.files[1]?.content === "# hi" && p.files[2]?.content === "tail without end", JSON.stringify(p.files.map((f) => f.content)));
  check("interleaved prose", prose.includes("Sure!") && prose.includes("Here is A.") && prose.includes("And B."), JSON.stringify(prose));
  check("3 fileStarts", started.length === 3, JSON.stringify(started));
  check("parser prose matches callback prose", p.prose === prose, `${JSON.stringify(p.prose)} vs ${JSON.stringify(prose)}`);
}

console.log("\n[C] no protocol — plain prose");
{
  const { p, started } = run("Just a normal answer with **markdown** and `code`.", [2, 7, 3]);
  check("no files", p.files.length === 0);
  check("no fileStarts", started.length === 0);
  check("prose intact", p.prose === "Just a normal answer with **markdown** and `code`.", JSON.stringify(p.prose));
}

console.log("\n[D] prose containing < but no marker");
{
  const { p } = run("5 <<< 6 and <<<FI but not the marker <<<FILX: nope", [4]);
  check("no files", p.files.length === 0, JSON.stringify(p.files));
  check("prose keeps everything", p.prose === "5 <<< 6 and <<<FI but not the marker <<<FILX: nope", JSON.stringify(p.prose));
}

console.log("\n[E] quoted filename + fences inside content");
{
  const text = '<<<FILE: `snippet.ts` >>>\n```js\nconsole.log(1)\n```\n<<<END>>>done';
  const { p } = run(text, [1, 6, 2]);
  check("backticks stripped from name", p.files[0]?.name === "snippet.ts", p.files[0]?.name);
  check("fences stripped from code file", p.files[0]?.content === "console.log(1)", JSON.stringify(p.files[0]?.content));
}

console.log("\n[E2] markdown files keep their fences");
{
  const text = '<<<FILE: readme.md>>># Title\n\n```python\nprint(1)\n```\n<<<END>>>ok';
  const { p } = run(text, [3, 4, 7]);
  check("md content untouched", p.files[0]?.content === "# Title\n\n```python\nprint(1)\n```", JSON.stringify(p.files[0]?.content));
}

console.log("\n[F] runaway header (no >>> ever)");
{
  const text = "<<<FILE: " + "x".repeat(200) + " no end header here, just text";
  const { p } = run(text, [5]);
  check("runaway treated as prose", p.files.length === 0, JSON.stringify(p.files));
  check("prose non-empty", p.prose.length > 150, `${p.prose.length}`);
}

console.log("\n[G] END marker split across chunks mid-stream");
{
  const text = "<<<FILE: z.txt>>>abc<<<END>>>tail";
  /* 23 chars in — right inside "<<<END>>>" */
  const { p } = run(text, [23, 1]);
  check("file closed despite split END", p.files.length === 1 && p.files[0]?.content === "abc", JSON.stringify(p.files));
  check("tail prose", p.prose === "tail", JSON.stringify(p.prose));
}

console.log("\n[H] multi-sheet marker passes through untouched");
{
  const text = "<<<FILE: book.xlsx>>>A,B\n1,2\n<<<SHEET:Notes>>>n,v\nx,y\n<<<END>>>ok";
  const { p } = run(text, [2, 9, 1]);
  check("SHEET marker preserved in content", p.files[0]?.content === "A,B\n1,2\n<<<SHEET:Notes>>>n,v\nx,y", JSON.stringify(p.files[0]?.content));
}


console.log("\n[I] retargetExt — extension drift safety net");
{
  const { retargetExt } = await import("@/lib/ai-compose");
  check("md + 'make a pdf' -> pdf", retargetExt("guide.md", "please make a pdf study guide") === "pdf");
  check("md + 'word document' -> docx", retargetExt("notes.md", "create a word document about dogs") === "docx");
  check("txt + 'slide deck' -> pptx", retargetExt("deck.txt", "build me a slide deck") === "pptx");
  check("md + 'excel spreadsheet' -> xlsx", retargetExt("data.md", "I need an excel spreadsheet") === "xlsx");
  check("md + no format keyword -> null", retargetExt("notes.md", "write me some notes") === null);
  check("csv + 'pdf' mention -> null (already concrete)", retargetExt("table.csv", "export as pdf later") === null);
  check("py + 'excel' mention -> null", retargetExt("script.py", "process excel files") === null);
  check("no ext + 'a pdf of..' -> pdf", retargetExt("handbook", "make a pdf of the handbook") === "pdf");
}
console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
