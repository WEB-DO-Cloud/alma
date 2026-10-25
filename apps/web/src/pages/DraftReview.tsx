import { Trans, useLingui } from "@lingui/react/macro";
import type {
  DraftDiffSpan,
  DraftStatus,
  ReviewDraft,
  ReviewDraftSummary,
} from "@rakazo/contracts";
import { diffDraftText } from "@rakazo/core";
import { Button, Checkbox, Field, FieldLabel, Input, Textarea } from "@rakazo/ui-web";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { rpc } from "../lib/rpc";

function useStatusLabel() {
  const { t } = useLingui();
  return (status: DraftStatus) => {
    if (status === "generated") return t`Generated`;
    if (status === "in_review") return t`In review`;
    if (status === "approved") return t`Approved`;
    return t`Rejected`;
  };
}

function Highlight({ spans, side }: { spans: DraftDiffSpan[]; side: "original" | "edited" }) {
  return (
    <pre className="min-h-40 whitespace-pre-wrap font-sans text-[14px] leading-6">
      {spans.map((span, index) => {
        if (side === "original" && span.type === "insert") return null;
        if (side === "edited" && span.type === "delete") return null;
        const className =
          span.type === "delete"
            ? "bg-destructive/15 text-destructive line-through"
            : span.type === "insert"
              ? "bg-success/15"
              : undefined;
        return (
          <span key={index} className={className}>
            {span.text}
          </span>
        );
      })}
    </pre>
  );
}

function remainingSeconds(draft: ReviewDraft, now: number): number {
  if (!draft.openedAt) return Math.ceil(draft.requiredReviewMs / 1000);
  const readyAt = Date.parse(draft.openedAt) + draft.requiredReviewMs;
  return Math.max(0, Math.ceil((readyAt - now) / 1000));
}

export function DraftReviewPage() {
  const { draftId } = useParams();
  if (draftId) return <DraftReviewDetail draftId={draftId} />;
  return <DraftList />;
}

