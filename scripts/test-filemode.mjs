/* End-to-end test of Memphis AI File mode via the dev server (:3000)
   run: node scripts/test-filemode.mjs */
const BASE = "http://localhost:3000";
const SID = "filemode-e2e-" + Math.random().toString(36).slice(2, 10);

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

async function turn(body) {
  const res = await fetch(`${BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: SID, ...body }),
  });
  if (!res.ok || !res.body) {
    console.log("  HTTP", res.status, (await res.text()).slice(0, 300));
    return null;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const events = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const blocks = buf.split("\n\n");
    buf = blocks.pop() ?? "";
    for (const b of blocks) {
      const ev = b.match(/^event: (.+)$/m)?.[1];
      const dataLine = b.match(/^data: (.+)$/m)?.[1];
      if (ev) {
        let data = {};
        try { data = dataLine ? JSON.parse(dataLine) : {}; } catch { /* ignore */ }
        events.push({ ev, data });
      }
    }
  }
  return events;
}

function trace(events, label) {
  const kinds = {};
  for (const e of events) {
    if (e.ev === "fileDelta") kinds.fileDelta = (kinds.fileDelta ?? 0) + 1;
    else if (e.ev === "status") kinds[`status:${e.data.stage}`] = 1;
    else if (e.ev === "delta") kinds.delta = (kinds.delta ?? 0) + 1;
    else kinds[e.ev] = 1;
  }
  console.log(`  [trace ${label}]`, JSON.stringify(kinds));
}

async function main() {
  /* ---------- 1. xlsx with two sheets ---------- */
  console.log("\n[1] File mode: xlsx (multi-sheet)");
  let ev = await turn({
    message:
      "Create a small xlsx comparing 3 instant coffee brands: columns Brand, Caffeine_mg, Price_USD, Rating. Add a second sheet named Notes with two short rows about brewing.",
    fileMode: true,
  });
  if (!ev) return finish();
  trace(ev, "xlsx");
  const done1 = ev.find((e) => e.ev === "done");
  check("status composing seen", ev.some((e) => e.ev === "status" && e.data.stage === "composing"));
  check("fileStart seen", ev.some((e) => e.ev === "fileStart"));
  check("fileDelta streamed", ev.filter((e) => e.ev === "fileDelta").length > 3);
  check("done event arrived", !!done1);
  check("attachment on done", Array.isArray(done1?.data.attachments) && done1.data.attachments.length === 1);
  const xAtt = done1?.data.attachments?.[0];
  check("file is xlsx", xAtt?.name?.endsWith(".xlsx"), JSON.stringify(xAtt));
  const convId = done1?.data.conversationId;

  if (xAtt) {
    const r = await fetch(`${BASE}/api/ai/files/${xAtt.id}/raw?sessionId=${SID}`);
    const buf = Buffer.from(await r.arrayBuffer());
    check("raw serves xlsx bytes", r.ok && buf.subarray(0, 2).toString("latin1") === "PK", `status ${r.status}`);
    check("content-type", (r.headers.get("content-type") ?? "").includes("spreadsheetml"));
    const XLSX = (await import("xlsx")).default ?? (await import("xlsx"));
    const wb = XLSX.read(buf, { type: "buffer" });
    check("two sheets in served file", wb.SheetNames.length === 2, wb.SheetNames.join(","));
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    check("header row", rows[0]?.[0] === "Brand", JSON.stringify(rows[0]));
    check("numeric caffeine", typeof rows[1]?.[1] === "number", JSON.stringify(rows[1]));
  }

  /* ---------- 2. python script (direct text) ---------- */
  console.log("\n[2] File mode: python script");
  ev = await turn({
    conversationId: convId,
    message: "Now write a small Python script that prints the fibonacci sequence up to n.",
    fileMode: true,
  });
  if (!ev) return finish();
  trace(ev, "py");
  const done2 = ev.find((e) => e.ev === "done");
  const pyAtt = done2?.data.attachments?.[0];
  check("py file attached", pyAtt?.name?.endsWith(".py"), JSON.stringify(pyAtt));
  if (pyAtt) {
    const r = await fetch(`${BASE}/api/ai/files/${pyAtt.id}/raw?sessionId=${SID}`);
    const text = await r.text();
    check("py content looks right", text.includes("def ") && text.includes("fib"), text.slice(0, 80));
  }

  /* ---------- 3. pdf via soffice ---------- */
  console.log("\n[3] File mode: pdf");
  ev = await turn({
    conversationId: convId,
    message: "Make a one-page PDF study guide about the water cycle — title, short intro, a 4-item labeled list, and a closing tip.",
    fileMode: true,
  });
  if (!ev) return finish();
  trace(ev, "pdf");
  const done3 = ev.find((e) => e.ev === "done");
  const pdfAtt = done3?.data.attachments?.[0];
  check("pdf attached", pdfAtt?.name?.endsWith(".pdf"), JSON.stringify(pdfAtt));
  check("note-free or docx-fallback note", !pdfAtt || pdfAtt.name.endsWith(".pdf") || !!done3.data, "");
  if (pdfAtt?.name.endsWith(".pdf")) {
    const r = await fetch(`${BASE}/api/ai/files/${pdfAtt.id}/raw?sessionId=${SID}`);
    const buf = Buffer.from(await r.arrayBuffer());
    check("real pdf bytes", buf.subarray(0, 4).toString("latin1") === "%PDF");
    check("pdf has size", buf.length > 2500, `${buf.length}`);
  }

  /* ---------- 4. history reload keeps the files ---------- */
  console.log("\n[4] History reload");
  const hr = await fetch(`${BASE}/api/ai/conversations/${convId}?sessionId=${SID}`);
  const hist = await hr.json();
  const withAtts = (hist.messages ?? []).filter((m) => Array.isArray(m.attachments) && m.attachments.length);
  check("3 assistant messages carry files", withAtts.length === 3, `${withAtts.length}`);
  check("summaries persisted", (hist.messages ?? []).filter((m) => m.role === "assistant").every((m) => m.content.trim().length > 0));

  finish();
}

function finish() {
  console.log(`\n===== ${pass} passed, ${fail} failed =====`);
  console.log("session:", SID);
  process.exit(fail ? 1 : 0);
}

void main();
