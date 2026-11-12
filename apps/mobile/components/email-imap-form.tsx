import { useLingui } from "@lingui/react/macro";
import type { EmailImapErrorCode, EmailImapSecurity } from "@rakazo/contracts";
import {
  EMAIL_IMAP_ERROR_CODES,
  emailImapCopy,
  emailImapErrorText,
  parseEmailImapAddress,
  parseEmailImapCredentials,
} from "@rakazo/contracts";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { rpc } from "../lib/api";
import { native, useThemedStyles } from "../lib/native";
import { createIntegrationsStyles } from "./integrations-styles";
import { MenuPicker } from "./menu-picker";
import { NativeActionButton } from "./native-action-button";

type ServerFields = { host: string; port: string; security: EmailImapSecurity };

/** The phone form for a mailbox the person hosts themselves. */
export function EmailImapForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const styles = useThemedStyles(createIntegrationsStyles);
  const { i18n, t } = useLingui();
  const copy = emailImapCopy(i18n.locale);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [imap, setImap] = useState<ServerFields>({ host: "", port: "993", security: "ssl" });
  const [smtp, setSmtp] = useState<ServerFields>({ host: "", port: "587", security: "starttls" });
  const [detected, setDetected] = useState<boolean | null>(null);
  const [showServers, setShowServers] = useState(false);
  const [tested, setTested] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const serversVisible = showServers || detected === false;
  const current = parseEmailImapCredentials({
    email,
    password,
    username,
    imap: { host: imap.host, port: Number(imap.port), security: imap.security },
    smtp: { host: smtp.host, port: Number(smtp.port), security: smtp.security },
  });
  const currentKey = current.ok ? JSON.stringify(current.value) : "";
  const canSave = Boolean(current.ok && tested && tested === currentKey && !busy);

  async function detect(nextEmail: string) {
    const parsed = parseEmailImapAddress(nextEmail);
    if (!parsed.ok) return;
    setBusy(true);
    setMessage(null);
    setOk(false);
    try {
      const found = await rpc("emailImap/detect", { email: parsed.email });
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
      setMessage(readError(error, copy));
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    if (!current.ok) {
      setMessage(copy.errors.invalid);
      return;
    }
    setBusy(true);
    setMessage(null);
    setOk(false);
    try {
      const result = await rpc("emailImap/test", current.value);
      if (!result.ok) {
        setTested("");
        setMessage(emailImapErrorText(i18n.locale, result.code ?? "unreachable", result.side));
        return;
      }
      setTested(currentKey);
      setOk(true);
      setMessage(copy.works);
    } catch (error) {
      setTested("");
      setMessage(readError(error, copy));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!current.ok || !canSave) return;
    setBusy(true);
    try {
      const result = await rpc("emailImap/save", current.value);
      if (!result.ok) {
        setOk(false);
        setTested("");
        setMessage(emailImapErrorText(i18n.locale, result.code ?? "unreachable", result.side));
        return;
      }
      onSaved();
    } catch (error) {
      setMessage(readError(error, copy));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.catalogStack}>
      <Text style={styles.title}>{copy.title}</Text>
      <TextInput
        accessibilityLabel={copy.email}
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        keyboardType="email-address"
        onBlur={() => void detect(email)}
        onChangeText={(value) => {
          setEmail(value);
          setTested("");
          setOk(false);
        }}
        placeholder={copy.email}
        placeholderTextColor={native.tertiaryLabel}
        style={styles.input}
        value={email}
      />
      <TextInput
        accessibilityLabel={copy.password}
        autoCapitalize="none"
        autoComplete="current-password"
        onChangeText={(value) => {
          setPassword(value);
          setTested("");
          setOk(false);
        }}
        placeholder={copy.password}
        placeholderTextColor={native.tertiaryLabel}
        secureTextEntry
        style={styles.input}
        value={password}
      />
      <Text style={styles.explanation}>{copy.help}</Text>
      {serversVisible ? (
        <ServerBlock
          copy={copy}
          imap={imap}
          smtp={smtp}
          username={username}
          onImap={setImap}
          onSmtp={setSmtp}
          onUsername={(value) => {
            setUsername(value);
            setTested("");
            setOk(false);
          }}
          onEdit={() => {
            setTested("");
            setOk(false);
          }}
        />
      ) : detected ? (
        <Pressable accessibilityRole="button" onPress={() => setShowServers(true)}>
          <Text style={styles.link}>{copy.changeServers}</Text>
        </Pressable>
      ) : null}
      {message ? <Text style={ok ? styles.secondary : styles.error}>{message}</Text> : null}
      <NativeActionButton
        disabled={busy || (canSave ? false : !email.trim() || !password)}
        label={busy ? (canSave ? copy.saving : copy.testing) : canSave ? copy.save : copy.test}
        onPress={() => void (canSave ? save() : testConnection())}
      />
      <NativeActionButton fill={false} label={t`Back`} onPress={onClose} />
    </View>
  );
}

