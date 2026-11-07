import { Trans, useLingui } from "@lingui/react/macro";
import type { UndoSeconds } from "@rakazo/core";
import { undoSeconds } from "@rakazo/core";
import { Button } from "@rakazo/ui-web";
import { useEffect, useState } from "react";
import { rpc } from "../lib/rpc";

const CHOICES = [0, 10, 30, 60] as const;

/** The undo window. Hidden unless the flag is on. Default is 30 seconds. */
export function UndoPage() {
  const { t } = useLingui();
  const [enabled, setEnabled] = useState(false);
  const [seconds, setSeconds] = useState<UndoSeconds>(30);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void rpc
      .me()
      .then(async (me) => {
        if (!me.sendUndoEnabled) return;
        setEnabled(true);
        const stored = await rpc.sendUndo.get();
        setSeconds(undoSeconds(stored.seconds));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "send_undo_disabled"));
  }, []);

  if (!enabled) return null;
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-6">
      <h1 className="text-heading3 font-medium text-foreground">
        <Trans>Undo send</Trans>
      </h1>
      <div className="flex gap-2">
        {CHOICES.map((choice) => (
          <Button
            key={choice}
            type="button"
            variant={choice === seconds ? "default" : "outline"}
            aria-label={t`${choice} seconds`}
            onClick={() => {
              void rpc.sendUndo
                .update({ seconds: choice })
                .then(() => setSeconds(choice))
                .catch((err: unknown) =>
                  setError(err instanceof Error ? err.message : "send_undo_disabled"),
                );
            }}
          >
            {choice}s
          </Button>
        ))}
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
