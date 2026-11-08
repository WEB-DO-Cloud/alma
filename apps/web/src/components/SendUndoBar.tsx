import { Trans } from "@lingui/react/macro";
import { undoCountdown } from "@rakazo/core";
import { Button } from "@rakazo/ui-web";
import { useEffect, useState } from "react";
import { rpc } from "../lib/rpc";

type Row = { id: string; contextId: string; dispatchAfter: string | null };

/** Approved sends sitting in the open chat. Hidden unless the undo flag is on. */
export function SendUndoBar() {
  const [rows, setRows] = useState<Row[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let stop = false;
    async function load() {
      const me = await rpc.me();
      if (!me.sendUndoEnabled) return;
      if (!stop) setEnabled(true);
      const contexts = await rpc.phase2a.contexts.list();
      const drafts = (
        await Promise.all(
          contexts.map((context) => rpc.phase2a.drafts.list({ contextId: context.id })),
        )
      ).flat();
      if (stop) return;
      setRows(
        drafts
          .filter((draft) => draft.status === "approved")
          .map((draft) => ({
            id: draft.id,
            contextId: draft.contextId,
            dispatchAfter: draft.dispatchAfter,
          })),
      );
    }
    void load().catch(() => undefined);
    const timer = window.setInterval(() => {
      setNow(new Date());
      void load().catch(() => undefined);
    }, 1000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!enabled || rows.length === 0) return null;
  return (
    <div className="mb-2 flex flex-col gap-1">
      {rows.map((row) => {
        const seconds = undoCountdown(row.dispatchAfter, now);
        return (
          <div key={row.id} className="flex items-center justify-between gap-2">
            <p className="text-body-sm text-muted-foreground">
              <Trans>Not sent</Trans>
              {seconds !== null && seconds > 0 ? ` ${seconds}s` : null}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void rpc.phase2a.drafts.cancel({ id: row.id }).then(() => {
                  setRows((current) => current.filter((item) => item.id !== row.id));
                });
              }}
            >
              <Trans>Undo</Trans>
            </Button>
          </div>
        );
      })}
    </div>
  );
}
