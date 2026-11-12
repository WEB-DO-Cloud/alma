import { useLingui } from "@lingui/react/macro";
import type { OutboundDraft, WorkContext } from "@rakazo/contracts";
import { queueDraftActions, undoCountdown } from "@rakazo/core";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useMobileTokens } from "./native";

const channels = ["email", "whatsapp", "other"] as const;

export function ApprovalQueue({
  actorUserId,
  contexts,
  contextId,
  drafts,
  onSelectContext,
  onCreateContext,
  onCreateDraft,
  onSubmit,
  onApprove,
  onCancel,
  sendUndo = false,
}: {
  actorUserId: string;
  contexts: WorkContext[];
  contextId: string | null;
  drafts: OutboundDraft[];
  onSelectContext: (id: string) => void;
  onCreateContext: (kind: "personal" | "work", label: string) => void;
  onCreateDraft: (input: {
    recipient: string;
    channel: (typeof channels)[number];
    body: string;
  }) => void;
  onSubmit: (id: string) => void;
  onApprove: (id: string) => void;
  onCancel: (id: string) => void;
  sendUndo?: boolean;
}) {
  const { t } = useLingui();
  const tokens = useMobileTokens();
  const labelStyle = { color: tokens.foreground, fontSize: 17 };
  const fieldStyle = {
    color: tokens.foreground,
    backgroundColor: tokens.muted,
    borderColor: tokens.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 17,
  };
  const [name, setName] = useState("");
  const [recipient, setRecipient] = useState("");
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<(typeof channels)[number]>("email");
  const context = contexts.find((item) => item.id === contextId) ?? null;
  const compose =
    context &&
    queueDraftActions({
      role: context.role,
      status: "draft",
      creatorRole: context.role,
      creatorUserId: actorUserId,
      actorUserId,
    }).compose;
  return (
    <View>
      <Text style={labelStyle}>{t`Queue`}</Text>
      {contexts.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          onPress={() => onSelectContext(item.id)}
          style={{ minHeight: 48, justifyContent: "center" }}
        >
          <Text style={labelStyle}>{item.label}</Text>
        </Pressable>
      ))}
      <TextInput
        accessibilityLabel={t`Name`}
        placeholderTextColor={tokens.mutedForeground}
        style={fieldStyle}
        value={name}
        onChangeText={setName}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          const label = name.trim();
          if (!label) return;
          onCreateContext("personal", label);
        }}
        style={{ minHeight: 48, justifyContent: "center" }}
      >
        <Text style={labelStyle}>{t`Personal`}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          const label = name.trim();
          if (!label) return;
          onCreateContext("work", label);
        }}
        style={{ minHeight: 48, justifyContent: "center" }}
      >
        <Text style={labelStyle}>{t`Work`}</Text>
      </Pressable>
      {compose ? (
        <View>
          <Text style={labelStyle}>{t`New draft`}</Text>
          <TextInput
            accessibilityLabel={t`Recipient`}
            placeholderTextColor={tokens.mutedForeground}
            style={fieldStyle}
            value={recipient}
            onChangeText={setRecipient}
          />
          {channels.map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              onPress={() => setChannel(value)}
              style={{ minHeight: 48, justifyContent: "center" }}
            >
              <Text style={labelStyle}>{value}</Text>
            </Pressable>
          ))}
          <TextInput
            accessibilityLabel={t`Message`}
            placeholderTextColor={tokens.mutedForeground}
            style={fieldStyle}
            value={body}
            onChangeText={setBody}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (!recipient.trim() || !body.trim()) return;
              onCreateDraft({ recipient: recipient.trim(), channel, body });
            }}
            style={{ minHeight: 48, justifyContent: "center" }}
          >
            <Text style={labelStyle}>{t`Save`}</Text>
          </Pressable>
        </View>
      ) : null}
      {context && drafts.length === 0 ? <Text style={labelStyle}>{t`Nothing waiting`}</Text> : null}
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
              <View key={draft.id}>
                <Text style={labelStyle}>
                  {draft.recipient} · {draft.channel} · {draft.label}
                </Text>
                <Text style={labelStyle}>{draft.body}</Text>
                {actions.submit ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onSubmit(draft.id)}
                    style={{ minHeight: 48, justifyContent: "center" }}
                  >
                    <Text style={labelStyle}>{t`Submit`}</Text>
                  </Pressable>
                ) : null}
                {actions.approve ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onApprove(draft.id)}
                    style={{ minHeight: 48, justifyContent: "center" }}
                  >
                    <Text style={labelStyle}>{t`Approve`}</Text>
                  </Pressable>
                ) : null}
                {actions.cancel ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onCancel(draft.id)}
                    style={{ minHeight: 48, justifyContent: "center" }}
                  >
                    <Text style={labelStyle}>
                      {sendUndo && draft.status === "approved"
                        ? `${t`Undo`}${(() => {
                            const seconds = undoCountdown(draft.dispatchAfter, new Date());
                            return seconds !== null && seconds > 0 ? ` ${seconds}s` : "";
                          })()}`
                        : t`Cancel`}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })
        : null}
    </View>
  );
}

export function showApprovalQueue(enabled: boolean | undefined): boolean {
  return enabled === true;
}
