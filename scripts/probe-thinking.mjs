/* Probe: which model emits reasoning_content with thinking enabled? */
import ZAI from "z-ai-web-dev-sdk";

const zai = await ZAI.create();

async function probe(model) {
  try {
    const completion = await zai.chat.completions.create({
      ...(model ? { model } : {}),
      messages: [{ role: "user", content: "What is 17*23? One line answer." }],
      thinking: { type: "enabled" },
      stream: true,
    });
    let raw = "";
    let reasoning = "";
    let content = "";
    for await (const chunk of completion) {
      if (chunk instanceof Uint8Array) raw += Buffer.from(chunk).toString("utf8");
      else raw += JSON.stringify(chunk);
      if (raw.length > 60000) break;
    }
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const p = t.slice(5).trim();
      if (!p || p === "[DONE]") continue;
      try {
        const o = JSON.parse(p);
        const d = o?.choices?.[0]?.delta ?? o?.choices?.[0]?.message ?? {};
        if (d.reasoning_content) reasoning += d.reasoning_content;
        if (d.content) content += d.content;
      } catch {}
    }
    console.log(
      `${(model || "(default)").padEnd(14)} | reasoning:${String(reasoning.length).padStart(5)} | content:${String(content.length).padStart(5)} | ${content.slice(0, 60).replace(/\n/g, " ")}`
    );
  } catch (e) {
    console.log(`${(model || "(default)").padEnd(14)} | ERROR: ${String(e.message).slice(0, 100)}`);
  }
}

for (const m of [null, "glm-4.5", "glm-4.6", "glm-4.5-air", "glm-4-flash"]) {
  await probe(m);
}
