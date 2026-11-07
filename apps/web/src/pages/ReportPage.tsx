import { Trans } from "@lingui/react/macro";
import { HOURS_METHOD, renderReportPdf } from "@rakazo/core";
import { Button } from "@rakazo/ui-web";
import { useEffect, useState } from "react";
import { rpc } from "../lib/rpc";

type Report = Awaited<ReturnType<typeof rpc.monthlyReport.get>>;

function Lines({ report }: { report: Report }) {
  return (
    <ul className="flex flex-col gap-1">
      {report.lines.map((line) => (
        <li key={line.key}>
          {line.label}: {line.value}
        </li>
      ))}
      {report.practice ? (
        <li>
          <Trans>Practice</Trans>: {report.practice}
        </li>
      ) : null}
      <li className="text-body-sm text-muted-foreground">{HOURS_METHOD}</li>
    </ul>
  );
}

/** This month for the signed-in user, their clients, and an admin total. */
export function ReportPage() {
  const [enabled, setEnabled] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [mine, setMine] = useState<Report | null>(null);
  const [all, setAll] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void rpc
      .me()
      .then(async (me) => {
        if (!me.monthlyReportEnabled) return;
        setEnabled(true);
        setAdmin(me.isAdmin === true);
        setMine(await rpc.monthlyReport.get({}));
        if (me.isAdmin) setAll(await rpc.monthlyReport.admin({}));
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "monthly_report_disabled"),
      );
  }, []);

  if (!enabled || !mine) return error ? <p role="alert">{error}</p> : null;

  function download(report: Report, name: string) {
    const bytes = renderReportPdf({
      title: "This month",
      lines: report.lines,
      practice: report.practice,
      method: HOURS_METHOD,
    });
    const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 p-6">
      <h1 className="text-heading3 font-medium text-foreground">
        <Trans>This month</Trans>
      </h1>
      <Lines report={mine} />
      <Button type="button" onClick={() => download(mine, "this-month.pdf")}>
        <Trans>Download PDF</Trans>
      </Button>
      {mine.clients.map((client) => (
        <section key={client.label} className="flex flex-col gap-1">
          <h2 className="text-body font-medium text-foreground">{client.label}</h2>
          <ul>
            {client.lines.map((line) => (
              <li key={line.key}>
                {line.label}: {line.value}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {admin && all ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-body font-medium text-foreground">
            <Trans>All customers</Trans>
          </h2>
          <Lines report={all} />
        </section>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
