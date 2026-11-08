import { Trans, useLingui } from "@lingui/react/macro";
import { ORPCError } from "@orpc/client";
import type { GoogleOAuthView } from "@rakazo/contracts";
import { Button, Input, useCopyText } from "@rakazo/ui-web";
import { useEffect, useId, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { SettingsGroup, SettingsRow } from "../components/SettingsRows";
import { rpc } from "../lib/rpc";
import { errorText } from "../lib/user-error";

/** Trusted-app steps and, for an owner or admin, the organization's own Google client. */
export function GoogleWorkspaceSettings({ organizationId }: { organizationId: string }) {
  const [view, setView] = useState<GoogleOAuthView | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    void rpc.googleOAuth
      .get()
      .then((next) => {
        if (current) setView(next);
      })
      .catch((error: unknown) => {
        if (!current) return;
        if (
          error instanceof ORPCError &&
          (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")
        ) {
          setView(null);
          return;
        }
        setLoadError(errorText(error));
      });
    return () => {
      current = false;
    };
  }, [organizationId]);
  if (loadError) {
    return (
      <p role="alert" className="text-body-sm text-destructive">
        {loadError}
      </p>
    );
  }
  if (!view) return null;
  return (
    <GoogleWorkspaceForm
      key={organizationId}
      organizationId={organizationId}
      view={view}
      onChange={setView}
    />
  );
}

