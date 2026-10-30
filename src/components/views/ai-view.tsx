"use client";

/* ============================================================
   Memphis AI — a real chat backed by GLM (via z-ai-web-dev-sdk
   on the server). Free, no sign-in, no token limits. Streams
   token-by-token over SSE and renders markdown.

   Full toolbox:
   - Attach ANY file (button / drag-drop / paste) — the server
     extracts text, transcribes audio, describes images & video
   - Live vision: attached images go straight to the vision model
   - Web search toggle with cited sources
   - Image mode: generate or edit pictures
   - Voice input (mic → ASR) and read-aloud (TTS)
   - Fast / Reasoning modes — deep thinking streams live, then
     collapses into a "show thinking" block
   - Stop, regenerate, edit-and-resend, rename chats, follow-up
     suggestion chips
   - Export the conversation as markdown
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { aiSessionId, lsGet, lsSet } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sparkles,
  Plus,
  Send,
  Trash2,
  Layers,
  Save,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  MessagesSquare,
  Copy,
  Check,
  Infinity as InfinityIcon,
  Menu,
  Loader2,
  Paperclip,
  Globe,
  Palette,
  Mic,
  Square,
  Download,
  Volume2,
  X,
  Zap,
  Brain,
  Pencil,
  CornerDownRight,
  FileText,
  FileCode2,
  FileArchive,
  Film,
  Table,
  Presentation,
  Braces,
  File,
  AudioLines,
  Image as ImageIcon,
} from "lucide-react";

interface AttMeta {
  id: string;
  name: string;
  kind: string;
  size: number;
  mime: string;
}

interface AIMsg {
  id: string;
  role: string;
  content: string;
  streaming?: boolean;
  attachments?: AttMeta[] | null;
  reasoning?: string;
  mode?: string;
}

interface UploadingFile {
  key: string;
  name: string;
  pct: number;
}

interface ConversationRow {
  id: string;
  title: string;
  instructions: string;
  updatedAt: string;
  _count?: { messages: number };
}

interface Flashcard {
  front: string;
  back: string;
}

const FLASHCARD_KEY = "memphis-flashcards";
const MODE_KEY = "memphis-ai-mode";
const MAX_ATTACH = 6;

const STATUS_LABEL: Record<string, string> = {
  searching: "Searching the web…",
  reading: "Reading sources…",
  painting: "Painting your image…",
  reasoning: "reasoning deeply",
  writing: "thinking",
};

function fmtSize(n: number): string {
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function AttIcon({ kind, className }: { kind: string; className?: string }) {
  if (kind === "image" || kind === "generated") return <ImageIcon className={className} />;
  if (kind === "audio") return <AudioLines className={className} />;
  if (kind === "video") return <Film className={className} />;
  if (kind === "pdf" || kind === "word" || kind === "ebook") return <FileText className={className} />;
  if (kind === "sheet") return <Table className={className} />;
  if (kind === "slides") return <Presentation className={className} />;
  if (kind === "archive") return <FileArchive className={className} />;
  if (kind === "code") return <FileCode2 className={className} />;
  if (kind === "data") return <Braces className={className} />;
  return <File className={className} />;
}

/* split a message into TTS-sized chunks (API limit is 1024 chars) */
function splitForTts(text: string, max = 950): string[] {
  const clean = text
    .replace(/```[\s\S]*?```/g, " — code block omitted — ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " — image — ");
  const sentences = clean.match(/[^.!?\n]+[.!?]*\s*/g) ?? [clean];
  const chunks: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > max) {
      if (cur.trim()) chunks.push(cur);
      if (s.length > max) {
        for (let i = 0; i < s.length; i += max) chunks.push(s.slice(i, i + max));
        cur = "";
      } else cur = s;
    } else cur += s;
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}

