import { useLingui } from "@lingui/react/macro";
import type { EmailImapErrorCode, EmailImapSecurity } from "@rakazo/contracts";
import {
  EMAIL_IMAP_ERROR_CODES,
  emailImapCopy,
  emailImapErrorText,
  parseEmailImapAddress,
  parseEmailImapCredentials,
} from "@rakazo/contracts";
import {
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  NativeSelect,
  NativeSelectOption,
} from "@rakazo/ui-web";
import { useState } from "react";
import { rpc } from "../../lib/rpc";
import { ViewTitle } from "./parts";

type ServerFields = { host: string; port: string; security: EmailImapSecurity };

const EMPTY_IMAP: ServerFields = { host: "", port: "993", security: "ssl" };
const EMPTY_SMTP: ServerFields = { host: "", port: "587", security: "starttls" };

/** Connect a mailbox with its address, password, and, when needed, its servers. */
export function EmailImapForm({
  locale,
  onBack,
  onSaved,
}: {
  locale?: string;
  onBack: () => void;
  onSaved: () => void;
}) {
  const { i18n } = useLingui();
  const copy = emailImapCopy(locale ?? i18n.locale);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [imap, setImap] = useState<ServerFields>(EMPTY_IMAP);
  const [smtp, setSmtp] = useState<ServerFields>(EMPTY_SMTP);
  const [detected, setDetected] = useState<boolean | null>(null);
  const [showServers, setShowServers] = useState(false);
  const [tested, setTested] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const serversVisible = showServers || detected === false;
  const current = payload(email, password, username, imap, smtp);
  const currentKey = current.ok ? settingsKey(current.value) : "";
  const canSave = Boolean(current.ok && tested && tested === currentKey && !busy);

  async function detect(nextEmail: string) {
    const parsed = parseEmailImapAddress(nextEmail);
    if (!parsed.ok) return;
    setBusy("test");
    setMessage(null);
    setOk(false);
    try {
      const found = await rpc.emailImap.detect({ email: parsed.email });
      if (found.detected && found.imap && found.smtp) {
        setUsername(found.username ?? parsed.email);
        setImap({
          host: found.imap.host,
          port: String(found.imap.port),
          security: found.imap.security,
        });
        setSmtp({
          host: found.smtp.host,
          port: String(found.smtp.port),
          security: found.smtp.security,
        });
        setDetected(true);
        setShowServers(false);
      } else {
        setDetected(false);
        setShowServers(true);
      }
    } catch (error) {
      setDetected(false);
      setShowServers(true);
      setMessage(messageFrom(error, copy));
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    if (!current.ok) {
      setOk(false);
      setMessage(copy.errors.invalid);
      return;
    }
    setBusy("test");
    setMessage(null);
    setOk(false);
    try {
      const result = await rpc.emailImap.test(current.value);
      if (!result.ok) {
        setTested(null);
        setMessage(
          emailImapErrorText(locale ?? i18n.locale, result.code ?? "unreachable", result.side),
        );
        return;
      }
      setTested(settingsKey(current.value));
      setOk(true);
      setMessage(copy.works);
    } catch (error) {
      setTested(null);
      setMessage(messageFrom(error, copy));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!current.ok || !canSave) return;
    setBusy("save");
    setMessage(null);
    try {
      const result = await rpc.emailImap.save(current.value);
      if (!result.ok) {
        setOk(false);
        setTested(null);
        setMessage(
          emailImapErrorText(locale ?? i18n.locale, result.code ?? "unreachable", result.side),
        );
        return;
      }
      onSaved();
    } catch (error) {
      setMessage(messageFrom(error, copy));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div data-testid="email-imap-form" className="max-w-xl space-y-6">
      <ViewTitle title={copy.title} onBack={onBack} />
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) void save();
          else void testConnection();
        }}
      >
        <Field>
          <FieldLabel htmlFor="email-imap-address">{copy.email}</FieldLabel>
          <Input
            id="email-imap-address"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setTested(null);
              setOk(false);
            }}
            onBlur={(event) => void detect(event.currentTarget.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="email-imap-password">{copy.password}</FieldLabel>
          <Input
            id="email-imap-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setTested(null);
              setOk(false);
            }}
          />
          <FieldDescription>{copy.help}</FieldDescription>
        </Field>
        {serversVisible ? (
          <div className="space-y-4">
            <ServerFields
              legend={copy.incoming}
              portLabel={copy.port}
              securityLabel={copy.security}
              value={imap}
              onChange={(next) => {
                setImap(next);
                setTested(null);
                setOk(false);
              }}
            />
            <ServerFields
              legend={copy.outgoing}
              portLabel={copy.port}
              securityLabel={copy.security}
              value={smtp}
              onChange={(next) => {
                setSmtp(next);
                setTested(null);
                setOk(false);
              }}
            />
            <Field>
              <FieldLabel htmlFor="email-imap-username">{copy.username}</FieldLabel>
              <Input
                id="email-imap-username"
                autoComplete="username"
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  setTested(null);
                  setOk(false);
                }}
              />
            </Field>
          </div>
        ) : detected ? (
          <Button
            type="button"
            variant="ghost"
            className="px-0"
            onClick={() => setShowServers(true)}
          >
            {copy.changeServers}
          </Button>
        ) : null}
        {message ? (
          <p className={ok ? "text-body text-muted-foreground" : "text-body text-destructive"}>
            {message}
          </p>
        ) : null}
        {canSave ? (
          <Button type="submit" disabled={busy !== null}>
            {busy === "save" ? copy.saving : copy.save}
          </Button>
        ) : (
          <Button type="submit" disabled={busy !== null || !email.trim() || !password}>
            {busy === "test" ? copy.testing : copy.test}
          </Button>
        )}
      </form>
    </div>
  );
}

