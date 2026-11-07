import { Trans, useLingui } from "@lingui/react/macro";
import type { AlmaChecklist, BillingStatus } from "@rakazo/contracts";
import { almaLanguage, almaSector, almaText } from "@rakazo/contracts";
import { Button } from "@rakazo/ui-web";
import { useEffect, useState } from "react";
import { requestComposerFill } from "../lib/composer-draft";
import { rpc } from "../lib/rpc";

export function TrialBanner({
  status,
  onUpgrade,
}: {
  status: BillingStatus | null;
  onUpgrade: () => void;
}) {
  const trial = status?.almaTrial;
  if (!status?.access || !trial) return null;
  return (
    <div
      data-testid="trial-banner"
      className="pointer-events-auto mx-auto mb-2 flex w-full max-w-xl items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm"
    >
      <p>
        {trial.daysLeft === 1 ? (
          <Trans>1 day left</Trans>
        ) : (
          <Trans>{trial.daysLeft} days left</Trans>
        )}
        {" · "}
        {trial.messagesLeft === 1 ? (
          <Trans>1 message</Trans>
        ) : (
          <Trans>{trial.messagesLeft} messages</Trans>
        )}
      </p>
      <Button type="button" size="sm" variant="outline" onClick={onUpgrade}>
        <Trans>Upgrade</Trans>
      </Button>
    </div>
  );
}

export function PlanClarityCopy({ status }: { status: BillingStatus }) {
  const { i18n } = useLingui();
  if (!status.planClarity || !status.byokPriceCents) return null;
  const locale = i18n.locale || "en";
  const price = new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(
    status.byokPriceCents / 100,
  );
  const promo = status.byokPromo;
  return (
    <div data-testid="plan-clarity" className="flex flex-col gap-1 text-sm text-muted-foreground">
      {status.almaTrial && !status.access ? (
        <p>
          <Trans>The trial ended.</Trans>
        </p>
      ) : null}
      {promo ? (
        <>
          <p>
            <Trans>Billed in US dollars.</Trans>
          </p>
          <p>
            <Trans>After that, the plan renews at {price}/month until you cancel.</Trans>
          </p>
        </>
      ) : (
        <>
          <p>
            <Trans>{price}/month, billed in US dollars.</Trans>
          </p>
          <p>
            <Trans>The plan renews monthly until you cancel.</Trans>
          </p>
        </>
      )}
      <p>
        <Trans>Cancel in the billing portal. Access lasts through the period already paid.</Trans>
      </p>
    </div>
  );
}

function StepLabel({ id }: { id: AlmaChecklist["steps"][number]["id"] }) {
  if (id === "assistant") return <Trans>Assistant</Trans>;
  if (id === "calendar") return <Trans>Calendar</Trans>;
  if (id === "email") return <Trans>Email</Trans>;
  if (id === "file") return <Trans>First file</Trans>;
  return <Trans>First task</Trans>;
}

export function SetupChecklist({
  checklist,
  onOpen,
  onHide,
}: {
  checklist: AlmaChecklist | null;
  onOpen: (id: AlmaChecklist["steps"][number]["id"]) => void;
  onHide: () => void;
}) {
  if (!checklist?.visible) return null;
  return (
    <section
      data-testid="setup-checklist"
      className="pointer-events-auto mx-auto mb-2 w-full max-w-xl rounded-lg border border-border bg-card px-3 py-2 text-sm"
    >
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-medium">
          <Trans>Setup</Trans>
        </h2>
        <Button type="button" size="sm" variant="ghost" onClick={onHide}>
          <Trans>Hide</Trans>
        </Button>
      </div>
      <ul className="flex flex-col">
        {checklist.steps.map((step) => (
          <li key={step.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between py-1 text-left"
              onClick={() => onOpen(step.id)}
            >
              <span>
                <StepLabel id={step.id} />
              </span>
              <span className="text-muted-foreground">
                {step.done ? <Trans>Done</Trans> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StarterWorkspace({
  sectorId,
  locale,
  empty,
  onConnect,
}: {
  sectorId: string | null;
  locale: string | null | undefined;
  empty: boolean;
  onConnect: () => void;
}) {
  const sector = almaSector(sectorId);
  if (!empty || !sector) return null;
  const language = almaLanguage(locale);
  return (
    <div
      data-testid="starter-workspace"
      className="pointer-events-auto mx-auto mb-3 w-full max-w-xl text-sm"
    >
      <p className="text-muted-foreground">
        <Trans>Nothing due today.</Trans>
      </p>
      <p className="text-muted-foreground">
        <Trans>No files yet.</Trans>
      </p>
      <button type="button" className="text-muted-foreground underline" onClick={onConnect}>
        <Trans>Calendar and email connect in Settings. They are not connected.</Trans>
      </button>
      <div className="mt-2 flex flex-col gap-1">
        {sector.tasks.map((task) => (
          <Button
            key={task.id}
            type="button"
            variant="outline"
            className="justify-start"
            onClick={() => requestComposerFill(almaText(task.prompt, language))}
          >
            {almaText(task.title, language)}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function useChecklist(enabled: boolean) {
  const [checklist, setChecklist] = useState<AlmaChecklist | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = () => {
      void rpc.onboarding
        .checklist()
        .then((next) => {
          if (active) setChecklist(next);
        })
        .catch(() => undefined);
    };
    load();
    const onReopen = () => load();
    window.addEventListener("alma-checklist", onReopen);
    return () => {
      active = false;
      window.removeEventListener("alma-checklist", onReopen);
    };
  }, [enabled]);
  return checklist;
}
