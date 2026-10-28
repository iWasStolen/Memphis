"use client";

import { useUI } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Gamepad2,
  Boxes,
  MessagesSquare,
  Sparkles,
  Music4,
  Clapperboard,
  Globe,
  Sigma,
  BookOpen,
  FlaskConical,
  Landmark,
  Languages,
  GraduationCap,
  Repeat,
  Accessibility,
} from "lucide-react";

const SUBJECTS = [
  {
    icon: Sigma,
    name: "Mathematics",
    body: "From counting and number sense through pre-algebra, geometry, trigonometry and statistics, up to AP Calculus and beyond. Every skill is mapped to the Common Core State Standards, with diagnostic placement, adaptive question difficulty and spaced review that revisits skills right before you would forget them.",
  },
  {
    icon: BookOpen,
    name: "English Language Arts",
    body: "Phonemic awareness and early literacy for the youngest learners, through reading comprehension, vocabulary acquisition, grammar and mechanics, into essay structure, rhetoric, citing evidence and literary analysis at the high school level.",
  },
  {
    icon: FlaskConical,
    name: "Science",
    body: "Elementary science practices and phenomena-based units, middle-school physical, life and earth science, and high school Biology, Chemistry, Physics and Environmental Science aligned to the Next Generation Science Standards.",
  },
  {
    icon: Landmark,
    name: "Social Studies",
    body: "United States History, World History, Civics and Government, Geography and Economics. Practice sets emphasize sourcing, contextualization, argumentation and document analysis rather than rote recall.",
  },
  {
    icon: Languages,
    name: "World Languages",
    body: "Vocabulary and grammar practice for Spanish, French, German, Italian, Portuguese, Mandarin Chinese, Japanese, Korean, Russian, Arabic and Hindi, plus structured ESL skill tracks from beginner to advanced.",
  },
  {
    icon: GraduationCap,
    name: "Test Preparation",
    body: "Timed practice for the SAT and ACT with score prediction, AP exam review by unit, and certification preparation for language proficiency exams including speaking and listening drills.",
  },
];

const QUICK = [
  { icon: Gamepad2, label: "Play", desc: "2,700+ practice games", view: "play" as const },
  { icon: Boxes, label: "Apps", desc: "Study tools", view: "apps" as const },
  { icon: MessagesSquare, label: "Chat", desc: "Study groups", view: "chat" as const },
  { icon: Sparkles, label: "AI", desc: "AI tutor", view: "ai" as const },
  { icon: Music4, label: "Listen", desc: "Focus music", view: "listen" as const },
  { icon: Clapperboard, label: "Watch", desc: "Video library", view: "watch" as const },
  { icon: Globe, label: "Browse", desc: "Web browser", view: "browse" as const },
];

export default function HomeView() {
  const { setView } = useUI();
  return (
    <div className="flex-1">
      {/* hero */}
      <section className="border-b border-[#141414]">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:py-20 text-center">
          <p className="mono-label mb-4">Standards-aligned practice · K–12</p>
          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-white leading-tight">
            Study Portal
          </h1>
          <p className="mt-5 text-sm sm:text-base text-[#9a9a9a] max-w-2xl mx-auto leading-relaxed">
            A free practice library for students, teachers and families. Every
            skill is mapped to the Common Core State Standards, the Next
            Generation Science Standards, or the relevant state framework —
            with diagnostic placement, spaced review and printable progress
            reports.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              onClick={() => setView("play")}
              className="bg-white text-black hover:bg-[#e0e0e0]"
            >
              <Gamepad2 className="size-4 mr-2" />
              Open practice games
            </Button>
            <Button
              variant="outline"
              onClick={() => setView("ai")}
              className="border-[#2a2a2a] text-white hover:bg-[#101010] hover:border-[#3d3d3d]"
            >
              <Sparkles className="size-4 mr-2" />
              Launch AI tutor
            </Button>
          </div>
        </div>
      </section>

      {/* quick links */}
      <section aria-label="Sections" className="border-b border-[#141414]">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
            {QUICK.map((q) => (
              <button
                key={q.label}
                onClick={() => setView(q.view)}
                className="group flex flex-col items-start gap-2 rounded-lg border border-[#1a1a1a] bg-[#080808] p-3.5 text-left transition-colors hover:border-[#333] hover:bg-[#0d0d0d]"
              >
                <q.icon className="size-4.5 text-[#8f8f8f] group-hover:text-white transition-colors" />
                <div>
                  <div className="text-sm text-white font-medium">{q.label}</div>
                  <div className="text-[11px] text-[#666]">{q.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* subjects */}
      <section className="border-b border-[#141414]">
        <div className="mx-auto max-w-5xl px-4 py-12">
          <h2 className="text-lg font-semibold text-white mb-6">
            What&apos;s inside
          </h2>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-8">
            {SUBJECTS.map((s) => (
              <article key={s.name}>
                <div className="flex items-center gap-2.5 mb-2.5">
                  <s.icon className="size-4 text-white" />
                  <h3 className="text-sm font-semibold text-white">{s.name}</h3>
                </div>
                <p className="text-[13px] text-[#8f8f8f] leading-relaxed">
                  {s.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* how practice works */}
      <section className="border-b border-[#141414]">
        <div className="mx-auto max-w-5xl px-4 py-12">
          <h2 className="text-lg font-semibold text-white mb-6">
            How practice works
          </h2>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                n: "01",
                t: "Diagnostic placement",
                d: "A short placement check locates each learner's current level within a strand, so practice starts where it is actually needed instead of at page one.",
              },
              {
                n: "02",
                t: "Adaptive questions",
                d: "Item difficulty adjusts to accuracy in real time, keeping learners in the productive zone between bored and overwhelmed.",
              },
              {
                n: "03",
                t: "Spaced review",
                d: "Skills resurface on a spaced schedule driven by recall performance, converting short-term familiarity into durable retention.",
              },
              {
                n: "04",
                t: "Progress reports",
                d: "Teachers and families can view and print standards-mapped progress reports that show growth over time, not just a raw score.",
              },
            ].map((step) => (
              <li key={step.n}>
                <div className="font-mono text-[11px] text-[#555] mb-1.5">
                  {step.n}
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Repeat className="size-3.5 text-[#8f8f8f]" />
                  <h3 className="text-sm font-semibold text-white">{step.t}</h3>
                </div>
                <p className="text-[13px] text-[#8f8f8f] leading-relaxed">
                  {step.d}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* accessibility */}
      <section>
        <div className="mx-auto max-w-5xl px-4 py-12">
          <div className="flex items-center gap-2.5 mb-4">
            <Accessibility className="size-4 text-white" />
            <h2 className="text-lg font-semibold text-white">Accessibility</h2>
          </div>
          <p className="text-[13px] text-[#8f8f8f] leading-relaxed max-w-3xl">
            The portal is built to be usable by everyone: full keyboard
            navigation with visible focus indicators, screen-reader labels on
            every control, adjustable text size and typeface, a high-contrast
            monochrome display, reduced-motion support, and extended-time
            options for timed practice. If something is hard to use, report it
            from the footer and we will fix it.
          </p>
        </div>
      </section>
    </div>
  );
}