function DraftList() {
  const { t } = useLingui();
  const statusLabel = useStatusLabel();
  const [rows, setRows] = useState<ReviewDraftSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [model, setModel] = useState("");
  const [modelVersion, setModelVersion] = useState("");
  const [originalText, setOriginalText] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    rpc.drafts
      .list({})
      .then((list) => {
        if (active) setRows(list);
      })
      .catch(() => {
        if (active) setError(t`Could not load drafts`);
      });
    return () => {
      active = false;
    };
  }, [t]);

  async function record(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const created = await rpc.drafts.create({ title, originalText, model, modelVersion });
      window.location.assign(`/app/drafts/${created.id}`);
    } catch {
      setError(t`Could not record the draft`);
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex h-full max-w-3xl flex-col gap-8 overflow-auto p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl">
          <Trans>Drafts for review</Trans>
        </h1>
        <a href="/app/draft-approvals" className="text-[13px] underline">
          <Trans>Approval log</Trans>
        </a>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <ul className="divide-y divide-border" data-testid="draft-list">
        {(rows ?? []).map((row) => (
          <li key={row.id}>
            <Link to={`/app/drafts/${row.id}`} className="flex items-baseline justify-between py-3">
              <span>{row.title}</span>
              <span className="text-[13px] text-muted-foreground">{statusLabel(row.status)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <form className="space-y-3" onSubmit={(event) => void record(event)}>
        <h2 className="text-[15px]">
          <Trans>Record draft</Trans>
        </h2>
        <Field>
          <FieldLabel>
            <Trans>Title</Trans>
          </FieldLabel>
          <Input
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </Field>
        <Field>
          <FieldLabel>
            <Trans>Model</Trans>
          </FieldLabel>
          <Input
            value={model}
            maxLength={200}
            onChange={(event) => setModel(event.target.value)}
            required
          />
        </Field>
        <Field>
          <FieldLabel>
            <Trans>Model version</Trans>
          </FieldLabel>
          <Input
            value={modelVersion}
            maxLength={120}
            onChange={(event) => setModelVersion(event.target.value)}
            required
          />
        </Field>
        <Field>
          <FieldLabel>
            <Trans>Agent draft</Trans>
          </FieldLabel>
          <Textarea
            value={originalText}
            onChange={(event) => setOriginalText(event.target.value)}
            required
          />
        </Field>
        <Button type="submit" disabled={pending}>
          <Trans>Record draft</Trans>
        </Button>
      </form>
    </main>
  );
}

function DraftReviewDetail({ draftId }: { draftId: string }) {
  const { t } = useLingui();
  const statusLabel = useStatusLabel();
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [edited, setEdited] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    rpc.drafts
      .get({ draftId })
      .then(async (current) => {
        if (!active) return;
        const opened =
          current.canApprove && current.status !== "approved" && current.status !== "rejected"
            ? await rpc.drafts.open({ draftId })
            : current;
        if (!active) return;
        setDraft(opened);
        setEdited(opened.editedText);
      })
      .catch(() => {
        if (active) setError(t`Could not load drafts`);
      });
    return () => {
      active = false;
    };
  }, [draftId, t]);

  useEffect(() => {
    if (!draft?.canApprove || draft.status === "approved" || draft.status === "rejected") return;
    if (edited === draft.editedText) return;
    const handle = setTimeout(() => {
      void rpc.drafts
        .save({ draftId: draft.id, editedText: edited })
        .then((saved) => setDraft(saved))
        .catch(() => setError(t`Could not save the draft`));
    }, 500);
    return () => clearTimeout(handle);
  }, [draft, edited, t]);

  if (!draft) {
    return (
      <main className="p-6">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </main>
    );
  }

  const spans = diffDraftText(draft.originalText, edited);
  const remaining = remainingSeconds(draft, now);
  const finished = draft.status === "approved" || draft.status === "rejected";
  const canSubmit =
    draft.canApprove &&
    !finished &&
    confirmed &&
    remaining === 0 &&
    !pending &&
    Boolean(draft.linkedLawyerId);

  async function approve() {
    if (!draft?.linkedLawyerId || !canSubmit) return;
    setPending(true);
    setError(null);
    try {
      setDraft(
        await rpc.drafts.approve({
          draftId: draft.id,
          lawyerId: draft.linkedLawyerId,
          editedText: edited,
          confirmation: true,
        }),
      );
    } catch {
      setError(t`The minimum review time has not elapsed.`);
    } finally {
      setPending(false);
    }
  }

  async function reject() {
    if (!draft?.linkedLawyerId || pending || finished) return;
    setPending(true);
    setError(null);
    try {
      setDraft(
        await rpc.drafts.reject({
          draftId: draft.id,
          lawyerId: draft.linkedLawyerId,
          editedText: edited,
        }),
      );
    } catch {
      setError(t`Could not save the draft`);
    } finally {
      setPending(false);
    }
  }

  async function download() {
    setError(null);
    try {
      const file = await rpc.drafts.export({ draftId: draft!.id });
      const blob = new Blob([file.html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t`Could not export this draft`);
    }
  }

  async function copyDocument() {
    setError(null);
    try {
      const file = await rpc.drafts.export({ draftId: draft!.id });
      await navigator.clipboard.writeText(file.text);
    } catch {
      setError(t`Could not export this draft`);
    }
  }

  return (
    <main
      className="mx-auto flex h-full max-w-6xl flex-col gap-4 overflow-auto p-6"
      data-testid="draft-review"
    >
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <a href="/app/drafts" className="text-[13px] underline">
            <Trans>Drafts for review</Trans>
          </a>
          <h1 className="text-xl">{draft.title}</h1>
        </div>
        <span className="text-[13px] text-muted-foreground">{statusLabel(draft.status)}</span>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border p-4">
          <h2 className="mb-3 text-[13px] text-muted-foreground">
            <Trans>Agent draft</Trans>
          </h2>
          <Highlight spans={spans} side="original" />
        </section>
        <section className="rounded-xl border border-border p-4">
          <h2 className="mb-3 text-[13px] text-muted-foreground">
            <Trans>Edited version</Trans>
          </h2>
          <Highlight spans={spans} side="edited" />
          <Textarea
            data-testid="draft-editor"
            className="mt-3 min-h-40"
            value={edited}
            disabled={!draft.canApprove || finished}
            onChange={(event) => setEdited(event.target.value)}
          />
        </section>
      </div>
      {draft.canApprove && !finished ? (
        <div className="flex items-start gap-3 text-[14px]">
          <Checkbox
            id="draft-confirmation"
            data-testid="draft-confirmation"
            className="mt-0.5"
            checked={confirmed}
            aria-labelledby="draft-confirmation-label"
            onCheckedChange={(checked) => setConfirmed(checked === true)}
          />
          <span id="draft-confirmation-label">
            He revisado este borrador y asumo la responsabilidad profesional de su contenido
          </span>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {draft.canApprove && !finished ? (
          <>
            <Button
              type="button"
              data-testid="draft-approve"
              disabled={!canSubmit}
              onClick={() => void approve()}
            >
              <Trans>Approve</Trans>
              {remaining > 0 ? ` ${remaining}s` : ""}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => void reject()}
            >
              <Trans>Reject</Trans>
            </Button>
          </>
        ) : null}
        {draft.status === "approved" ? (
          <>
            <Button type="button" onClick={() => void download()}>
              <Trans>Download</Trans>
            </Button>
            <Button type="button" variant="outline" onClick={() => void copyDocument()}>
              <Trans>Copy document</Trans>
            </Button>
          </>
        ) : null}
      </div>
    </main>
  );
}
