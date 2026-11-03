import { Trans, useLingui } from "@lingui/react/macro";
import type { SpaceMemoryConfig } from "@rakazo/contracts";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  Field,
  FieldLabel,
  Input,
  NativeSelect,
  NativeSelectOption,
  Spinner,
  Toggle,
} from "@rakazo/ui-web";
import { XIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { SETTINGS_CONTENT_WIDTH } from "../components/SettingsRows";
import { useSpaceRpc } from "../lib/space-rpc";
import { errorText } from "../lib/user-error";
import { SpaceMemorySection } from "./KnowledgeSection";
import type { MemoryProviderConnectionDraft } from "./memory-providers/registry";
import {
  defaultMemoryProviderSettings,
  MEMORY_PROVIDER_SETTINGS,
  memoryProviderSettings,
} from "./memory-providers/registry";

function ScopePicker({
  value,
  disabled,
  onChange,
}: {
  value: "isolated" | "shared";
  disabled: boolean;
  onChange: (scope: "isolated" | "shared") => void;
}) {
  const labelId = useId();
  return (
    <Field aria-labelledby={labelId}>
      <FieldLabel id={labelId}>
        <Trans>Default scope</Trans>
      </FieldLabel>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(["isolated", "shared"] as const).map((option) => (
          <Toggle
            key={option}
            pressed={value === option}
            disabled={disabled}
            onPressedChange={() => onChange(option)}
            className="text-[13px] aria-pressed:bg-background aria-pressed:shadow-sm"
          >
            {option === "isolated" ? <Trans>Isolated</Trans> : <Trans>Shared</Trans>}
          </Toggle>
        ))}
      </div>
    </Field>
  );
}

