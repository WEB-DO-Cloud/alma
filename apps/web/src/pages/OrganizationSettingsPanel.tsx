import { Trans, useLingui } from "@lingui/react/macro";
import type { OrganizationSettings } from "@rakazo/contracts";
import { formatRnc, OrganizationSettingsUpdateSchema } from "@rakazo/contracts";
import { Button, Field, FieldLabel, Input, Switch, Textarea } from "@rakazo/ui-web";
import { useEffect, useId, useState } from "react";
import { SettingsGroup } from "../components/SettingsRows";
import { rpc } from "../lib/rpc";

type DraftLawyer = {
  key: string;
  id?: string;
  name: string;
  cardNumber: string;
  email: string;
  mayApproveDrafts: boolean;
};

type Draft = {
  legalName: string;
  tradeName: string;
  rnc: string;
  addressLine: string;
  cityProvince: string;
  phone: string;
  email: string;
  website: string;
  bankName: string;
  bankAccount: string;
  invoiceFooter: string;
  accentColor: string;
  minimumReviewSeconds: number;
  lawyers: DraftLawyer[];
  logo: OrganizationSettings["logo"];
};

function draftFrom(settings: OrganizationSettings): Draft {
  return {
    legalName: settings.legalName,
    tradeName: settings.tradeName,
    rnc: formatRnc(settings.rnc),
    addressLine: settings.addressLine,
    cityProvince: settings.cityProvince,
    phone: settings.phone,
    email: settings.email,
    website: settings.website,
    bankName: settings.bankName,
    bankAccount: settings.bankAccount,
    invoiceFooter: settings.invoiceFooter,
    accentColor: settings.accentColor ?? "",
    minimumReviewSeconds: settings.minimumReviewSeconds ?? 60,
    logo: settings.logo,
    lawyers: settings.lawyers.map((lawyer) => ({ ...lawyer, key: lawyer.id })),
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.byteLength; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function logoMime(file: File): "image/png" | "image/jpeg" | "image/svg+xml" | null {
  if (file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/svg+xml") {
    return file.type;
  }
  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".svg")) return "image/svg+xml";
  return null;
}

