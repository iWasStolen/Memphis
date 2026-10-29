"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUI } from "@/lib/store";
import { ScrollArea } from "@/components/ui/scroll-area";

function LegalDialog({
  open,
  onOpenChange,
  title,
  desc,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#050505] border-[#1f1f1f] text-white max-w-lg max-h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b border-[#141414]">
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="text-xs text-[#7a7a7a]">
            {desc}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-4 text-[13px] text-[#c9c9c9] space-y-4 leading-relaxed [&_h3]:text-white [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2">
            {children}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export function LegalModals() {
  const { modal, closeModal } = useUI();
  return (
    <>
      <LegalDialog
        open={modal === "legal-tos"}
        onOpenChange={(o) => !o && closeModal()}
        title="Terms of Service"
        desc="Last updated: October 2026"
      >
        <h3>1. Acceptance</h3>
        <p>
          By using Memphis unBLACKed you agree to these terms. Memphis is
          provided as-is for personal, educational and entertainment purposes.
          If you do not agree, discontinue use.
        </p>
        <h3>2. Accounts</h3>
        <p>
          You are responsible for your account credentials and recovery code.
          Accounts found abusing the service — including spam, harassment, or
          attempts to attack the infrastructure — may be muted, banned or
          removed.
        </p>
        <h3>3. Acceptable use</h3>
        <p>
          The proxy is provided for accessing information. You may not use it
          for unlawful activity, to bypass paywalls or logins you are not
          entitled to, to attack or scan networks, or to distribute malware.
          Private and internal network addresses are blocked.
        </p>
        <h3>4. No warranty</h3>
        <p>
          The service is offered without warranty of any kind. Availability,
          compatibility and fitness for a particular purpose are not
          guaranteed. Some websites may not function through the proxy.
        </p>
        <h3>5. Changes</h3>
        <p>
          These terms may be updated at any time. Continued use after changes
          constitutes acceptance of the new terms.
        </p>
      </LegalDialog>

      <LegalDialog
        open={modal === "legal-privacy"}
        onOpenChange={(o) => !o && closeModal()}
        title="Privacy Policy"
        desc="What Memphis stores and why"
      >
        <h3>Local storage</h3>
        <p>
          Preferences, favorites, history, playlists and saved items are stored
          in your browser only. They never leave your device unless you file a
          report.
        </p>
        <h3>Accounts</h3>
        <p>
          If you create a chat account we store your username, a salted
          password hash, an optional recovery-code hash and your profile
          fields. Passwords are never stored in plain text and cannot be read
          by us.
        </p>
        <h3>Proxy traffic</h3>
        <p>
          Web requests made through Browse are relayed by our server. We keep
          no permanent logs of proxied destinations. Site cookies are held in
          a short-lived in-memory jar and expire automatically.
        </p>
        <h3>Reports</h3>
        <p>
          Reports you file are stored with their content and optional contact
          so we can act on them.
        </p>
        <h3>Deletion</h3>
        <p>
          You can delete your account (and all its messages) at any time from
          Chat account settings. Local data can be cleared from Settings.
        </p>
      </LegalDialog>

      <LegalDialog
        open={modal === "legal-dmca"}
        onOpenChange={(o) => !o && closeModal()}
        title="DMCA / Copyright"
        desc="Takedown policy"
      >
        <p>
          Memphis unBLACKed does not host or store third-party games, apps,
          video or music. The Play section links to and embeds games from
          third-party sites, the Apps / Listen / Watch sections open the real
          services through a proxy, and the Browse section is a general-purpose
          web proxy. No copies are made or distributed by this site.
        </p>
        <p>
          If you believe material accessible through the proxy infringes your
          copyright, file a report via the Report tool with details. We will
          respond to properly formed notices.
        </p>
      </LegalDialog>

      <LegalDialog
        open={modal === "credits"}
        onOpenChange={(o) => !o && closeModal()}
        title="Credits"
        desc="Built with"
      >
        <p>
          Memphis unBLACKed is built with Next.js, React, TypeScript, Tailwind
          CSS, shadcn/ui, Radix UI, Zustand, Prisma, Socket.IO, Lucide icons,
          the Z.ai SDK and Mercury Workshop's Scramjet proxy. The built-in
          arcade games were written for this project; embedded third-party
          games and apps belong to their respective authors and are loaded
          from their official pages. This project is a fan-made,
          non-commercial recreation and is not affiliated with the original
          site or any linked service.
        </p>
      </LegalDialog>
    </>
  );
}
