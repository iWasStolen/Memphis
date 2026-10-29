"use client";

/* ============================================================
   Shared embedded proxy viewport (used by Listen + Watch).
   Renders a site through the Scramjet engine with reload /
   fullscreen / open-in-tab controls and a boot overlay.
   ============================================================ */

import { useEffect, useRef, useState } from "react";
import { useUI } from "@/lib/store";
import { proxiedHref, resetProxy } from "@/lib/scramjet";
import { Button } from "@/components/ui/button";
import { Loader2, Maximize2, Minimize, RotateCw, ExternalLink, ShieldAlert } from "lucide-react";

export function ProxyFrame({
  url,
  title,
  allow = "autoplay; fullscreen; clipboard-write; encrypted-media",
  className = "",
}: {
  url: string;
  title: string;
  allow?: string;
  className?: string;
}) {
  const { proxyState, proxyError, proxyStage, proxyDiag, retryProxy } = useUI();
  const [src, setSrc] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc("");
    if (proxyState === "error") return; /* don't hammer a broken engine */
    proxiedHref(url)
      .then((href) => {
        if (!cancelled) setSrc(href);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [url, reloadKey, proxyState]);

  const toggleFullscreen = async () => {
    if (!boxRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      setFullscreen(false);
    } else {
      await boxRef.current.requestFullscreen().catch(() => {});
      setFullscreen(true);
    }
  };

  return (
    <div ref={boxRef} className={`relative bg-black flex flex-col min-h-0 ${className}`}>
      {/* controls */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[#141414] shrink-0">
        <span className="mono-label !text-[10px] truncate flex-1 pl-1">{title}</span>
        <Button
          variant="ghost"
          size="icon"
          className="text-[#9a9a9a] hover:text-white hover:bg-[#101010] size-7"
          onClick={() => setReloadKey((k) => k + 1)}
          aria-label="Reload"
          title="Reload"
        >
          <RotateCw className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-[#9a9a9a] hover:text-white hover:bg-[#101010] size-7"
          onClick={async () => {
            try {
              const href = await proxiedHref(url);
              window.open(href, "_blank");
            } catch {
              /* engine not ready */
            }
          }}
          aria-label="Open in new tab (proxied)"
          title="Open in new tab (proxied)"
        >
          <ExternalLink className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-[#9a9a9a] hover:text-white hover:bg-[#101010] size-7"
          onClick={toggleFullscreen}
          aria-label="Toggle fullscreen"
          title="Fullscreen"
        >
          {fullscreen ? <Minimize className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </Button>
      </div>

      {/* viewport */}
      <div className="flex-1 min-h-0 relative">
        {src ? (
          <iframe
            key={src + reloadKey}
            src={src}
            className="w-full h-full border-0 bg-black"
            title={title}
            allow={allow}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
            {proxyState === "error" ? (
              <>
                <ShieldAlert className="size-8 text-white" />
                <p className="text-[13px] text-[#8f8f8f] max-w-sm">
                  {proxyStage === "transport" ? "The proxy transport failed" : "The proxy engine failed to start"}
                  : {proxyError}
                </p>
                {proxyDiag && (
                  <p className="text-[11px] text-[#555] font-mono max-w-sm">{proxyDiag}</p>
                )}
                <Button
                  size="sm"
                  onClick={() => {
                    resetProxy();
                    retryProxy();
                  }}
                  className="bg-white text-black hover:bg-[#e0e0e0]"
                >
                  <RotateCw className="size-3.5 mr-2" /> Retry
                </Button>
              </>
            ) : (
              <>
                <Loader2 className="size-6 text-white animate-spin" />
                <p className="text-xs text-[#777] font-mono boot-pulse">
                  connecting through scramjet…
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
