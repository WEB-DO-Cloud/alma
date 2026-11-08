import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@rakazo/ui-web";
import { useEffect, useState } from "react";
import { rpc } from "../lib/rpc";

type Channel = "push" | "in_app" | "both";

function clock(minute: number | null): string {
  if (minute === null) return "";
  const hour = Math.floor(minute / 60);
  const rest = minute % 60;
  return `${String(hour).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function minutes(value: string): number | null {
  if (!value.trim()) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

const preview =
  import.meta.env.DEV &&
  (window.location.pathname.startsWith("/preview/") ||
    new URLSearchParams(window.location.search).get("preview") === "1");

/** Quiet hours and where alerts go. Hidden unless the flag is on. */
export function QuietHoursPage() {
  const { t } = useLingui();
  const [shown, setShown] = useState(preview);
  const [channel, setChannel] = useState<Channel>("both");
  const [start, setStart] = useState(preview ? "22:00" : "");
  const [end, setEnd] = useState(preview ? "07:00" : "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (preview) return;
    void rpc
      .me()
      .then(async (me) => {
        if (!me.notifyPolicyEnabled) return;
        setShown(true);
        const stored = await rpc.notifyPolicy.get();
        setChannel(stored.channel);
        setStart(clock(stored.quietStartMinute));
        setEnd(clock(stored.quietEndMinute));
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "notify_policy_disabled"),
      );
  }, []);

  if (!shown) return error ? <p role="alert">{error}</p> : null;
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-6">
      <h1 className="text-heading3 font-medium text-foreground">
        <Trans>Quiet hours</Trans>
      </h1>
      <div className="flex gap-2">
        <input
          aria-label={t`Start`}
          className="border-border bg-background w-28 rounded-md border px-3 py-2"
          value={start}
          onChange={(event) => setStart(event.target.value)}
        />
        <input
          aria-label={t`End`}
          className="border-border bg-background w-28 rounded-md border px-3 py-2"
          value={end}
          onChange={(event) => setEnd(event.target.value)}
        />
      </div>
      <div className="flex gap-2">
        {(
          [
            ["push", "Push"],
            ["in_app", "In the app"],
            ["both", "Both"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            variant={channel === value ? "default" : "outline"}
            onClick={() => setChannel(value)}
          >
            {label === "Push" ? <Trans>Push</Trans> : null}
            {label === "In the app" ? <Trans>In the app</Trans> : null}
            {label === "Both" ? <Trans>Both</Trans> : null}
          </Button>
        ))}
      </div>
      <Button
        type="button"
        onClick={() => {
          const quietStartMinute = minutes(start);
          const quietEndMinute = minutes(end);
          if ((quietStartMinute === null) !== (quietEndMinute === null)) {
            setError("notify_policy_quiet");
            return;
          }
          if (preview) return;
          void rpc.notifyPolicy
            .update({ channel, quietStartMinute, quietEndMinute })
            .then(() => setError(null))
            .catch((err: unknown) =>
              setError(err instanceof Error ? err.message : "notify_policy_disabled"),
            );
        }}
      >
        <Trans>Save</Trans>
      </Button>
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
