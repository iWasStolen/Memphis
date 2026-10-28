"use client";

import { useUI } from "@/lib/store";
import { Button } from "@/components/ui/button";

export function Footer() {
  const { openModal, setView } = useUI();
  return (
    <footer className="mt-auto border-t border-[#141414] bg-black">
      <div className="mx-auto max-w-[1600px] px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <p className="text-[11px] text-[#666] leading-relaxed max-w-xl">
          Memphis unBLACKed — 2,700+ games, 50 apps, Spotify, YouTube and
          unlimited GLM AI, on a Scramjet proxy (epoxy / libcurl over a
          self-hosted wisp relay). Provided as-is; use responsibly and follow
          your network&apos;s rules.
        </p>
        <nav
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#8f8f8f]"
          aria-label="Footer"
        >
          <button className="u-link hover:text-white" onClick={() => openModal("legal-tos")}>
            Terms
          </button>
          <button className="u-link hover:text-white" onClick={() => openModal("legal-privacy")}>
            Privacy
          </button>
          <button className="u-link hover:text-white" onClick={() => openModal("legal-dmca")}>
            DMCA
          </button>
          <button className="u-link hover:text-white" onClick={() => openModal("credits")}>
            Credits
          </button>
          <button className="u-link hover:text-white" onClick={() => setView("browse")}>
            Proxy status
          </button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[11px] border-[#222] text-[#8f8f8f] hover:text-white hover:border-[#3a3a3a]"
            onClick={() => useUI.getState().setReportTarget({ kind: "other", target: "General feedback" })}
          >
            Report an issue
          </Button>
        </nav>
      </div>
    </footer>
  );
}
