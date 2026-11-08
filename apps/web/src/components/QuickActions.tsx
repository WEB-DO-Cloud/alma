import { Trans } from "@lingui/react/macro";
import { quickActionTarget } from "@rakazo/core";
import { Button } from "@rakazo/ui-web";
import { useEffect, useState } from "react";
import { rpc } from "../lib/rpc";

const preview =
  import.meta.env.DEV &&
  (window.location.pathname.startsWith("/preview/") ||
    new URLSearchParams(window.location.search).get("preview") === "1");

/** Camera, share, and voice using the existing composer. Hidden unless the flag is on. */
export function QuickActions({ onCamera, onVoice }: { onCamera: () => void; onVoice: () => void }) {
  const [shown, setShown] = useState(preview);
  const [phase2a, setPhase2a] = useState(preview);

  useEffect(() => {
    if (preview) return;
    void rpc
      .me()
      .then((me) => {
        if (!me.mobileActionsEnabled) return;
        setShown(true);
        setPhase2a(me.phase2aEnabled === true);
      })
      .catch(() => undefined);
  }, []);

  if (!shown) return null;
  const input = {
    enabled: true,
    phase2aEnabled: phase2a,
    voiceNotesEnabled: true,
    threadId: "current",
  };
  const camera = quickActionTarget({ ...input, name: "camera" });
  const share = quickActionTarget({ ...input, name: "share" });
  const voiceNote = quickActionTarget({ ...input, name: "voice" });
  return (
    <div className="mb-2 flex gap-2">
      {camera ? (
        <Button type="button" variant="outline" onClick={onCamera}>
          <Trans>Camera</Trans>
        </Button>
      ) : null}
      {share ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const text = "ALMA";
            if (navigator.share) void navigator.share({ text, url: window.location.href });
            else void navigator.clipboard.writeText(window.location.href);
          }}
        >
          <Trans>Share</Trans>
        </Button>
      ) : null}
      {voiceNote ? (
        <Button type="button" variant="outline" onClick={onVoice}>
          <Trans>Voice note</Trans>
        </Button>
      ) : null}
    </div>
  );
}
