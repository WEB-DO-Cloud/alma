import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@rakazo/ui-web";
import { useEffect, useState } from "react";
import { rpc } from "../lib/rpc";

function clock(minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function minutes(value: string): number | null {
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

/** Morning count. In the app and as a push. No mail. */
export function DigestPage() {
  const { t } = useLingui();
  const [enabledFlag, setEnabledFlag] = useState(preview);
  const [on, setOn] = useState(false);
  const [weekly, setWeekly] = useState(true);
  const [time, setTime] = useState("07:30");
  const [issues, setIssues] = useState<
    Array<{
      kind: "daily" | "weekly";
      localDate: string;
      draftCount: number;
      reminderCount: number;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (preview) return;
    void rpc
      .me()
      .then(async (me) => {
        if (!me.digestEnabled) return;
        setEnabledFlag(true);
        const stored = await rpc.digest.get();
        setOn(stored.enabled);
        setWeekly(stored.weekly);
        setTime(clock(stored.minuteOfDay));
        setIssues(stored.issues);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "digest_disabled"));
  }, []);

  if (!enabledFlag) return null;
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-6">
      <h1 className="text-heading3 font-medium text-foreground">
        <Trans>Morning summary</Trans>
      </h1>
      <p className="text-body-sm text-muted-foreground">
        <Trans>In the app and push</Trans>
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant={on ? "default" : "outline"}
          onClick={() => setOn((value) => !value)}
        >
          {on ? <Trans>On</Trans> : <Trans>Off</Trans>}
        </Button>
        <Button
          type="button"
          variant={weekly ? "default" : "outline"}
          onClick={() => setWeekly((value) => !value)}
        >
          <Trans>Monday summary</Trans>
        </Button>
      </div>
      <input
        aria-label={t`Time`}
        className="border-border bg-background w-28 rounded-md border px-3 py-2"
        value={time}
        onChange={(event) => setTime(event.target.value)}
      />
      <Button
        type="button"
        onClick={() => {
          const minuteOfDay = minutes(time);
          if (minuteOfDay === null) {
            setError("digest_disabled");
            return;
          }
          if (preview) {
            setError(null);
            return;
          }
          void rpc.digest
            .update({ enabled: on, weekly, minuteOfDay })
            .then(() => setError(null))
            .catch((err: unknown) =>
              setError(err instanceof Error ? err.message : "digest_disabled"),
            );
        }}
      >
        <Trans>Save</Trans>
      </Button>
      <ul className="flex flex-col gap-2">
        {issues.map((issue) => (
          <li key={`${issue.kind}-${issue.localDate}`}>
            {issue.localDate} · {issue.draftCount} · {issue.reminderCount}
          </li>
        ))}
      </ul>
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