export function MemorySettingsOverlay({
  onClose,
  config,
  onConfigChange,
  embedded = false,
  onBusyChange,
  canChangeProvider = true,
}: {
  onClose: () => void;
  config: SpaceMemoryConfig | null | undefined;
  onConfigChange: (config: SpaceMemoryConfig | null) => void;
  /** Render panel body only for the shared Settings shell. */
  embedded?: boolean;
  onBusyChange?: (busy: boolean) => void;
  /** False for a Space member who is not the owner. */
  canChangeProvider?: boolean;
}) {
  const rpc = useSpaceRpc();
  const { t } = useLingui();
  const providerSelectId = useId();
  const defaultRegistration = defaultMemoryProviderSettings();
  const [selectedProvider, setSelectedProvider] = useState(
    config?.provider ?? defaultRegistration.id,
  );
  const [defaultScope, setDefaultScope] = useState<"isolated" | "shared">(
    config?.defaultMemoryScope ?? "isolated",
  );
  const [pending, setPending] = useState<
    "connect" | "disconnect" | "scope" | "probe" | "save" | null
  >(null);
  const [memoryChoice, setMemoryChoice] = useState<"alma" | "owner">(
    config?.ownerServer ? "owner" : "alma",
  );
  const [ownerBaseUrl, setOwnerBaseUrl] = useState(config?.settings.baseUrl ?? "");
  const [ownerApiKey, setOwnerApiKey] = useState("");
  const [addingProvider, setAddingProvider] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      setSelectedProvider(config.provider);
      setDefaultScope(config.defaultMemoryScope);
      setMemoryChoice(config.ownerServer ? "owner" : "alma");
      if (config.ownerServer) setOwnerBaseUrl(config.settings.baseUrl ?? "");
      return;
    }
    if (config === null && !memoryProviderSettings(selectedProvider)) {
      setSelectedProvider(defaultRegistration.id);
    }
  }, [config, defaultRegistration.id, selectedProvider]);

  const registration = memoryProviderSettings(config?.provider ?? selectedProvider);
  const busy = pending !== null;

  useEffect(() => {
    return () => onBusyChange?.(false);
  }, [onBusyChange]);

  function markPending(next: "connect" | "disconnect" | "scope" | "probe" | "save" | null) {
    setPending(next);
    onBusyChange?.(next !== null);
  }

  async function connect(draft: MemoryProviderConnectionDraft) {
    if (!registration) return false;
    setError(null);
    markPending("connect");
    try {
      const next = await rpc.memory.connectProvider({
        provider: registration.id,
        ...draft,
        defaultMemoryScope: defaultScope,
      });
      onConfigChange(next);
      return true;
    } catch (err) {
      setError(errorText(err, t`Could not connect ${registration.name}`));
      return false;
    } finally {
      markPending(null);
    }
  }

  async function disconnect() {
    setError(null);
    markPending("disconnect");
    try {
      await rpc.memory.disconnectProvider();
      setAddingProvider(false);
      onConfigChange(null);
    } catch (err) {
      setError(errorText(err, t`Could not disconnect memory provider`));
    } finally {
      markPending(null);
    }
  }

  function ownerHonchoProblem(code: string | undefined): string {
    switch (code) {
      case "public-https":
        return t`Use a public HTTPS address. Private and local addresses are not allowed.`;
      case "rejected-key":
        return t`Honcho refused the API key.`;
      case "redirect":
        return t`That address redirects. ALMA does not follow redirects.`;
      case "missing-key":
        return t`Enter the API key.`;
      default:
        return t`Could not reach that Honcho server.`;
    }
  }

  const savedOwnerUrl = config?.ownerServer ? (config.settings.baseUrl ?? "") : "";
  const ownerKeyOnFile =
    Boolean(config?.ownerServer) &&
    ownerBaseUrl.trim().replace(/\/$/, "") === savedOwnerUrl.replace(/\/$/, "") &&
    ownerApiKey.trim() === "";

  async function chooseAlmaMemory() {
    setMemoryChoice("alma");
    if (!config?.ownerServer) return;
    setError(null);
    markPending("save");
    try {
      await rpc.memory.disconnectProvider();
      onConfigChange(await rpc.memory.providerConfig());
    } catch (err) {
      setMemoryChoice("owner");
      setError(errorText(err, t`Could not save the Honcho server`));
    } finally {
      markPending(null);
    }
  }

  async function saveOwnerServer() {
    setError(null);
    markPending("save");
    try {
      const next = await rpc.memory.connectProvider({
        provider: "honcho",
        settings: { source: "owner-honcho", mode: "public", baseUrl: ownerBaseUrl.trim() },
        credentials: { apiKey: ownerApiKey.trim() },
        defaultMemoryScope: defaultScope,
      });
      setOwnerApiKey("");
      onConfigChange(next);
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err ? String(err.message) : "";
      setError(
        ["public-https", "rejected-key", "redirect", "missing-key", "unreachable"].includes(message)
          ? ownerHonchoProblem(message)
          : errorText(err, t`Could not save the Honcho server`),
      );
    } finally {
      markPending(null);
    }
  }

  async function testOwnerServer() {
    setError(null);
    markPending("probe");
    try {
      const result = await rpc.memory.probeOwnerServer({
        baseUrl: ownerBaseUrl.trim(),
        apiKey: ownerApiKey.trim(),
      });
      if (!result.ok) setError(ownerHonchoProblem(result.error));
    } catch (err) {
      setError(errorText(err, t`Could not reach that Honcho server.`));
    } finally {
      markPending(null);
    }
  }

  async function updateDefaultScope(scope: "isolated" | "shared") {
    if (scope === defaultScope) return;
    setError(null);
    markPending("scope");
    try {
      const next = await rpc.memory.setDefaultScope({ defaultMemoryScope: scope });
      onConfigChange(next);
    } catch (err) {
      setError(errorText(err, t`Could not update the default memory scope`));
    } finally {
      markPending(null);
    }
  }

  const body = (
    <>
      {!embedded ? (
        <div className="flex items-start justify-between px-6 pt-6 sm:px-8 sm:pt-7">
          <div>
            <DialogTitle className="text-heading2 font-medium text-foreground">
              <Trans>Memory</Trans>
            </DialogTitle>
          </div>
          <DialogClose
            aria-label={t`Close memory settings`}
            disabled={busy}
            render={<Button variant="ghost" size="icon-sm" />}
          >
            <XIcon />
          </DialogClose>
        </div>
      ) : null}

      <div className="rk-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-6 sm:px-8 sm:pb-8">
        <div className={`space-y-5 ${SETTINGS_CONTENT_WIDTH}`}>
          {error ? <p className="text-[13px] text-destructive">{error}</p> : null}

          <SpaceMemorySection />

          {config === undefined ? (
            <p className="text-[13px] text-muted-foreground">
              <Spinner aria-label={t`Loading memory settings…`} />
            </p>
          ) : config?.managedByServer ? (
            <section className="rounded-xl border border-border px-4 py-4">
              <h3 id={providerSelectId} className="text-heading3 font-medium text-foreground">
                <Trans>Provider</Trans>
              </h3>
              <div className="mt-3 grid grid-cols-1 gap-1 rounded-lg bg-muted p-1 sm:grid-cols-2">
                <Toggle
                  pressed={memoryChoice === "alma"}
                  disabled={busy || !canChangeProvider}
                  onPressedChange={() => void chooseAlmaMemory()}
                  className="text-[13px] aria-pressed:bg-background aria-pressed:shadow-sm"
                >
                  <Trans>ALMA memory (recommended)</Trans>
                </Toggle>
                <Toggle
                  pressed={memoryChoice === "owner"}
                  disabled={busy || !canChangeProvider}
                  onPressedChange={() => setMemoryChoice("owner")}
                  className="text-[13px] aria-pressed:bg-background aria-pressed:shadow-sm"
                >
                  <Trans>My own Honcho server</Trans>
                </Toggle>
              </div>
              {memoryChoice === "owner" ? (
                <div className="mt-4 space-y-4">
                  <Field>
                    <FieldLabel htmlFor={`${providerSelectId}-url`}>
                      <Trans>HTTPS address</Trans>
                    </FieldLabel>
                    <Input
                      id={`${providerSelectId}-url`}
                      value={ownerBaseUrl}
                      disabled={busy || !canChangeProvider}
                      onChange={(event) => setOwnerBaseUrl(event.target.value)}
                      placeholder="https://"
                      type="url"
                      autoComplete="off"
                    />
                  </Field>
                  {canChangeProvider ? (
                    <Field>
                      <FieldLabel htmlFor={`${providerSelectId}-key`}>
                        <Trans>API key</Trans>
                      </FieldLabel>
                      <Input
                        id={`${providerSelectId}-key`}
                        value={ownerApiKey}
                        disabled={busy}
                        onChange={(event) => setOwnerApiKey(event.target.value)}
                        placeholder={config.ownerServer ? "••••••••" : ""}
                        type="password"
                        autoComplete="new-password"
                      />
                    </Field>
                  ) : null}
                  <p className="text-[13px] text-muted-foreground">
                    <Trans>Existing memories are not moved to the other server.</Trans>
                  </p>
                  {config.connectionWarning === "unreachable" ? (
                    <p className="text-[13px] text-destructive">
                      <Trans>
                        Your Honcho server could not be reached. Chats continue without this memory.
                      </Trans>
                    </p>
                  ) : null}
                  {canChangeProvider ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          busy ||
                          !ownerBaseUrl.trim() ||
                          (!ownerKeyOnFile && ownerApiKey.trim().length < 8)
                        }
                        onClick={() => void testOwnerServer()}
                      >
                        {pending === "probe" ? (
                          <Trans>Testing connection…</Trans>
                        ) : (
                          <Trans>Test connection</Trans>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={
                          busy ||
                          !ownerBaseUrl.trim() ||
                          (!ownerKeyOnFile && ownerApiKey.trim().length < 8)
                        }
                        onClick={() => void saveOwnerServer()}
                      >
                        {pending === "save" ? <Trans>Saving…</Trans> : <Trans>Save</Trans>}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-4">
                <ScopePicker
                  value={defaultScope}
                  disabled={busy || !canChangeProvider}
                  onChange={(scope) => void updateDefaultScope(scope)}
                />
              </div>
            </section>
          ) : config ? (
            <section className="rounded-xl border border-border px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-heading3 font-medium text-foreground">
                  {registration?.name ?? config.provider}
                </h3>
                <span className="text-[13px] text-success">
                  <Trans>Connected</Trans>
                </span>
              </div>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {registration?.connectedLabel(config) ?? config.provider}
              </p>
              <div className="mt-4">
                <ScopePicker
                  value={defaultScope}
                  disabled={busy}
                  onChange={(scope) => void updateDefaultScope(scope)}
                />
              </div>
              <Button
                variant="outline"
                type="button"
                disabled={busy}
                onClick={() => void disconnect()}
                className="mt-5"
              >
                {pending === "disconnect" ? (
                  <Trans>Disconnecting…</Trans>
                ) : (
                  <Trans>Disconnect</Trans>
                )}
              </Button>
            </section>
          ) : !addingProvider ? (
            <Button
              variant="outline"
              type="button"
              onClick={() => setAddingProvider(true)}
              className="rounded-full"
            >
              <Trans>Connect memory provider</Trans>
            </Button>
          ) : registration ? (
            <section className="rounded-xl border border-border px-4 py-4">
              <h3 id={providerSelectId} className="text-heading3 font-medium text-foreground">
                <Trans>Provider</Trans>
              </h3>
              <p className="mt-1 text-[13px] text-muted-foreground">
                <Trans>Lets bots save and recall facts by meaning, alongside MEMORY.md.</Trans>
              </p>
              {MEMORY_PROVIDER_SETTINGS.length > 1 ? (
                <div className="mt-3">
                  <NativeSelect
                    aria-labelledby={providerSelectId}
                    className="w-full"
                    value={selectedProvider}
                    disabled={busy}
                    onChange={(event) => setSelectedProvider(event.target.value)}
                  >
                    {MEMORY_PROVIDER_SETTINGS.map((entry) => (
                      <NativeSelectOption key={entry.id} value={entry.id}>
                        {entry.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              ) : (
                <p className="mt-3 text-[14px] text-foreground">{registration.name}</p>
              )}

              <div className="mt-4">
                <ScopePicker value={defaultScope} disabled={busy} onChange={setDefaultScope} />
              </div>

              <registration.SettingsForm busy={busy} onConnect={connect} />
            </section>
          ) : (
            <p className="text-[13px] text-destructive">
              <Trans>The selected memory provider is not available in this build.</Trans>
            </p>
          )}
        </div>
      </div>
    </>
  );

  if (embedded) {
    return (
      <div data-testid="memory-settings" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {body}
      </div>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open, details) => {
        if (open) return;
        if (busy) {
          details.cancel();
          return;
        }
        onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[min(760px,calc(100%-2rem))] w-[560px] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-h-[min(760px,calc(100%-5rem))] sm:max-w-[calc(100%-5rem)]"
      >
        {body}
      </DialogContent>
    </Dialog>
  );
}
