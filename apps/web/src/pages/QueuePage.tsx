import { Trans, useLingui } from "@lingui/react/macro";
import type { OutboundDraft, WorkContext } from "@rakazo/contracts";
import { queueDraftActions, undoCountdown } from "@rakazo/core";
import { Button } from "@rakazo/ui-web";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { rpc } from "../lib/rpc";

const channels = ["email", "whatsapp", "other"] as const;

/** Approval queue for drafts in one context. Hidden unless Phase 2A is on. */
export function QueuePage() {
  const { t } = useLingui();
  const [actorUserId, setActorUserId] = useState("");
  const [sendUndo, setSendUndo] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [contexts, setContexts] = useState<WorkContext[]>([]);
  const [contextId, setContextId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<OutboundDraft[]>([]);
  const [name, setName] = useState("");
  const [recipient, setRecipient] = useState("");
  const [channel, setChannel] = useState<(typeof channels)[number]>("email");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadContexts() {
    const next = await rpc.phase2a.contexts.list();
    setContexts(next);
    setContextId((current) => current ?? next[0]?.id ?? null);
  }

  useEffect(() => {
    void rpc.me().then((me) => {
      setActorUserId(me.userId);
      setSendUndo(me.sendUndoEnabled === true);
    });
    void loadContexts().catch((err: unknown) => setError(messageOf(err)));
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!contextId) return;
    void rpc.phase2a.drafts
      .list({ contextId })
      .then(setDrafts)
      .catch((err: unknown) => setError(messageOf(err)));
  }, [contextId]);

  const context = contexts.find((item) => item.id === contextId) ?? null;

  async function createContext(kind: "personal" | "work", label: string) {
    const created = await rpc.phase2a.contexts.create({ kind, label });
    setName("");
    await loadContexts();
    setContextId(created.id);
  }

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(messageOf(err));
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 p-6">
      <h1 className="text-heading3 font-medium text-foreground">
        <Trans>Queue</Trans>
      </h1>
      {sendUndo ? (
        <Link className="text-body-sm text-foreground underline" to="/app/undo">
          <Trans>Undo send</Trans>
        </Link>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <input
          aria-label={t`Name`}
          className="border-border bg-background min-w-0 flex-1 rounded-md border px-3 py-2"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        {(["personal", "work"] as const).map((kind) => (
          <Button
            key={kind}
            type="button"
            variant="outline"
            onClick={() => {
              const label = name.trim();
              if (!label) return;
              void run(() => createContext(kind, label));
            }}
          >
            {kind === "personal" ? <Trans>Personal</Trans> : <Trans>Work</Trans>}
          </Button>
        ))}
      </div>
      {contexts.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {contexts.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant={item.id === contextId ? "default" : "outline"}
              onClick={() => setContextId(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      ) : null}
      {context &&
      queueDraftActions({
        role: context.role,
        status: "draft",
        creatorRole: context.role,
        creatorUserId: actorUserId,
        actorUserId,
      }).compose ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!contextId || !recipient.trim() || !body.trim()) return;
            void run(async () => {
              await rpc.phase2a.drafts.create({
                contextId,
                recipient: recipient.trim(),
                channel,
                body,
              });
              setRecipient("");
              setBody("");
              setDrafts(await rpc.phase2a.drafts.list({ contextId }));
            });
          }}
        >
          <h2 className="text-body font-medium text-foreground">
            <Trans>New draft</Trans>
          </h2>
          <input
            aria-label={t`Recipient`}
            className="border-border bg-background rounded-md border px-3 py-2"
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
          />
          <div className="flex gap-2">
            {channels.map((value) => (
              <Button
                key={value}
                type="button"
                variant={value === channel ? "default" : "outline"}
                onClick={() => setChannel(value)}
              >
                {value}
              </Button>
            ))}
          </div>
          <textarea
            aria-label={t`Message`}
            className="border-border bg-background min-h-24 rounded-md border px-3 py-2"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <Button type="submit">
            <Trans>Save</Trans>
          </Button>
        </form>
      ) : null}
      {context && drafts.length === 0 ? (
        <p>
          <Trans>Nothing waiting</Trans>
        </p>
      ) : null}
      <ul className="flex flex-col gap-4">
        {context
          ? drafts.map((draft) => {
              const actions = queueDraftActions({
                role: context.role,
                status: draft.status,
                creatorRole: draft.creatorRole,
                creatorUserId: draft.createdByUserId,
                actorUserId,
              });
              return (
                <li
                  key={draft.id}
                  className="border-border flex flex-col gap-2 rounded-md border p-3"
                >
                  <p>
                    {draft.recipient} · {draft.channel} · {draft.label}
                  </p>
                  <p className="whitespace-pre-wrap">{draft.body}</p>
                  {actions.submit ? (
                    <Button
                      type="button"
                      onClick={() =>
                        void run(async () => {
                          await rpc.phase2a.drafts.submit({ id: draft.id });
                          if (contextId) setDrafts(await rpc.phase2a.drafts.list({ contextId }));
                        })
                      }
                    >
                      <Trans>Submit</Trans>
                    </Button>
                  ) : null}
                  {actions.approve ? (
                    <Button
                      type="button"
                      onClick={() =>
                        void run(async () => {
                          await rpc.phase2a.drafts.approve({ id: draft.id });
                          if (contextId) setDrafts(await rpc.phase2a.drafts.list({ contextId }));
                        })
                      }
                    >
                      <Trans>Approve</Trans>
                    </Button>
                  ) : null}
                  {actions.cancel ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        void run(async () => {
                          await rpc.phase2a.drafts.cancel({ id: draft.id });
                          if (contextId) setDrafts(await rpc.phase2a.drafts.list({ contextId }));
                        })
                      }
                    >
                      {sendUndo && draft.status === "approved" ? (
                        <>
                          <Trans>Undo</Trans>
                          {(() => {
                            const seconds = undoCountdown(draft.dispatchAfter, now);
                            return seconds !== null && seconds > 0 ? ` ${seconds}s` : null;
                          })()}
                        </>
                      ) : (
                        <Trans>Cancel</Trans>
                      )}
                    </Button>
                  ) : null}
                </li>
              );
            })
          : null}
      </ul>
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return "phase2a_missing";
}
