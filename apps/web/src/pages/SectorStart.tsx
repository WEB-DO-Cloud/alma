import { Trans, useLingui } from "@lingui/react/macro";
import { ALMA_WORK_SECTORS, almaLanguage, almaText } from "@rakazo/contracts";
import { Button, Input } from "@rakazo/ui-web";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { rpc } from "../lib/rpc";

/** First question: personal use, then a sector. Skip leaves the assistant unchanged. */
export function SectorStartPage() {
  const { i18n } = useLingui();
  const navigate = useNavigate();
  const language = almaLanguage(i18n.locale);
  const [step, setStep] = useState<"use" | "sector">("use");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function save(use: "personal" | "work" | "skip", sector?: string) {
    if (pending) return;
    setPending(true);
    setError(false);
    try {
      await rpc.onboarding.sector({ use, sector });
      navigate("/onboarding", { replace: true });
    } catch {
      setError(true);
      setPending(false);
    }
  }

  const rows = ALMA_WORK_SECTORS.filter((sector) =>
    almaText(sector.label, language).toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="min-h-full bg-background px-6 py-12" data-testid="sector-start">
      <div className="mx-auto w-full max-w-[560px]">
        {step === "use" ? (
          <>
            <h1 className="text-[32px] font-medium text-foreground">
              <Trans>What do you want ALMA for first?</Trans>
            </h1>
            <div className="mt-8 flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => void save("personal")}
              >
                <Trans>Personal use</Trans>
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setStep("sector")}
              >
                <Trans>Work</Trans>
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => void save("skip")}
              >
                <Trans>Skip</Trans>
              </Button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-[32px] font-medium text-foreground">
              <Trans>What kind of work?</Trans>
            </h1>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="mt-6"
              aria-label={language === "es" ? "Buscar" : "Search"}
            />
            <div className="mt-4 flex flex-col gap-2">
              {rows.map((sector) => (
                <Button
                  key={sector.id}
                  type="button"
                  variant="outline"
                  className="justify-start"
                  disabled={pending}
                  onClick={() => void save("work", sector.id)}
                >
                  {almaText(sector.label, language)}
                </Button>
              ))}
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => void save("skip")}
              >
                <Trans>Skip</Trans>
              </Button>
            </div>
          </>
        )}
        {error ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            <Trans>Could not save</Trans>
          </p>
        ) : null}
      </div>
    </div>
  );
}