export function OrganizationSettingsPanel() {
  const { t } = useLingui();
  const issueText = (path: ReadonlyArray<PropertyKey>) => {
    const key = path[0];
    if (key === "rnc") return t`RNC must be 9 digits (company) or 11 digits (cédula).`;
    if (key === "website") return t`Website must start with http:// or https://.`;
    if (key === "phone") return t`Enter a phone number.`;
    if (key === "email") return t`Enter an email address.`;
    if (key === "accentColor") return t`Use a color like #1F4B3A.`;
    if (key === "lawyers") return t`Check the responsible lawyers.`;
    return t`Could not save organization settings`;
  };
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const baseId = useId();

  useEffect(() => {
    let active = true;
    rpc.organization
      .get()
      .then((settings) => {
        if (active) setDraft(draftFrom(settings));
      })
      .catch(() => {
        if (active) setError(t`Could not load organization settings`);
      });
    return () => {
      active = false;
    };
  }, [t]);

  function patch(partial: Partial<Draft>) {
    setSaved(false);
    setDraft((current) => (current ? { ...current, ...partial } : current));
  }

  function patchLawyer(key: string, partial: Partial<DraftLawyer>) {
    setSaved(false);
    setDraft((current) =>
      current
        ? {
            ...current,
            lawyers: current.lawyers.map((lawyer) =>
              lawyer.key === key ? { ...lawyer, ...partial } : lawyer,
            ),
          }
        : current,
    );
  }

  async function save() {
    if (!draft || pending) return;
    const body = {
      legalName: draft.legalName,
      tradeName: draft.tradeName,
      rnc: draft.rnc,
      addressLine: draft.addressLine,
      cityProvince: draft.cityProvince,
      phone: draft.phone,
      email: draft.email,
      website: draft.website,
      bankName: draft.bankName,
      bankAccount: draft.bankAccount,
      invoiceFooter: draft.invoiceFooter,
      accentColor: draft.accentColor,
      minimumReviewSeconds: draft.minimumReviewSeconds,
      lawyers: draft.lawyers.map(({ id, name, cardNumber, email, mayApproveDrafts }) => ({
        ...(id ? { id } : {}),
        name,
        cardNumber,
        email,
        mayApproveDrafts,
      })),
    };
    const parsed = OrganizationSettingsUpdateSchema.safeParse(body);
    if (!parsed.success) {
      setError(issueText(parsed.error.issues[0]?.path ?? []));
      return;
    }
    setPending(true);
    setError(null);
    try {
      setDraft(draftFrom(await rpc.organization.update(body)));
      setSaved(true);
    } catch {
      setError(t`Could not save organization settings`);
    } finally {
      setPending(false);
    }
  }

  async function uploadLogo(file: File | undefined) {
    if (!file || uploading) return;
    const mimeType = logoMime(file);
    if (!mimeType || file.size > 1024 * 1024) {
      setError(t`PNG, JPG, or SVG up to 1 MB.`);
      return;
    }
    setUploading(true);
    setError(null);
    setSaved(false);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const settings = await rpc.organization.uploadLogo({
        mimeType,
        contentBase64: bytesToBase64(bytes),
      });
      setDraft(draftFrom(settings));
      setSaved(true);
    } catch {
      setError(t`Could not upload the logo`);
    } finally {
      setUploading(false);
    }
  }

  if (!draft) {
    return (
      <div data-testid="organization-settings">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      data-testid="organization-settings"
      className="space-y-8"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <SettingsGroup title={<Trans>Firm</Trans>}>
        <div className="space-y-3 px-4 py-4">
          <Field>
            <FieldLabel htmlFor={`${baseId}-legal`}>
              <Trans>Legal name</Trans>
            </FieldLabel>
            <Input
              id={`${baseId}-legal`}
              data-testid="organization-legal-name"
              value={draft.legalName}
              maxLength={200}
              onChange={(event) => patch({ legalName: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${baseId}-trade`}>
              <Trans>Trade name</Trans>
            </FieldLabel>
            <Input
              id={`${baseId}-trade`}
              data-testid="organization-trade-name"
              value={draft.tradeName}
              maxLength={200}
              onChange={(event) => patch({ tradeName: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${baseId}-rnc`}>
              <Trans>RNC</Trans>
            </FieldLabel>
            <Input
              id={`${baseId}-rnc`}
              data-testid="organization-rnc"
              inputMode="numeric"
              value={draft.rnc}
              maxLength={20}
              onChange={(event) => patch({ rnc: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${baseId}-logo`}>
              <Trans>Logo</Trans>
            </FieldLabel>
            {draft.logo?.dataUrl ? (
              <img
                alt=""
                src={draft.logo.dataUrl}
                className="mb-2 max-h-16 max-w-[220px] object-contain"
              />
            ) : null}
            <Input
              id={`${baseId}-logo`}
              data-testid="organization-logo"
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void uploadLogo(file);
              }}
            />
            <p className="text-[12.5px] text-muted-foreground">
              <Trans>PNG, JPG, or SVG up to 1 MB.</Trans>
            </p>
          </Field>
        </div>
      </SettingsGroup>

      <SettingsGroup title={<Trans>Contact</Trans>}>
        <div className="space-y-3 px-4 py-4">
          <Field>
            <FieldLabel htmlFor={`${baseId}-address`}>
              <Trans>Address</Trans>
            </FieldLabel>
            <Input
              id={`${baseId}-address`}
              data-testid="organization-address"
              value={draft.addressLine}
              maxLength={300}
              onChange={(event) => patch({ addressLine: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${baseId}-city`}>
              <Trans>City and province</Trans>
            </FieldLabel>
            <Input
              id={`${baseId}-city`}
              data-testid="organization-city"
              value={draft.cityProvince}
              maxLength={120}
              onChange={(event) => patch({ cityProvince: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${baseId}-phone`}>
              <Trans>Phone</Trans>
            </FieldLabel>
            <Input
              id={`${baseId}-phone`}
              data-testid="organization-phone"
              type="tel"
              value={draft.phone}
              maxLength={40}
              onChange={(event) => patch({ phone: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${baseId}-email`}>
              <Trans>Email</Trans>
            </FieldLabel>
            <Input
              id={`${baseId}-email`}
              data-testid="organization-email"
              type="email"
              value={draft.email}
              maxLength={200}
              onChange={(event) => patch({ email: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${baseId}-website`}>
              <Trans>Website</Trans>
            </FieldLabel>
            <Input
              id={`${baseId}-website`}
              data-testid="organization-website"
              type="url"
              value={draft.website}
              maxLength={200}
              onChange={(event) => patch({ website: event.target.value })}
            />
          </Field>
        </div>
      </SettingsGroup>

      <SettingsGroup title={<Trans>Responsible lawyers</Trans>} data-testid="organization-lawyers">
        <div className="space-y-4 px-4 py-4">
          <p className="text-[12.5px] text-muted-foreground">
            <Trans>Named lawyers who may approve drafts for review.</Trans>
          </p>
          <Field>
            <FieldLabel htmlFor={`${baseId}-review-seconds`}>
              <Trans>Minimum review time (seconds)</Trans>
            </FieldLabel>
            <Input
              id={`${baseId}-review-seconds`}
              data-testid="organization-minimum-review"
              type="number"
              min={30}
              max={1800}
              value={draft.minimumReviewSeconds}
              onChange={(event) =>
                patch({ minimumReviewSeconds: Number(event.target.value) || 60 })
              }
            />
          </Field>
          <div className="flex gap-4 text-[13px]">
            <a href="/app/drafts" className="underline">
              <Trans>Drafts for review</Trans>
            </a>
            <a href="/app/draft-approvals" className="underline">
              <Trans>Approval log</Trans>
            </a>
          </div>
          {draft.lawyers.map((lawyer, index) => (
            <div
              key={lawyer.key}
              className="space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0"
            >
              <Field>
                <FieldLabel htmlFor={`${baseId}-lawyer-${index}-name`}>
                  <Trans>Name</Trans>
                </FieldLabel>
                <Input
                  id={`${baseId}-lawyer-${index}-name`}
                  value={lawyer.name}
                  maxLength={120}
                  onChange={(event) => patchLawyer(lawyer.key, { name: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${baseId}-lawyer-${index}-card`}>
                  <Trans>CARD number</Trans>
                </FieldLabel>
                <Input
                  id={`${baseId}-lawyer-${index}-card`}
                  value={lawyer.cardNumber}
                  maxLength={32}
                  onChange={(event) => patchLawyer(lawyer.key, { cardNumber: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${baseId}-lawyer-${index}-email`}>
                  <Trans>Email</Trans>
                </FieldLabel>
                <Input
                  id={`${baseId}-lawyer-${index}-email`}
                  type="email"
                  value={lawyer.email}
                  maxLength={200}
                  onChange={(event) => patchLawyer(lawyer.key, { email: event.target.value })}
                />
              </Field>
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={`${baseId}-lawyer-${index}-approve`} className="text-[14px]">
                  <Trans>May approve drafts</Trans>
                </label>
                <Switch
                  id={`${baseId}-lawyer-${index}-approve`}
                  checked={lawyer.mayApproveDrafts}
                  onCheckedChange={(checked) =>
                    patchLawyer(lawyer.key, { mayApproveDrafts: checked })
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  patch({ lawyers: draft.lawyers.filter((item) => item.key !== lawyer.key) })
                }
              >
                <Trans>Remove</Trans>
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            data-testid="organization-add-lawyer"
            onClick={() =>
              patch({
                lawyers: [
                  ...draft.lawyers,
                  {
                    key: crypto.randomUUID(),
                    name: "",
                    cardNumber: "",
                    email: "",
                    mayApproveDrafts: false,
                  },
                ],
              })
            }
          >
            <Trans>Add lawyer</Trans>
          </Button>
        </div>
      </SettingsGroup>

      <SettingsGroup title={<Trans>Invoices</Trans>}>
        <div className="space-y-3 px-4 py-4">
          <Field>
            <FieldLabel htmlFor={`${baseId}-bank`}>
              <Trans>Bank</Trans>
            </FieldLabel>
            <Input
              id={`${baseId}-bank`}
              data-testid="organization-bank"
              value={draft.bankName}
              maxLength={120}
              onChange={(event) => patch({ bankName: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${baseId}-account`}>
              <Trans>Bank account</Trans>
            </FieldLabel>
            <Input
              id={`${baseId}-account`}
              data-testid="organization-bank-account"
              value={draft.bankAccount}
              maxLength={64}
              onChange={(event) => patch({ bankAccount: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${baseId}-footer`}>
              <Trans>Invoice note</Trans>
            </FieldLabel>
            <Textarea
              id={`${baseId}-footer`}
              data-testid="organization-invoice-footer"
              value={draft.invoiceFooter}
              maxLength={500}
              onChange={(event) => patch({ invoiceFooter: event.target.value })}
            />
          </Field>
        </div>
      </SettingsGroup>

      <SettingsGroup title={<Trans>Documents</Trans>}>
        <div className="space-y-3 px-4 py-4">
          <Field>
            <FieldLabel htmlFor={`${baseId}-accent`}>
              <Trans>Document color</Trans>
            </FieldLabel>
            <Input
              id={`${baseId}-accent`}
              data-testid="organization-accent"
              value={draft.accentColor}
              maxLength={7}
              placeholder="#1F4B3A"
              onChange={(event) => patch({ accentColor: event.target.value })}
            />
            <p className="text-[12.5px] text-muted-foreground">
              <Trans>Documents only</Trans>
            </p>
          </Field>
        </div>
      </SettingsGroup>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" data-testid="organization-save" disabled={pending || uploading}>
          <Trans>Save</Trans>
        </Button>
        {saved ? (
          <p className="text-[13px] text-muted-foreground">
            <Trans>Saved</Trans>
          </p>
        ) : null}
      </div>
    </form>
  );
}