function ServerBlock({
  copy,
  imap,
  smtp,
  username,
  onImap,
  onSmtp,
  onUsername,
  onEdit,
}: {
  copy: ReturnType<typeof emailImapCopy>;
  imap: ServerFields;
  smtp: ServerFields;
  username: string;
  onImap: (value: ServerFields) => void;
  onSmtp: (value: ServerFields) => void;
  onUsername: (value: string) => void;
  onEdit: () => void;
}) {
  const styles = useThemedStyles(createIntegrationsStyles);
  const security = [
    { key: "ssl", label: "SSL" },
    { key: "starttls", label: "STARTTLS" },
  ];
  return (
    <View style={styles.catalogStack}>
      <Text style={styles.section}>{copy.incoming}</Text>
      <TextInput
        accessibilityLabel={copy.incoming}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={(host) => {
          onEdit();
          onImap({ ...imap, host });
        }}
        placeholder={copy.incoming}
        placeholderTextColor={native.tertiaryLabel}
        style={styles.input}
        value={imap.host}
      />
      <TextInput
        accessibilityLabel={copy.port}
        keyboardType="number-pad"
        onChangeText={(port) => {
          onEdit();
          onImap({ ...imap, port });
        }}
        placeholder={copy.port}
        placeholderTextColor={native.tertiaryLabel}
        style={styles.input}
        value={imap.port}
      />
      <MenuPicker
        choices={security}
        label={copy.security}
        onChange={(key) => {
          onEdit();
          onImap({ ...imap, security: key === "starttls" ? "starttls" : "ssl" });
        }}
        value={imap.security}
      />
      <Text style={styles.section}>{copy.outgoing}</Text>
      <TextInput
        accessibilityLabel={copy.outgoing}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={(host) => {
          onEdit();
          onSmtp({ ...smtp, host });
        }}
        placeholder={copy.outgoing}
        placeholderTextColor={native.tertiaryLabel}
        style={styles.input}
        value={smtp.host}
      />
      <TextInput
        accessibilityLabel={copy.port}
        keyboardType="number-pad"
        onChangeText={(port) => {
          onEdit();
          onSmtp({ ...smtp, port });
        }}
        placeholder={copy.port}
        placeholderTextColor={native.tertiaryLabel}
        style={styles.input}
        value={smtp.port}
      />
      <MenuPicker
        choices={security}
        label={copy.security}
        onChange={(key) => {
          onEdit();
          onSmtp({ ...smtp, security: key === "starttls" ? "starttls" : "ssl" });
        }}
        value={smtp.security}
      />
      <TextInput
        accessibilityLabel={copy.username}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onUsername}
        placeholder={copy.username}
        placeholderTextColor={native.tertiaryLabel}
        style={styles.input}
        value={username}
      />
    </View>
  );
}

function readError(error: unknown, copy: ReturnType<typeof emailImapCopy>): string {
  const message = error instanceof Error ? error.message : "";
  const code = EMAIL_IMAP_ERROR_CODES.find((item) => message.includes(item));
  return code ? copy.errors[code as EmailImapErrorCode] : copy.errors.unreachable;
}
