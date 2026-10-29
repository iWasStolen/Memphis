"use client";

/* ============================================================
   Memphis AI — a real chat backed by GLM (via z-ai-web-dev-sdk
   on the server). Free, no sign-in, no token limits. Streams
   token-by-token over SSE and renders markdown.
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
} from "lucide-react";

interface AIMsg {
  id: string;
  role: string;
  content: string;
  streaming?: boolean;
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
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
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

  /* ---------- actions ---------- */
  const newChat = () => {
    if (sending) abortRef.current?.abort();
    setActiveId(null);
    setMessages([]);
    setInstructions("");
    setInstructionsDraft("");
    setError("");
    setSidebarOpen(false);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const sid = aiSessionId();
    if (!sid) return;
    setError("");
    setInput("");
    setSending(true);

    const userMsg: AIMsg = { id: "local-" + Date.now(), role: "user", content: text };
    const streamMsg: AIMsg = { id: "stream", role: "assistant", content: "", streaming: true };
    setMessages((m) => [...m, userMsg, streamMsg]);
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
          message: text,
          instructions: instructionsDraft,
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
            setActiveId(payload.conversationId);
          } else if (event === "delta" && typeof payload.text === "string") {
            acc += payload.text;
            setMessages((m) =>
              m.map((msg) => (msg.id === "stream" ? { ...msg, content: acc } : msg))
            );
          } else if (event === "error") {
            throw new Error(String(payload.message || "The model is unavailable."));
          } else if (event === "done") {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === "stream"
                  ? {
                      id: String(payload.messageId ?? "saved"),
                      role: "assistant",
                      content: acc,
                    }
                  : msg
              )
            );
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
             can't produce a duplicate React key */
          .map((x) => (x.id === "stream" ? { ...x, id: "aborted-" + Date.now(), streaming: false } : x))
          .filter((x) => x.role === "user" || x.content)
      );
    } finally {
      sendingRef.current = false;
      setSending(false);
      abortRef.current = null;
    }
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

  return (
    <div className="flex-1 flex min-h-0 relative">
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
                onClick={() => void deleteConversation(c.id)}
                aria-label={`Delete ${c.title}`}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-[#666] hover:text-white"
              >
                <Trash2 className="size-3.5" />
              </button>
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
          <span className="text-[11px] text-[#555] hidden sm:inline">
            powered by GLM
          </span>
          <div className="ml-auto flex items-center gap-2">
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
                  Ask anything.
                </p>
                <div className="mt-6 grid sm:grid-cols-2 gap-2 text-left">
                  {[
                    "Explain how a scramjet engine works",
                    "Write a Python script to rename my files",
                    "Help me draft a message to my teacher",
                    "Give me a 20-minute full-body workout plan",
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
            {messages.map((m) => (
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
                    <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">
                      {m.content}
                    </p>
                  ) : m.content ? (
                    <Md text={m.content} />
                  ) : (
                    <span className="flex items-center gap-1.5 text-[13px] text-[#777]">
                      <span className="boot-pulse">thinking</span>
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
                  )}
                  {m.role === "assistant" && m.content && !m.streaming && (
                    <button
                      onClick={() => void copyMessage(m.id, m.content)}
                      aria-label="Copy message"
                      className="absolute -bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-[#161616] border border-[#262626] rounded p-1 text-[#888] hover:text-white"
                    >
                      {copiedId === m.id ? (
                        <Check className="size-3" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
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

        {/* input */}
        <div className="border-t border-[#141414] p-3">
          <div className="max-w-2xl mx-auto">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Ask anything — Shift+Enter for a new line"
                  rows={2}
                  maxLength={8000}
                  aria-label="Message Memphis AI"
                  className="bg-[#050505] border-[#1f1f1f] text-white placeholder:text-[#555] focus-visible:ring-white/30 min-h-0 resize-none"
                />
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[11px] text-[#555]">
                    {sending ? (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="size-3 animate-spin" /> GLM is writing…
                      </span>
                    ) : (
                      "Enter to send · Shift+Enter for newline"
                    )}
                  </span>
                </div>
              </div>
              <Button
                onClick={() => void send()}
                disabled={!input.trim() || sending}
                className="bg-white text-black hover:bg-[#e0e0e0] self-start"
                aria-label="Send message"
              >
                <Send className="size-4" />
              </Button>
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
