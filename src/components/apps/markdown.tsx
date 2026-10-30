"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";

const SAMPLE = `# Welcome to the Markdown editor

Write **markdown** on the left, see it *formatted* on the right.

## Features
- Live preview
- Lists, quotes and \`inline code\`
- Tables and links

> Everything stays in your browser.

\`\`\`js
console.log("hello memphis");
\`\`\`

| Tool | Use |
| ---- | --- |
| Notes | Persistent scratchpad |
| Markdown | This editor |
`;

export default function MarkdownEditor() {
  const [text, setText] = useState(SAMPLE);

  return (
    <div className="max-w-5xl mx-auto p-4 grid lg:grid-cols-2 gap-4 min-h-[70vh]">
      <div className="flex flex-col">
        <div className="mono-label mb-2">markdown</div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Markdown source"
          spellCheck={false}
          className="flex-1 min-h-[55vh] rounded-lg border border-[#1f1f1f] bg-[#050505] p-4 font-mono text-[13px] text-[#d4d4d4] leading-relaxed outline-none focus:border-[#333] resize-none"
        />
      </div>
      <div className="flex flex-col">
        <div className="mono-label mb-2">preview</div>
        <div
          className="flex-1 min-h-[55vh] rounded-lg border border-[#1f1f1f] bg-[#050505] p-5 overflow-y-auto text-sm leading-relaxed [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:text-white [&_h1]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mt-5 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:text-white [&_h3]:mt-4 [&_p]:text-[#c9c9c9] [&_p]:my-2.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-[#c9c9c9] [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:text-[#c9c9c9] [&_li]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:border-[#3a3a3a] [&_blockquote]:pl-3 [&_blockquote]:text-[#8f8f8f] [&_blockquote]:italic [&_code]:bg-[#141414] [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_pre]:bg-[#0a0a0a] [&_pre]:border [&_pre]:border-[#1c1c1c] [&_pre]:rounded-md [&_pre]:p-3 [&_pre]:overflow-x-auto [&_a]:text-white [&_a]:underline [&_table]:w-full [&_th]:border [&_th]:border-[#262626] [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-[#262626] [&_td]:px-2 [&_td]:py-1 [&_hr]:border-[#262626] [&_strong]:text-white"
          aria-label="Formatted preview"
        >
          <ReactMarkdown>{text}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
