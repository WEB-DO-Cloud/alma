import { Trans, useLingui } from "@lingui/react/macro";
import type { DraftApprovalLogEntry } from "@rakazo/contracts";
import { Button, Field, FieldLabel, Input } from "@rakazo/ui-web";
import { type FormEvent, useState } from "react";
import { rpc } from "../lib/rpc";

export function DraftApprovalLogPage() {
  const { t } = useLingui();
  const [rows, setRows] = useState<DraftApprovalLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lawyerId, setLawyerId] = useState("");
  const [draftId, setDraftId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [action, setAction] = useState<"" | "approved" | "rejected">("approved");

  function filter() {
    const fromIso = from ? new Date(`${from}T00:00:00.000Z`).toISOString() : undefined;
    const toIso = to ? new Date(`${to}T23:59:59.999Z`).toISOString() : undefined;
    return {
      ...(lawyerId.trim() ? { lawyerId: lawyerId.trim() } : {}),
      ...(draftId.trim() ? { draftId: draftId.trim() } : {}),
      ...(action ? { action } : {}),
      ...(fromIso ? { from: fromIso } : {}),
      ...(toIso ? { to: toIso } : {}),
    };
  }

  async function load(event?: FormEvent) {
    event?.preventDefault();
    setError(null);
    try {
      setRows(await rpc.draftApprovals.list(filter()));
    } catch {
      setError(t`Could not load the approval log`);
    }
  }

  async function download() {
    setError(null);
    try {
      const file = await rpc.draftApprovals.exportCsv(filter());
      const blob = new Blob([file.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "approval-log.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t`Could not export the approval log`);
    }
  }

  return (
    <main
      className="mx-auto flex h-full max-w-6xl flex-col gap-4 overflow-auto p-6"
      data-testid="draft-approval-log"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl">
          <Trans>Approval log</Trans>
        </h1>
        <a href="/app/drafts" className="text-[13px] underline">
          <Trans>Drafts for review</Trans>
        </a>
      </div>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => void load(event)}>
        <Field>
          <FieldLabel htmlFor="approval-lawyer">
            <Trans>Lawyer</Trans>
          </FieldLabel>
          <Input
            id="approval-lawyer"
            value={lawyerId}
            onChange={(event) => setLawyerId(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="approval-draft">
            <Trans>Draft</Trans>
          </FieldLabel>
          <Input
            id="approval-draft"
            value={draftId}
            onChange={(event) => setDraftId(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="approval-from">
            <Trans>From</Trans>
          </FieldLabel>
          <Input
            id="approval-from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="approval-to">
            <Trans>To</Trans>
          </FieldLabel>
          <Input
            id="approval-to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="approval-action">
            <Trans>Status</Trans>
          </FieldLabel>
          <select
            id="approval-action"
            className="h-9 rounded-md border border-border bg-background px-2"
            value={action}
            onChange={(event) => setAction(event.target.value as "" | "approved" | "rejected")}
          >
            <option value="approved">{t`Approved`}</option>
            <option value="rejected">{t`Rejected`}</option>
            <option value="">{t`All`}</option>
          </select>
        </Field>
        <Button type="submit">
          <Trans>Filter</Trans>
        </Button>
        <Button type="button" variant="outline" onClick={() => void download()}>
          <Trans>Export CSV</Trans>
        </Button>
      </form>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="py-2 pr-3">
              <Trans>Draft</Trans>
            </th>
            <th className="py-2 pr-3">
              <Trans>Lawyer</Trans>
            </th>
            <th className="py-2 pr-3">CARD</th>
            <th className="py-2 pr-3">
              <Trans>Approved</Trans>
            </th>
            <th className="py-2 pr-3">
              <Trans>Model</Trans>
            </th>
          </tr>
        </thead>
        <tbody>
          {(rows ?? []).map((row) => (
            <tr key={row.id} className="border-b border-border">
              <td className="py-2 pr-3">{row.draftId}</td>
              <td className="py-2 pr-3">{row.approverName}</td>
              <td className="py-2 pr-3">{row.cardNumber}</td>
              <td className="py-2 pr-3">{row.approvedAt ?? row.createdAt}</td>
              <td className="py-2 pr-3">
                {row.model} {row.modelVersion}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
