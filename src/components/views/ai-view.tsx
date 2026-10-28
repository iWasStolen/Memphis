"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, lsGet, lsSet, getToken } from "@/lib/store";
import { useAuth } from "@/lib/socket";
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
  Lock,
} from "lucide-react";

interface AIMsg {
  id: string;
  role: string;
  content: string;
  createdAt?: string;
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

export default function AiView() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AIMsg[]>([]);
  const [instructions, setInstructions] = useState("");
  const [instructionsDraft, setInstructionsDraft] = useState("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [tokensUsed, setTokensUsed] = useState(0);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [cardIdx, setCardIdx] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [genCards, setGenCards] = useState(false);
  const [showCards, setShowCards] = useState(false);
  const [savingInstructions, setSavingInstructions] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const signedIn = !!user && !!getToken();

  /* ---------- load conversation list ---------- */
  const loadConversations = useCallback(async () => {
    if (!signedIn) return;
    const r = await api<{
      conversations?: ConversationRow[];
      tokensUsed?: number;
    }>("/api/ai/conversations");
    if (r.ok) {
      setConversations(r.data.conversations ?? []);
      setTokensUsed(r.data.tokensUsed ?? 0);
    }
  }, [signedIn]);

  useEffect(() => {
    void loadConversations();
    setCards(lsGet<Flashcard[]>(FLASHCARD_KEY, []));
  }, [loadConversations]);

  /* ---------- load messages for active conversation ---------- */
  useEffect(() => {
    if (!activeId || !signedIn) return;
    void (async () => {
      const r = await api<{
        conversation?: ConversationRow;
        messages?: AIMsg[];
      }>(`/api/ai/conversations/${activeId}`);
      if (r.ok && r.data.conversation) {
        setMessages(r.data.messages ?? []);
        setInstructions(r.data.conversation.instructions ?? "");
        setInstructionsDraft(r.data.conversation.instructions ?? "");
      }
    })();
  }, [activeId, signedIn]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  /* ---------- actions ---------- */
  const newChat = () => {
    setActiveId(null);
    setMessages([]);
    setInstructions("");
    setInstructionsDraft("");
    setError("");
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (!signedIn) {
      setError("Sign in to Chat first (username + password) — the AI tutor uses your chat account.");
      return;
    }
    setError("");
    setInput("");
    setSending(true);
    setMessages((m) => [...m, { id: "local-" + Date.now(), role: "user", content: text }]);
    const r = await api<{
      conversationId?: string;
      message?: AIMsg;
      tokensUsed?: number;
      error?: string;
    }>("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({
        conversationId: activeId,
        message: text,
        instructions: instructionsDraft,
      }),
    });
    setSending(false);
    if (!r.ok || r.data.error || !r.data.message) {
      setError(r.data.error || "The tutor is unavailable right now — try again.");
      return;
    }
    setMessages((m) => [...m, r.data.message!]);
    if (r.data.conversationId) setActiveId(r.data.conversationId);
    if (r.data.tokensUsed != null) setTokensUsed(r.data.tokensUsed);
    void loadConversations();
  };

  const saveInstructions = async () => {
    setSavingInstructions(true);
    if (activeId) {
      await api(`/api/ai/conversations/${activeId}`, {
        method: "PATCH",
        body: JSON.stringify({ instructions: instructionsDraft }),
      });
    }
    setInstructions(instructionsDraft);
    setSavingInstructions(false);
  };

  const deleteConversation = async (id: string) => {
    await api(`/api/ai/conversations/${id}`, { method: "DELETE" });
    if (activeId === id) newChat();
    void loadConversations();
  };

  const generateFlashcards = async () => {
    if (genCards) return;
    if (!messages.length) {
      setError("Chat with the tutor first, then build flashcards from the lesson.");
      return;
    }
    setGenCards(true);
    setError("");
    const r = await api<{ cards?: Flashcard[]; error?: string }>("/api/ai/flashcards", {
      method: "POST",
      body: JSON.stringify({ conversationId: activeId }),
    });
    setGenCards(false);
    if (r.ok && r.data.cards?.length) {
      const next = [...r.data.cards, ...cards].slice(0, 120);
      setCards(next);
      lsSet(FLASHCARD_KEY, next);
      setCardIdx(0);
      setCardFlipped(false);
      setShowCards(true);
    } else {
      setError(r.data.error || "Could not build flashcards — try again.");
    }
  };

  /* ---------- render ---------- */
  const card = cards[cardIdx];

  return (
    <div className="flex-1 flex min-h-0">
      {/* sidebar */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-[#141414]">
        <div className="p-3 border-b border-[#141414]">
          <Button
            onClick={newChat}
            className="w-full bg-white text-black hover:bg-[#e0e0e0]"
            size="sm"
          >
            <Plus className="size-4 mr-1" /> New chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 memphis-scroll">
          <p className="mono-label px-2 py-1">Today</p>
          {conversations.length === 0 && (
            <p className="text-[12px] text-[#555] px-2 py-2">
              Your saved chats appear here.
            </p>
          )}
          {conversations.map((c) => (
            <div key={c.id} className="group flex items-center">
              <button
                onClick={() => setActiveId(c.id)}
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
        <div className="p-3 border-t border-[#141414]">
          <div className="flex items-center justify-between text-[11px] text-[#777]">
            <span className="font-mono">
              {tokensUsed.toLocaleString()} / 6.7k tokens today
            </span>
          </div>
          <div className="h-1 bg-[#141414] rounded-full mt-1.5 overflow-hidden">
            <div
              className="h-full bg-white transition-all"
              style={{ width: `${Math.min(100, (tokensUsed / 6700) * 100)}%` }}
            />
          </div>
        </div>
      </aside>

      {/* main */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-[#141414] px-4 py-2.5 flex items-center gap-2">
          <Sparkles className="size-4 text-white" />
          <h1 className="text-sm font-semibold text-white">Memphis AI</h1>
          <span className="text-[11px] text-[#555] hidden sm:inline">study tutor</span>
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

        {!signedIn ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <Lock className="size-8 text-[#555]" />
            <h2 className="text-base font-semibold text-white">How can I help today?</h2>
            <p className="text-[13px] text-[#8f8f8f] max-w-sm">
              The AI tutor needs a free account. Open the Chat section to register
              (username and password is all it takes), then come back.
            </p>
            <p className="text-[11px] text-[#555] font-mono">
              0 / 6.7k tokens today
            </p>
          </div>
        ) : (
          <>
            {/* messages */}
            <div className="flex-1 overflow-y-auto memphis-scroll">
              <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
                {messages.length === 0 && !sending && (
                  <div className="text-center py-12">
                    <Sparkles className="size-7 mx-auto text-[#555] mb-3" />
                    <h2 className="text-lg text-white font-semibold">
                      How can I help today?
                    </h2>
                    <p className="text-[13px] text-[#777] mt-2">
                      Ask about any subject — math steps, essay feedback, science
                      review, test prep.
                    </p>
                    <div className="mt-6 grid sm:grid-cols-2 gap-2 text-left">
                      {[
                        "Explain the quadratic formula with an example",
                        "Quiz me on cell organelles",
                        "Give feedback on my essay introduction",
                        "Help me plan SAT practice this week",
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
                      className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words ${
                        m.role === "user"
                          ? "bg-white text-black"
                          : "bg-[#0d0d0d] text-[#dcdcdc] border border-[#1a1a1a]"
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {sending && (
                  <div className="flex">
                    <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-xl px-3.5 py-2.5 text-[13px] text-[#777] flex items-center gap-1.5">
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
                    </div>
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
                      maxLength={4000}
                      aria-label="Message the AI tutor"
                      className="bg-[#050505] border-[#1f1f1f] text-white placeholder:text-[#555] focus-visible:ring-white/30 min-h-0 resize-none"
                    />
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[11px] text-[#555] font-mono md:hidden">
                        {tokensUsed.toLocaleString()} / 6.7k tokens
                      </span>
                      <span className="hidden md:inline text-[11px] text-[#555]">
                        Enter to send · Shift+Enter for newline
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
                      placeholder="e.g. I'm in 8th grade algebra — explain step by step and check my work before giving answers."
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
          </>
        )}
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