function ServerFields({
  legend,
  portLabel,
  securityLabel,
  value,
  onChange,
}: {
  legend: string;
  portLabel: string;
  securityLabel: string;
  value: ServerFields;
  onChange: (value: ServerFields) => void;
}) {
  const id = legend.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="space-y-3">
      <Field>
        <FieldLabel htmlFor={`${id}-host`}>{legend}</FieldLabel>
        <Input
          id={`${id}-host`}
          value={value.host}
          autoCapitalize="none"
          spellCheck={false}
          onChange={(event) => onChange({ ...value, host: event.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor={`${id}-port`}>{portLabel}</FieldLabel>
          <Input
            id={`${id}-port`}
            inputMode="numeric"
            value={value.port}
            onChange={(event) => onChange({ ...value, port: event.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-security`}>{securityLabel}</FieldLabel>
          <NativeSelect
            id={`${id}-security`}
            value={value.security}
            onChange={(event) =>
              onChange({
                ...value,
                security: event.target.value === "starttls" ? "starttls" : "ssl",
              })
            }
          >
            <NativeSelectOption value="ssl">SSL</NativeSelectOption>
            <NativeSelectOption value="starttls">STARTTLS</NativeSelectOption>
          </NativeSelect>
        </Field>
      </div>
    </div>
  );
}

function payload(
  email: string,
  password: string,
  username: string,
  imap: ServerFields,
  smtp: ServerFields,
) {
  return parseEmailImapCredentials({
    email,
    password,
    username,
    imap: { host: imap.host, port: Number(imap.port), security: imap.security },
    smtp: { host: smtp.host, port: Number(smtp.port), security: smtp.security },
  });
}

function settingsKey(value: {
  email: string;
  password: string;
  username: string;
  imap: { host: string; port: number; security: string };
  smtp: { host: string; port: number; security: string };
}): string {
  return JSON.stringify(value);
}

function messageFrom(error: unknown, copy: ReturnType<typeof emailImapCopy>): string {
  const message = error instanceof Error ? error.message : "";
  const code = (EMAIL_IMAP_ERROR_CODES as readonly string[]).find((item) => message.includes(item));
  return code ? copy.errors[code as EmailImapErrorCode] : copy.errors.unreachable;
}