/* 16 kHz mono PCM WAV encoder (for voice input) */
function encodeWav(buffer: AudioBuffer, targetRate = 16000): ArrayBuffer {
  const src = buffer.getChannelData(0);
  const ratio = buffer.sampleRate / targetRate;
  const length = Math.max(1, Math.floor(src.length / ratio));
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, src.length - 1);
    const frac = pos - i0;
    data[i] = src[i0] * (1 - frac) + src[i1] * frac;
  }
  const out = new ArrayBuffer(44 + length * 2);
  const view = new DataView(out);
  const wstr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  wstr(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  wstr(8, "WAVE");
  wstr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  wstr(36, "data");
  view.setUint32(40, length * 2, true);
  let off = 44;
  for (let i = 0; i < length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

/* ---------------- markdown renderer ---------------- */

function Md({ text }: { text: string }) {
  return (
    <div className="memphis-md text-[13.5px] leading-relaxed break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code(props) {
            const { className, children } = props;
            const match = /language-(\w+)/.exec(className || "");
            const code = String(children ?? "").replace(/\n$/, "");
            if (!match && !code.includes("\n")) {
              return (
                <code className="bg-[#161616] border border-[#262626] rounded px-1 py-0.5 text-[12px] font-mono">
                  {code}
                </code>
              );
            }
            return (
              <code className={className}>
                <SyntaxHighlighter
                  style={oneDark as Record<string, Record<string, string>>}
                  language={match ? match[1] : "text"}
                  PreTag="div"
                  customStyle={{
                    borderRadius: "10px",
                    border: "1px solid #1f1f1f",
                    fontSize: "12px",
                    margin: "8px 0",
                    background: "#0a0a0a",
                  }}
                >
                  {code}
                </SyntaxHighlighter>
              </code>
            );
          },
          a(props) {
            const { href, children } = props;
            return (
              <a href={href} target="_blank" rel="noreferrer noopener" className="u-link text-white underline underline-offset-2">
                {children}
              </a>
            );
          },
          img(props) {
            const { src, alt } = props;
            if (!src || typeof src !== "string") return null;
            return (
              <img
                src={src}
                alt={alt ?? ""}
                loading="lazy"
                onClick={() => window.open(src, "_blank")}
                className="max-w-full max-h-[420px] rounded-lg border border-[#222] my-2 cursor-zoom-in hover:border-[#444] transition-colors"
              />
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

/* ---------------- attachment chip ---------------- */

function AttChip({ att, onRemove }: { att: AttMeta; onRemove?: () => void }) {
  const sid = aiSessionId();
  return (
    <span className="inline-flex items-center gap-1.5 max-w-[220px] rounded-lg border border-[#262626] bg-[#111] pl-2 pr-1 py-1 text-[11.5px] text-[#ccc]">
      <a
        href={`/api/ai/files/${att.id}/raw?sessionId=${encodeURIComponent(sid)}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 min-w-0 hover:text-white"
        title={`${att.name} · ${fmtSize(att.size)} — open`}
      >
        <AttIcon kind={att.kind} className="size-3.5 shrink-0 text-[#8a8a8a]" />
        <span className="truncate">{att.name}</span>
        <span className="shrink-0 text-[#555]">{fmtSize(att.size)}</span>
      </a>
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Remove ${att.name}`}
          className="shrink-0 p-0.5 rounded text-[#666] hover:text-white hover:bg-[#1d1d1d]"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

/* ---------------- chain-of-thought block (Reasoning mode) ---------------- */

function ThinkBlock({ text, streaming }: { text: string; streaming?: boolean }) {
  if (streaming) {
    return (
      <div className="mb-2 rounded-lg border border-[#1e1e1e] bg-[#070707] px-3 py-2">
        <p className="flex items-center gap-1.5 text-[11px] text-[#8a8a8a] mb-1.5 font-mono uppercase tracking-wider">
          <Brain className="size-3" /> thinking
          <span className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-1 rounded-full bg-[#777]"
                style={{ animation: `blink 1.2s ${i * 0.2}s infinite` }}
              />
            ))}
          </span>
        </p>
        <div className="max-h-44 overflow-y-auto memphis-scroll text-[12px] leading-relaxed text-[#8f8f8f] whitespace-pre-wrap break-words">
          {text}
        </div>
      </div>
    );
  }
  return (
    <details className="mb-2 rounded-lg border border-[#1a1a1a] bg-[#070707]">
      <summary className="cursor-pointer select-none text-[11px] text-[#8a8a8a] hover:text-[#c9c9c9] px-3 py-1.5 font-mono uppercase tracking-wider flex items-center gap-1.5 list-none [&::-webkit-details-marker]:hidden">
        <Brain className="size-3" /> show thinking
      </summary>
      <div className="max-h-72 overflow-y-auto memphis-scroll text-[12px] leading-relaxed text-[#8f8f8f] whitespace-pre-wrap break-words px-3 pb-2.5">
        {text}
      </div>
    </details>
  );
}

/* ---------------- main view ---------------- */

export default function AiView() {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AIMsg[]>([]);
  const [instructions, setInstructions] = useState("");
  const [instructionsDraft, setInstructionsDraft] = useState("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [cardIdx, setCardIdx] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [genCards, setGenCards] = useState(false);
  const [showCards, setShowCards] = useState(false);
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  /* new: files & tools */
  const [attached, setAttached] = useState<AttMeta[]>([]);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [webSearch, setWebSearch] = useState(false);
  const [imageMode, setImageMode] = useState(false);
  const [status, setStatus] = useState("");
  const [dragging, setDragging] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState<{ id: string; loading: boolean } | null>(null);

  /* new: modes, turn replay, suggestions, rename */
  const [mode, setMode] = useState<"fast" | "reasoning">(() =>
    lsGet<"fast" | "reasoning">(MODE_KEY, "fast")
  );
  const [editing, setEditing] = useState<{ id: string } | null>(null);
  const [suggestions, setSuggestions] = useState<{ forId: string; items: string[] } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechTokenRef = useRef(0);
  /* while a reply is streaming, the `meta` event flips activeId to the
     (possibly new) conversation id — the history-refetch effect must NOT
     run then, or it replaces the streamed placeholder with the server's
     pre-reply history and the visible reply vanishes */
  const sendingRef = useRef(false);

  /* ---------- conversation list ---------- */
  const loadConversations = useCallback(async () => {
    const sid = aiSessionId();
    if (!sid) return;
    const r = await fetch(`/api/ai/conversations?sessionId=${encodeURIComponent(sid)}`);
    if (r.ok) {
      const data = (await r.json()) as { conversations?: ConversationRow[] };
      setConversations(data.conversations ?? []);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
    setCards(lsGet<Flashcard[]>(FLASHCARD_KEY, []));
  }, [loadConversations]);

  /* ---------- load messages for active conversation ---------- */
  useEffect(() => {
    setSuggestions(null);
    setEditing(null);
    if (!activeId) return;
    if (sendingRef.current) return; /* streaming — keep the live UI */
    const sid = aiSessionId();
    void (async () => {
      const r = await fetch(
        `/api/ai/conversations/${activeId}?sessionId=${encodeURIComponent(sid)}`
      );
      if (r.ok) {
        const data = (await r.json()) as {
          conversation?: ConversationRow;
          messages?: AIMsg[];
        };
        if (data.conversation) {
          setMessages(data.messages ?? []);
          setInstructions(data.conversation.instructions ?? "");
          setInstructionsDraft(data.conversation.instructions ?? "");
        }
      }
    })();
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  /* recording timer */
  useEffect(() => {
    if (!recording) return;
    setRecordSecs(0);
    const t = setInterval(() => setRecordSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  /* ---------- actions ---------- */
  const newChat = () => {
    if (sending) abortRef.current?.abort();
    setActiveId(null);
    setMessages([]);
    setInstructions("");
    setInstructionsDraft("");
    setError("");
    setAttached([]);
    setStatus("");
    setSidebarOpen(false);
    setEditing(null);
    setSuggestions(null);
  };

  const setModePersisted = (m: "fast" | "reasoning") => {
    setMode(m);
    lsSet(MODE_KEY, m);
  };

  /* ---------- file uploads (XHR for progress) ---------- */
  const uploadOne = (file: File) =>
    new Promise<AttMeta | null>((resolve) => {
      const sid = aiSessionId();
      if (!sid) return resolve(null);
      const fd = new FormData();
      fd.append("sessionId", sid);
      fd.append("file", file);
      const key = "up-" + Math.random().toString(36).slice(2);
      setUploading((u) => [...u, { key, name: file.name, pct: 0 }]);
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          setUploading((u) => u.map((x) => (x.key === key ? { ...x, pct } : x)));
        }
      };
      const done = () => setUploading((u) => u.filter((x) => x.key !== key));
      xhr.onload = () => {
        done();
        try {
          const data = JSON.parse(xhr.responseText) as {
            files?: AttMeta[];
            errors?: { name: string; error: string }[];
            error?: string;
          };
          if (xhr.status === 200 && data.files?.length) {
            if (data.errors?.length) setError(`${data.errors[0].name}: ${data.errors[0].error}`);
            resolve(data.files[0]);
          } else {
            setError(data.error || data.errors?.[0]?.error || `Upload failed (${xhr.status})`);
            resolve(null);
          }
        } catch {
          setError("Upload failed — the server sent an invalid response.");
          resolve(null);
        }
      };
      xhr.onerror = () => {
        done();
        setError(`Could not upload ${file.name} — check your connection.`);
        resolve(null);
      };
      xhr.open("POST", "/api/ai/files");
      xhr.send(fd);
    });

  const uploadFiles = useCallback(async (list: FileList | File[]) => {
    const files = Array.from(list).filter((f) => f.size > 0);
    if (!files.length) return;
    setError("");
    const room = MAX_ATTACH - attached.length - uploading.length;
    if (room <= 0) {
      setError(`Up to ${MAX_ATTACH} files per message.`);
      return;
    }
    const batch = files.slice(0, room);
    if (files.length > batch.length) setError(`Only ${batch.length} more file(s) fit on this message.`);
    const metas = await Promise.all(batch.map(uploadOne));
    const ok = metas.filter((m): m is AttMeta => !!m);
    if (ok.length) setAttached((a) => [...a, ...ok].slice(0, MAX_ATTACH));
  }, [attached.length, uploading.length]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files?.length) void uploadFiles(e.dataTransfer.files);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData?.files?.length) {
      e.preventDefault();
      void uploadFiles(e.clipboardData.files);
    }
  };

  /* ---------- voice input ---------- */
  const startRecording = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => stream.getTracks().forEach((t) => t.stop());
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("Microphone unavailable — check browser permissions.");
    }
  };

  const stopRecording = async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    setRecording(false);
    setTranscribing(true);
    try {
      await new Promise<void>((res) => {
        rec.onstop = () => res();
        rec.stop();
      });
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      chunksRef.current = [];
      if (!blob.size) throw new Error("nothing recorded");
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
      await ctx.close();
      const wav = encodeWav(decoded, 16000);
      const fd = new FormData();
      fd.append("file", new Blob([wav], { type: "audio/wav" }));
      const r = await fetch("/api/ai/transcribe", { method: "POST", body: fd });
      const data = (await r.json().catch(() => ({}))) as { text?: string; error?: string };
      if (r.ok && data.text) {
        const t = data.text;
        setInput((p) => (p ? `${p} ${t}`.slice(0, 8000) : t));
      } else {
        setError(data.error || "Could not transcribe — try again.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Voice input failed.");
    } finally {
      setTranscribing(false);
      recorderRef.current = null;
    }
  };

  /* ---------- read aloud (TTS) ---------- */
  const stopSpeaking = () => {
    speechTokenRef.current++;
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeaking(null);
  };

  const speak = async (m: AIMsg) => {
    if (speaking?.id === m.id) {
      stopSpeaking();
      return;
    }
    stopSpeaking();
    const token = ++speechTokenRef.current;
    setSpeaking({ id: m.id, loading: true });
    try {
      const chunks = splitForTts(m.content);
      let first = true;
      for (const chunk of chunks) {
        if (speechTokenRef.current !== token) return;
        const r = await fetch("/api/ai/tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: chunk }),
        });
        if (!r.ok) throw new Error("speech failed");
        if (first) {
          setSpeaking({ id: m.id, loading: false });
          first = false;
        }
        if (speechTokenRef.current !== token) return;
        const blob = await r.blob();
        await new Promise<void>((res) => {
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => {
            URL.revokeObjectURL(url);
            res();
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            res();
          };
          void audio.play().catch(() => {
            URL.revokeObjectURL(url);
            res();
          });
        });
      }
    } catch {
      setError("Could not generate speech for this message.");
    } finally {
      if (speechTokenRef.current === token) setSpeaking(null);
    }
  };

  /* ---------- export ---------- */
  const exportChat = () => {
    if (!messages.length) return;
    const md = [
      "# Memphis AI — chat export",
      "",
      ...messages.map((m) => {
        const atts = m.attachments?.length
          ? `\n\n_Attachments: ${m.attachments.map((a) => a.name).join(", ")}_`
          : "";
        return `**${m.role === "user" ? "You" : "Memphis AI"}:**\n\n${m.content}${atts}\n`;
      }),
    ].join("\n---\n\n");
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `memphis-chat-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* ---------- turn engine (send / regenerate / edit-resend) ---------- */
  const runTurn = async (opts: {
    text: string;
    atts: AttMeta[];
    regenerate?: boolean;
    editMessageId?: string | null;
  }) => {
    if (sending || uploading.length) return;
    const sid = aiSessionId();
    if (!sid) return;
    setError("");
    setStatus("");
    setSending(true);
    stopSpeaking();
    setSuggestions(null);

    /* local message-list surgery so the UI matches what the server
       will do before the first token arrives */
    if (opts.editMessageId) {
      setMessages((m) => {
        const i = m.findIndex((x) => x.id === opts.editMessageId);
        return i === -1 ? m : m.slice(0, i + 1);
      });
    } else if (opts.regenerate) {
      setMessages((m) => {
        let k = m.length;
        while (k > 0 && m[k - 1].role === "assistant") k--;
        return k === m.length ? m : m.slice(0, k);
      });
    } else {
      const userMsg: AIMsg = {
        id: "local-" + Date.now(),
        role: "user",
        content: opts.text || "(files attached — please review them)",
        attachments: opts.atts.length ? opts.atts : undefined,
      };
      setMessages((m) => [...m, userMsg]);
    }
    setMessages((m) => [...m, { id: "stream", role: "assistant", content: "", streaming: true }]);
    sendingRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          conversationId: activeId,
          message: opts.text,
          instructions: instructionsDraft,
          attachments: opts.atts.map((a) => a.id),
          webSearch,
          imageMode,
          mode,
          ...(opts.regenerate ? { regenerate: true } : {}),
          ...(opts.editMessageId ? { edit: { messageId: opts.editMessageId, text: opts.text } } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let thinkAcc = "";
      let streamAtts: AttMeta[] | null = null;
      let convId = activeId;
      let finalId = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const evLine = block.split("\n").find((l) => l.startsWith("event: "));
          const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
          if (!evLine || !dataLine) continue;
          const event = evLine.slice(7).trim();
          let payload: Record<string, unknown> = {};
          try {
            payload = JSON.parse(dataLine.slice(6));
          } catch {
            continue;
          }
          if (event === "meta" && typeof payload.conversationId === "string") {
            convId = payload.conversationId;
            setActiveId(payload.conversationId);
            /* swap the optimistic local-… id for the persisted one so
               edit / regenerate work before a reload */
            if (typeof payload.userMessageId === "string") {
              const realId = payload.userMessageId;
              setMessages((ms) => {
                for (let i = ms.length - 1; i >= 0; i--) {
                  if (ms[i].role === "user" && ms[i].id.startsWith("local-")) {
                    const next = [...ms];
                    next[i] = { ...next[i], id: realId };
                    return next;
                  }
                }
                return ms;
              });
            }
          } else if (event === "status" && typeof payload.stage === "string") {
            setStatus(payload.stage);
          } else if (event === "reasoning" && typeof payload.text === "string") {
            thinkAcc += payload.text;
            setMessages((m) =>
              m.map((msg) => (msg.id === "stream" ? { ...msg, reasoning: thinkAcc } : msg))
            );
          } else if (event === "delta" && typeof payload.text === "string") {
            acc += payload.text;
            setStatus("");
            setMessages((m) =>
              m.map((msg) => (msg.id === "stream" ? { ...msg, content: acc } : msg))
            );
          } else if (event === "error") {
            throw new Error(String(payload.message || "The model is unavailable."));
          } else if (event === "done") {
            finalId = String(payload.messageId ?? "saved");
            if (Array.isArray(payload.attachments)) {
              streamAtts = payload.attachments as AttMeta[];
            }
            const doneReasoning =
              typeof payload.reasoning === "string" && payload.reasoning ? payload.reasoning : thinkAcc;
            const doneMode = typeof payload.mode === "string" ? payload.mode : mode;
            setMessages((m) =>
              m.map((msg) =>
                msg.id === "stream"
                  ? {
                      id: finalId,
                      role: "assistant",
                      content: acc,
                      attachments: streamAtts ?? undefined,
                      reasoning: doneReasoning || undefined,
                      mode: doneMode,
                    }
                  : msg
              )
            );
            /* follow-up suggestion chips for the fresh reply */
            const suggestFor = finalId;
            const suggestConv = (typeof payload.conversationId === "string"
              ? payload.conversationId
              : convId) as string | null;
            if (suggestConv && !imageMode) {
              void fetch("/api/ai/suggest", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ sessionId: sid, conversationId: suggestConv }),
              })
                .then((r) => r.json())
                .then((d: { suggestions?: string[] }) => {
                  if (Array.isArray(d.suggestions) && d.suggestions.length)
                    setSuggestions({ forId: suggestFor, items: d.suggestions.slice(0, 3) });
                })
                .catch(() => { /* chips are optional */ });
            }
          }
        }
      }
      void loadConversations();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg !== "The user aborted a request." && !msg.toLowerCase().includes("abort")) {
        setError(msg);
      }
      setMessages((m) =>
        m
          /* rename any orphaned stream placeholder so the next send
             can't produce a duplicate React key; keep whatever partial
             reply + thinking already streamed (Stop button) */
          .map((x) =>
            x.id === "stream"
              ? { ...x, id: "aborted-" + Date.now(), streaming: false }
              : x
          )
          .filter((x) => x.role === "user" || x.content || x.reasoning)
      );
    } finally {
      sendingRef.current = false;
      setSending(false);
      setStatus("");
      abortRef.current = null;
    }
  };

  /* ---------- send (fresh or edit-resend) ---------- */
  const send = async () => {
    const text = input.trim();
    const atts = attached;
    if ((!text && !atts.length) || sending || uploading.length) return;
    const editId = editing?.id ?? null;
    setInput("");
    setAttached([]);
    setEditing(null);
    await runTurn({ text, atts, editMessageId: editId });
  };

  /* ---------- stop generating (keeps the partial reply) ---------- */
  const stop = () => {
    abortRef.current?.abort();
  };

  /* ---------- regenerate the last reply ---------- */
  const regenerate = async () => {
    if (sending || !activeId) return;
    await runTurn({ text: "", atts: [], regenerate: true });
  };

  /* ---------- edit an earlier user message ---------- */
  const startEdit = (m: AIMsg) => {
    if (sending) return;
    setEditing({ id: m.id });
    setInput(m.content === "(files attached — please review them)" ? "" : m.content);
    setAttached(m.attachments ?? []);
    setStatus("");
    inputRef.current?.focus();
  };

  const cancelEdit = () => {
    setEditing(null);
    setInput("");
    setAttached([]);
  };

  /* ---------- rename a conversation ---------- */
  const commitRename = async (id: string) => {
    const title = renameDraft.trim().slice(0, 60);
    setRenaming(null);
    if (!title) return;
    setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, title } : c)));
    try {
      await fetch(
        `/api/ai/conversations/${id}?sessionId=${encodeURIComponent(aiSessionId())}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title }),
        }
      );
    } catch { /* offline — next reload re-syncs */ }
  };

  const saveInstructions = async () => {
    if (!activeId) {
      setInstructions(instructionsDraft);
      return;
    }
    setSavingInstructions(true);
    try {
      const r = await fetch(
        `/api/ai/conversations/${activeId}?sessionId=${encodeURIComponent(aiSessionId())}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ instructions: instructionsDraft }),
        }
      );
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Could not save instructions.");
        return;
      }
      setInstructions(instructionsDraft);
    } catch {
      setError("Could not save instructions — check your connection.");
    } finally {
      setSavingInstructions(false);
    }
  };

  const deleteConversation = async (id: string) => {
    try {
      await fetch(
        `/api/ai/conversations/${id}?sessionId=${encodeURIComponent(aiSessionId())}`,
        { method: "DELETE" }
      );
    } catch { /* offline — keep the row; next reload re-syncs */ }
    if (activeId === id) newChat();
    void loadConversations();
  };

  const generateFlashcards = async () => {
    if (genCards) return;
    if (!messages.length) {
      setError("Chat about a topic first, then build flashcards from it.");
      return;
    }
    setGenCards(true);
    setError("");
    try {
      const r = await fetch("/api/ai/flashcards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: aiSessionId(), conversationId: activeId }),
      });
      const data = (await r.json().catch(() => ({}))) as { cards?: Flashcard[]; error?: string };
      if (r.ok && data.cards?.length) {
        const next = [...data.cards, ...cards].slice(0, 120);
        setCards(next);
        lsSet(FLASHCARD_KEY, next);
        setCardIdx(0);
        setCardFlipped(false);
        setShowCards(true);
      } else {
        setError(data.error || "Could not build flashcards — try again.");
      }
    } catch {
      setError("Could not build flashcards — check your connection.");
    } finally {
      setGenCards(false);
    }
  };

  const copyMessage = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  /* ---------- render ---------- */
  const card = cards[cardIdx];
  let lastAssistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      lastAssistantIdx = i;
      break;
    }
  }
  const busyLabel =
    status && STATUS_LABEL[status]
      ? STATUS_LABEL[status]
      : sending
        ? "thinking"
        : "";

  return (
    <div
      className="flex-1 flex min-h-0 relative"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={onDrop}
    >
      {/* drag overlay */}
      {dragging && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="border-2 border-dashed border-white/50 rounded-2xl px-10 py-8 text-center">
            <Paperclip className="size-8 mx-auto text-white mb-3" />
            <p className="text-white font-semibold">Drop files to attach</p>
            <p className="text-[12px] text-[#999] mt-1">
              PDFs, docs, sheets, images, audio, video, code — anything
            </p>
          </div>
        </div>
      )}

      {/* sidebar */}
      <aside
        className={`${sidebarOpen ? "flex" : "hidden"} md:flex absolute md:relative inset-0 md:inset-auto z-30 md:z-auto bg-black/95 md:bg-transparent flex-col w-64 md:w-60 shrink-0 border-r border-[#141414]`}
      >
        <div className="p-3 border-b border-[#141414] flex gap-2">
          <Button
            onClick={newChat}
            className="flex-1 bg-white text-black hover:bg-[#e0e0e0]"
            size="sm"
          >
            <Plus className="size-4 mr-1" /> New chat
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="md:hidden border-[#2a2a2a] text-white"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close conversation list"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 memphis-scroll">
          <p className="mono-label px-2 py-1">Your chats</p>
          {conversations.length === 0 && (
            <p className="text-[12px] text-[#555] px-2 py-2">
              Your conversations appear here — saved on this Memphis server for your browser
              session.
            </p>
          )}
          {conversations.map((c) => (
            <div key={c.id} className="group flex items-center">
              {renaming === c.id ? (
                <input
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void commitRename(c.id);
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setRenaming(null);
                    }
                  }}
                  onBlur={() => void commitRename(c.id)}
                  maxLength={60}
                  aria-label="Rename chat"
                  className="flex-1 min-w-0 px-2 py-1.5 rounded-md bg-[#141414] border border-[#333] text-[13px] text-white outline-none focus:border-[#555]"
                />
              ) : (
                <>
                  <button
                    onClick={() => {
                      setActiveId(c.id);
                      setSidebarOpen(false);
                    }}
                    className={`flex-1 text-left px-2 py-1.5 rounded-md text-[13px] truncate transition-colors ${
                      activeId === c.id
                        ? "bg-[#141414] text-white"
                        : "text-[#9a9a9a] hover:bg-[#0d0d0d] hover:text-white"
                    }`}
                  >
                    {c.title}
                  </button>
                  <button
                    onClick={() => {
                      setRenaming(c.id);
                      setRenameDraft(c.title);
                    }}
                    aria-label={`Rename ${c.title}`}
                    title="Rename chat"
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-[#666] hover:text-white"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => void deleteConversation(c.id)}
                    aria-label={`Delete ${c.title}`}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-[#666] hover:text-white"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-[#141414] flex items-center gap-1.5 text-[11px] text-[#777]">
          <InfinityIcon className="size-3.5" />
          GLM · free · unlimited
        </div>
      </aside>

      {/* main */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-[#141414] px-4 py-2.5 flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden text-white size-8"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open conversation list"
          >
            <Menu className="size-4" />
          </Button>
          <Sparkles className="size-4 text-white" />
          <h1 className="text-sm font-semibold text-white">Memphis AI</h1>
          <span className="text-[11px] text-[#555] hidden lg:inline">
            files · vision · voice · search · images · reasoning
          </span>
          <div className="ml-auto flex items-center gap-2">
            {messages.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={exportChat}
                className="border-[#2a2a2a] text-white hover:bg-[#101010]"
              >
                <Download className="size-4 mr-1" />
                <span className="hidden sm:inline">Export</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void generateFlashcards()}
              disabled={genCards}
              className="border-[#2a2a2a] text-white hover:bg-[#101010]"
            >
              <Layers className="size-4 mr-1" />
              {genCards ? "Building…" : "Flashcards"}
            </Button>
            {cards.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCardIdx(0);
                  setCardFlipped(false);
                  setShowCards(true);
                }}
                className="text-[#9a9a9a] hover:text-white"
              >
                Study ({cards.length})
              </Button>
            )}
          </div>
        </div>

        {/* messages */}
        <div className="flex-1 overflow-y-auto memphis-scroll">
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
            {messages.length === 0 && !sending && (
              <div className="text-center py-12">
                <Sparkles className="size-7 mx-auto text-[#555] mb-3" />
                <h2 className="text-lg text-white font-semibold">How can I help today?</h2>
                <p className="text-[13px] text-[#777] mt-2">
                  A real AI chat running on GLM — free, unlimited, no account needed.
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-[#666]">
                  <span className="inline-flex items-center gap-1"><Paperclip className="size-3" /> any file</span>
                  <span className="inline-flex items-center gap-1"><ImageIcon className="size-3" /> vision</span>
                  <span className="inline-flex items-center gap-1"><Mic className="size-3" /> voice</span>
                  <span className="inline-flex items-center gap-1"><Globe className="size-3" /> web search</span>
                  <span className="inline-flex items-center gap-1"><Palette className="size-3" /> images</span>
                  <span className="inline-flex items-center gap-1"><Brain className="size-3" /> reasoning</span>
                </div>
                <div className="mt-6 grid sm:grid-cols-2 gap-2 text-left">
                  {[
                    "Summarize a PDF — attach it below",
                    "Search the web for today's tech news",
                    "Generate an image of a neon city at night",
                    "Explain the Monty Hall problem step by step",
                  ].map((s) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      className="text-[13px] text-[#c9c9c9] border border-[#1a1a1a] bg-[#080808] rounded-lg p-3 hover:border-[#3a3a3a] hover:bg-[#0d0d0d] transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, idx) => (
              <div
                key={m.id}
                className={m.role === "user" ? "flex justify-end" : "flex"}
              >
                <div
                  className={`group relative max-w-[88%] rounded-xl px-3.5 py-2.5 ${
                    m.role === "user"
                      ? "bg-white text-black"
                      : "bg-[#0d0d0d] text-[#dcdcdc] border border-[#1a1a1a]"
                  }`}
                >
                  {m.role === "user" ? (
                    <>
                      {m.attachments && m.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {m.attachments.map((a) => (
                            <AttChip key={a.id} att={a} />
                          ))}
                        </div>
                      )}
                      <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">
                        {m.content}
                      </p>
                      {!sending && !m.id.startsWith("local-") && editing?.id !== m.id && (
                        <button
                          onClick={() => startEdit(m)}
                          aria-label="Edit and resend"
                          title="Edit & resend"
                          className="absolute -bottom-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-[#161616] border border-[#262626] rounded p-1 text-[#888] hover:text-white"
                        >
                          <Pencil className="size-3" />
                        </button>
                      )}
                    </>
                  ) : m.content ? (
                    <>
                      {m.reasoning ? (
                        <ThinkBlock text={m.reasoning} streaming={m.streaming} />
                      ) : null}
                      <Md text={m.content} />
                    </>
                  ) : (
                    <>
                      {m.reasoning ? <ThinkBlock text={m.reasoning} streaming /> : null}
                      <span className="flex items-center gap-1.5 text-[13px] text-[#777]">
                        <span className="boot-pulse">{busyLabel || "thinking"}</span>
                        <span className="flex gap-0.5">
                          {[0, 1, 2].map((i) => (
                            <span
                              key={i}
                              className="size-1 rounded-full bg-[#777]"
                              style={{ animation: `blink 1.2s ${i * 0.2}s infinite` }}
                            />
                          ))}
                        </span>
                      </span>
                    </>
                  )}
                  {m.role === "assistant" && m.content && !m.streaming && (
                    <div className="absolute -bottom-2 right-2 z-10 flex gap-0.5">
                      {idx === lastAssistantIdx && !sending && (
                        <button
                          onClick={() => void regenerate()}
                          aria-label="Regenerate reply"
                          title="Regenerate"
                          className="opacity-0 group-hover:opacity-100 transition-opacity bg-[#161616] border border-[#262626] rounded p-1 text-[#888] hover:text-white"
                        >
                          <RotateCcw className="size-3" />
                        </button>
                      )}
                      <button
                        onClick={() => void speak(m)}
                        aria-label={speaking?.id === m.id ? "Stop reading aloud" : "Read aloud"}
                        className="opacity-0 group-hover:opacity-100 transition-opacity bg-[#161616] border border-[#262626] rounded p-1 text-[#888] hover:text-white"
                      >
                        {speaking?.id === m.id ? (
                          speaking.loading ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Volume2 className="size-3 text-white" />
                          )
                        ) : (
                          <Volume2 className="size-3" />
                        )}
                      </button>
                      <button
                        onClick={() => void copyMessage(m.id, m.content)}
                        aria-label="Copy message"
                        className="opacity-0 group-hover:opacity-100 transition-opacity bg-[#161616] border border-[#262626] rounded p-1 text-[#888] hover:text-white"
                      >
                        {copiedId === m.id ? (
                          <Check className="size-3" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {/* follow-up suggestion chips for the latest reply */}
            {suggestions &&
              suggestions.items.length > 0 &&
              !sending &&
              messages[messages.length - 1]?.id === suggestions.forId && (
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5 pt-1">
                  {suggestions.items.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setInput(s);
                        inputRef.current?.focus();
                      }}
                      className="text-left text-[12.5px] text-[#b5b5b5] border border-[#1e1e1e] bg-[#0a0a0a] rounded-lg px-2.5 py-1.5 hover:border-[#3a3a3a] hover:text-white transition-colors inline-flex items-center gap-1.5 max-w-full"
                    >
                      <CornerDownRight className="size-3 shrink-0 text-[#666]" />
                      <span className="truncate">{s}</span>
                    </button>
                  ))}
                </div>
              )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* custom instructions */}
        {instructions && (
          <div className="px-4 py-2 border-t border-[#141414] bg-[#050505]">
            <p className="text-[11px] text-[#666]">
              <span className="font-mono uppercase tracking-wider">custom instructions:</span>{" "}
              {instructions}
            </p>
          </div>
        )}

        {error && (
          <div className="px-4 py-2 border-t border-[#141414]">
            <p className="text-[12px] text-white bg-[#161616] border border-[#333] rounded px-2.5 py-1.5">
              {error}
            </p>
          </div>
        )}

        {/* composer */}
        <div className="border-t border-[#141414] p-3">
          <div className="max-w-2xl mx-auto">
            <div
              className={`rounded-xl border bg-[#0a0a0a] transition-colors ${
                dragging ? "border-white/60" : "border-[#1f1f1f] focus-within:border-[#333]"
              }`}
            >
              {/* edit-mode banner */}
              {editing && (
                <div className="flex items-center gap-2 px-3 pt-3">
                  <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[#ddd] bg-[#161616] border border-[#333] rounded-md px-2 py-1">
                    <Pencil className="size-3" /> Editing message
                  </span>
                  <span className="text-[11.5px] text-[#777]">Enter to resend · Esc to cancel</span>
                  <button
                    onClick={cancelEdit}
                    aria-label="Cancel edit"
                    className="ml-auto p-1 text-[#888] hover:text-white"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )}

              {/* upload progress chips */}
              {uploading.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-3 pt-3">
                  {uploading.map((u) => (
                    <span
                      key={u.key}
                      className="inline-flex items-center gap-1.5 max-w-[220px] rounded-lg border border-[#262626] bg-[#111] px-2 py-1 text-[11.5px] text-[#ccc]"
                    >
                      <Loader2 className="size-3.5 shrink-0 animate-spin text-[#8a8a8a]" />
                      <span className="truncate">{u.name}</span>
                      <span className="shrink-0 text-[#666] font-mono">{u.pct}%</span>
                    </span>
                  ))}
                </div>
              )}

              {/* attached file chips */}
              {attached.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-3 pt-3">
                  {attached.map((a) => (
                    <AttChip
                      key={a.id}
                      att={a}
                      onRemove={() => setAttached((list) => list.filter((x) => x.id !== a.id))}
                    />
                  ))}
                </div>
              )}

              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                  if (e.key === "Escape" && editing) {
                    e.preventDefault();
                    cancelEdit();
                  }
                }}
                onPaste={onPaste}
                placeholder={
                  imageMode
                    ? "Describe the image to create — or attach one to edit it…"
                    : "Ask anything — attach files, paste images, or drop them here"
                }
                rows={2}
                maxLength={8000}
                aria-label="Message Memphis AI"
                className="bg-transparent border-0 text-white placeholder:text-[#555] focus-visible:ring-0 min-h-0 resize-none pt-3"
              />

              {/* composer toolbar */}
              <div className="flex items-center gap-1.5 px-2.5 pb-2.5 pt-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) void uploadFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attached.length + uploading.length >= MAX_ATTACH}
                  aria-label="Attach files"
                  title="Attach files — any type"
                  className="p-2 rounded-lg text-[#999] hover:text-white hover:bg-[#161616] disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                >
                  <Paperclip className="size-4" />
                </button>

                {/* Fast / Reasoning mode */}
                <div
                  role="group"
                  aria-label="Reply mode"
                  className="inline-flex items-center rounded-lg border border-[#262626] overflow-hidden"
                >
                  <button
                    onClick={() => setModePersisted("fast")}
                    aria-pressed={mode === "fast"}
                    title="Fast — quick, direct answers"
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] transition-colors ${
                      mode === "fast"
                        ? "bg-white text-black"
                        : "text-[#999] hover:text-white hover:bg-[#161616]"
                    }`}
                  >
                    <Zap className="size-3.5" /> Fast
                  </button>
                  <button
                    onClick={() => setModePersisted("reasoning")}
                    aria-pressed={mode === "reasoning"}
                    title="Reasoning — thinks step by step before answering"
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] border-l border-[#262626] transition-colors ${
                      mode === "reasoning"
                        ? "bg-white text-black"
                        : "text-[#999] hover:text-white hover:bg-[#161616]"
                    }`}
                  >
                    <Brain className="size-3.5" /> Reasoning
                  </button>
                </div>

                <button
                  onClick={() => {
                    setWebSearch((v) => !v);
                    if (imageMode) setImageMode(false);
                  }}
                  aria-pressed={webSearch}
                  title="Search the web and cite sources"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] border transition-colors ${
                    webSearch
                      ? "bg-white text-black border-white"
                      : "border-[#262626] text-[#999] hover:text-white hover:bg-[#161616]"
                  }`}
                >
                  <Globe className="size-3.5" /> Web
                </button>

                <button
                  onClick={() => {
                    setImageMode((v) => !v);
                    if (webSearch) setWebSearch(false);
                  }}
                  aria-pressed={imageMode}
                  title="Create or edit images"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] border transition-colors ${
                    imageMode
                      ? "bg-white text-black border-white"
                      : "border-[#262626] text-[#999] hover:text-white hover:bg-[#161616]"
                  }`}
                >
                  <Palette className="size-3.5" /> Image
                </button>

                <div className="ml-auto flex items-center gap-1.5">
                  {recording && (
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-red-400 font-mono">
                      <span className="size-2 rounded-full bg-red-500 animate-pulse" />
                      {String(Math.floor(recordSecs / 60)).padStart(2, "0")}:
                      {String(recordSecs % 60).padStart(2, "0")}
                    </span>
                  )}
                  {transcribing && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-[#888]">
                      <Loader2 className="size-3 animate-spin" /> transcribing…
                    </span>
                  )}
                  <button
                    onClick={() => (recording ? void stopRecording() : void startRecording())}
                    aria-label={recording ? "Stop recording" : "Record voice message"}
                    title={recording ? "Stop & transcribe" : "Voice input"}
                    className={`p-2 rounded-lg transition-colors ${
                      recording
                        ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                        : "text-[#999] hover:text-white hover:bg-[#161616]"
                    }`}
                  >
                    {recording ? <Square className="size-4" /> : <Mic className="size-4" />}
                  </button>
                  <Button
                    onClick={() => (sending ? stop() : void send())}
                    disabled={(!sending && (!input.trim() && !attached.length)) || uploading.length > 0}
                    className="bg-white text-black hover:bg-[#e0e0e0] size-9 p-0 rounded-lg"
                    aria-label={sending ? "Stop generating" : "Send message"}
                    title={sending ? "Stop — keep what arrived" : "Send"}
                  >
                    {sending ? (
                      <Square className="size-4 fill-current" />
                    ) : (
                      <Send className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-1.5 px-1">
              <span className="text-[11px] text-[#555]">
                {uploading.length > 0
                  ? "Uploading & reading your files…"
                  : sending
                    ? busyLabel === "thinking"
                      ? "GLM is thinking…"
                      : busyLabel
                        ? `${busyLabel}`
                        : "GLM is writing…"
                    : "Enter to send · Shift+Enter for newline"}
              </span>
              {attached.length > 0 && (
                <span className="text-[11px] text-[#666]">
                  {attached.length}/{MAX_ATTACH} files
                </span>
              )}
            </div>

            {/* custom instructions editor */}
            <details className="mt-2 group">
              <summary className="text-[12px] text-[#777] hover:text-white cursor-pointer select-none flex items-center gap-1.5">
                <MessagesSquare className="size-3.5" /> Custom instructions
              </summary>
              <div className="mt-2 flex gap-2">
                <Textarea
                  value={instructionsDraft}
                  onChange={(e) => setInstructionsDraft(e.target.value)}
                  placeholder="e.g. Answer in Spanish. I'm a beginner coder — explain like I'm new."
                  rows={2}
                  maxLength={1000}
                  className="bg-[#050505] border-[#1f1f1f] text-white placeholder:text-[#555] text-[12px] focus-visible:ring-white/30 min-h-0"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void saveInstructions()}
                  disabled={savingInstructions}
                  className="border-[#2a2a2a] text-white hover:bg-[#101010] self-start"
                >
                  <Save className="size-3.5" /> {savingInstructions ? "…" : "Save"}
                </Button>
              </div>
            </details>
          </div>
        </div>
      </div>

      {/* flashcards modal */}
      <Dialog open={showCards} onOpenChange={setShowCards}>
        <DialogContent className="bg-[#050505] border-[#1f1f1f] text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Layers className="size-4" /> Flashcards
            </DialogTitle>
            <DialogDescription className="text-xs text-[#7a7a7a]">
              Click the card to flip. {cards.length} card{cards.length === 1 ? "" : "s"} saved
              on this device.
            </DialogDescription>
          </DialogHeader>
          {card ? (
            <>
              <button
                onClick={() => setCardFlipped((f) => !f)}
                className="w-full min-h-44 rounded-lg border border-[#222] bg-[#0a0a0a] p-6 text-center hover:border-[#444] transition-colors"
                aria-label={cardFlipped ? "Show question" : "Show answer"}
              >
                <p className="text-[11px] font-mono uppercase tracking-wider text-[#555] mb-2">
                  {cardFlipped ? "answer" : "question"}
                </p>
                <p className="text-[15px] text-white leading-relaxed">
                  {cardFlipped ? card.back : card.front}
                </p>
              </button>
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCardIdx((i) => (i - 1 + cards.length) % cards.length);
                    setCardFlipped(false);
                  }}
                  className="text-[#9a9a9a] hover:text-white"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-[12px] text-[#777] font-mono">
                  {cardIdx + 1} / {cards.length}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Restart deck"
                    onClick={() => {
                      setCardIdx(0);
                      setCardFlipped(false);
                    }}
                    className="text-[#9a9a9a] hover:text-white"
                  >
                    <RotateCcw className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Delete this card"
                    onClick={() => {
                      const next = cards.filter((_, i) => i !== cardIdx);
                      setCards(next);
                      lsSet(FLASHCARD_KEY, next);
                      setCardIdx((i) => Math.min(i, Math.max(0, next.length - 1)));
                      if (!next.length) setShowCards(false);
                    }}
                    className="text-[#9a9a9a] hover:text-white"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCardIdx((i) => (i + 1) % cards.length);
                      setCardFlipped(false);
                    }}
                    className="text-[#9a9a9a] hover:text-white"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-[13px] text-[#777] text-center py-6">
              No cards — generate some from a chat.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
