"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useUI, api } from "@/lib/store";
import { toast } from "sonner";
import { Flag, Loader2 } from "lucide-react";

export function ReportModal() {
  const { modal, closeModal, reportTarget, setReportTarget } = useUI();
  const [note, setNote] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const open = modal === "report";

  useEffect(() => {
    if (open) setNote("");
  }, [open, reportTarget]);

  const submit = async () => {
    if (!reportTarget) return;
    setBusy(true);
    const res = await api<{ ok: boolean }>("/api/reports", {
      method: "POST",
      body: JSON.stringify({
        kind: reportTarget.kind,
        target: reportTarget.target + (contact ? ` (from: ${contact})` : ""),
        note,
      }),
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Report filed. Thank you — we will take a look.");
      setReportTarget(null);
      closeModal();
    } else {
      toast.error("Could not file the report. Try again in a minute.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
      <DialogContent className="bg-[#050505] border-[#1f1f1f] text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Flag className="size-4" />
            Report a problem
          </DialogTitle>
          <DialogDescription className="text-xs text-[#7a7a7a]">
            {reportTarget
              ? `Reporting: ${reportTarget.target}`
              : "Tell us what is broken."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mono-label block mb-1.5" htmlFor="report-note">
              What happened?
            </label>
            <Textarea
              id="report-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Describe the issue — what did you click, what went wrong?"
              className="bg-[#050505] border-[#262626] min-h-24 text-sm"
            />
          </div>
          <div>
            <label className="mono-label block mb-1.5" htmlFor="report-contact">
              Contact (optional)
            </label>
            <Input
              id="report-contact"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="How can we reach you?"
              className="bg-[#050505] border-[#262626] text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-[#8f8f8f] hover:text-white"
              onClick={closeModal}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={busy || note.trim().length < 3}
              onClick={submit}
              className="bg-white text-black hover:bg-[#e0e0e0]"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Send report"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