function GoogleWorkspaceForm({
  organizationId,
  view,
  onChange,
}: {
  organizationId: string;
  view: GoogleOAuthView;
  onChange: (view: GoogleOAuthView) => void;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [copiedClientId, copyClientId] = useCopyText();
  const [, copyRedirect] = useCopyText();
  const clientIdField = useId();
  const secretField = useId();

  async function save() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const next = await rpc.googleOAuth.save({
        organizationId,
        clientId,
        clientSecret,
      });
      setClientId("");
      setClientSecret("");
      onChange(next);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setPending(false);
    }
  }

  async function test() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await rpc.googleOAuth.test({ organizationId });
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-8" data-testid="google-workspace-settings">
      <SettingsGroup title={t`Google Workspace`}>
        <SettingsRow label={<Trans>Trusted app</Trans>}>
          <ol className="list-decimal space-y-1 pl-5 text-body-sm text-muted-foreground">
            <li>
              <Trans>
                In the Google Admin console, open Security, Access and data control, API controls,
                Manage third-party app access, then Configure new app.
              </Trans>
            </li>
            <li>
              <Trans>Search for this client ID and set access to Trusted.</Trans>
            </li>
          </ol>
          {view.trustedClientId ? (
            <p className="pt-3 font-mono text-body-sm break-all">{view.trustedClientId}</p>
          ) : (
            <p className="pt-3 text-body-sm">
              <Trans>The client ID is not set on this server.</Trans>
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-3">
            {view.trustedClientId ? (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                aria-label={t`Copy client ID`}
                onClick={() => void copyClientId(view.trustedClientId ?? "")}
              >
                {copiedClientId ? <Trans>Copied</Trans> : <Trans>Copy client ID</Trans>}
              </Button>
            ) : null}
            <a className="text-body-sm underline" href="/docs/google-workspace.md">
              <Trans>Full steps</Trans>
            </a>
          </div>
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup>
        <SettingsRow
          label={<Trans>Your Google client</Trans>}
          control={
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <Trans>Close</Trans> : <Trans>Use your own Google client</Trans>}
            </Button>
          }
        >
          {view.configured ? (
            <p className="pt-2 text-body-sm text-muted-foreground">
              <Trans>Client ID ending in {view.clientIdLast4}. Secret saved.</Trans>
            </p>
          ) : null}
        </SettingsRow>
      </SettingsGroup>
      {open ? (
        <SettingsGroup>
          <SettingsRow label={<Trans>Redirect URI</Trans>}>
            <p className="font-mono text-body-sm break-all">{view.redirectUris[0]}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 rounded-full"
              aria-label={t`Copy redirect URI`}
              onClick={() => void copyRedirect(view.redirectUris[0] ?? "")}
            >
              <Trans>Copy redirect URI</Trans>
            </Button>
          </SettingsRow>
          <SettingsRow label={<Trans>Scopes</Trans>}>
            {view.scopesUnavailable ? (
              <p className="text-body-sm">
                <Trans>The scope list could not be loaded.</Trans>
              </p>
            ) : (
              <ul className="space-y-2 text-body-sm">
                {view.apps.map((app) => (
                  <li key={app.slug}>
                    <p>{app.name}</p>
                    {app.scopes.length > 0 ? (
                      <p className="font-mono text-muted-foreground break-all">
                        {app.scopes.join(" ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </SettingsRow>
          <SettingsRow label={<Trans>Steps</Trans>}>
            <ol className="list-decimal space-y-1 pl-5 text-body-sm text-muted-foreground">
              <li>
                <Trans>
                  In Google Cloud, open the OAuth consent screen for your Workspace project and set
                  the user type to Internal.
                </Trans>
              </li>
              <li>
                <Trans>Create an OAuth client ID of type Web application.</Trans>
              </li>
              <li>
                <Trans>Add the redirect URI shown here as an authorized redirect URI.</Trans>
              </li>
              <li>
                <Trans>Add every scope listed here.</Trans>
              </li>
              <li>
                <Trans>Paste the client ID and client secret, then save.</Trans>
              </li>
              <li>
                <Trans>Choose Test connection.</Trans>
              </li>
              <li>
                <Trans>
                  Removing the client uses ALMA's Google sign-in again. Google apps already
                  connected with this client may need to be connected again.
                </Trans>
              </li>
            </ol>
          </SettingsRow>
          <SettingsRow
            label={
              <label htmlFor={clientIdField}>
                <Trans>Client ID</Trans>
              </label>
            }
            control={
              <Input
                id={clientIdField}
                className="w-56"
                value={clientId}
                autoComplete="off"
                disabled={pending}
                onChange={(event) => setClientId(event.target.value)}
              />
            }
          />
          <SettingsRow
            label={
              <label htmlFor={secretField}>
                <Trans>Client secret</Trans>
              </label>
            }
            control={
              <Input
                id={secretField}
                className="w-56"
                type="password"
                value={clientSecret}
                autoComplete="off"
                disabled={pending}
                onChange={(event) => setClientSecret(event.target.value)}
              />
            }
          >
            {error ? (
              <p role="alert" className="pt-2 text-body-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-3">
              <Button className="rounded-full" disabled={pending} onClick={() => void save()}>
                <Trans>Save</Trans>
              </Button>
              {view.configured ? (
                <Button
                  variant="outline"
                  className="rounded-full"
                  disabled={pending}
                  onClick={() => void test()}
                >
                  <Trans>Test connection</Trans>
                </Button>
              ) : null}
              {view.configured ? (
                <Button
                  variant="destructive"
                  className="rounded-full"
                  disabled={pending}
                  onClick={() => setConfirming(true)}
                >
                  <Trans>Remove</Trans>
                </Button>
              ) : null}
            </div>
          </SettingsRow>
        </SettingsGroup>
      ) : null}
      {confirming ? (
        <ConfirmDialog
          onCancel={() => setConfirming(false)}
          title={<Trans>Remove this Google client?</Trans>}
          description={<Trans>Google apps connected with it may need to be connected again.</Trans>}
          confirmLabel={<Trans>Remove</Trans>}
          onConfirm={() => {
            void rpc.googleOAuth
              .remove({ organizationId })
              .then((next) => {
                setConfirming(false);
                onChange(next);
              })
              .catch((reason: unknown) => {
                setConfirming(false);
                setError(errorText(reason));
              });
          }}
        />
      ) : null}
    </div>
  );
}
