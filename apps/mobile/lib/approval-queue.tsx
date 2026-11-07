import type { OutboundDraft, WorkContext } from "@rakazo/contracts";
import { queueDraftActions } from "@rakazo/core";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useI18n } from "./i18n";

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
}) {
  const { t } = useI18n();
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
      <Text>{t("Queue")}</Text>
      {contexts.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          onPress={() => onSelectContext(item.id)}
        >
          <Text>{item.label}</Text>
        </Pressable>
      ))}
      <TextInput accessibilityLabel={t("Name")} value={name} onChangeText={setName} />
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          const label = name.trim();
          if (!label) return;
          onCreateContext("personal", label);
        }}
      >
        <Text>{t("Personal")}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          const label = name.trim();
          if (!label) return;
          onCreateContext("work", label);
        }}
      >
        <Text>{t("Work")}</Text>
      </Pressable>
      {compose ? (
        <View>
          <Text>{t("New draft")}</Text>
          <TextInput
            accessibilityLabel={t("Recipient")}
            value={recipient}
            onChangeText={setRecipient}
          />
          {channels.map((value) => (
            <Pressable key={value} accessibilityRole="button" onPress={() => setChannel(value)}>
              <Text>{value}</Text>
            </Pressable>
          ))}
          <TextInput accessibilityLabel={t("Message")} value={body} onChangeText={setBody} />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (!recipient.trim() || !body.trim()) return;
              onCreateDraft({ recipient: recipient.trim(), channel, body });
            }}
          >
            <Text>{t("Save")}</Text>
          </Pressable>
        </View>
      ) : null}
      {context && drafts.length === 0 ? <Text>{t("Nothing waiting")}</Text> : null}
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
                <Text>
                  {draft.recipient} · {draft.channel} · {draft.label}
                </Text>
                <Text>{draft.body}</Text>
                {actions.submit ? (
                  <Pressable accessibilityRole="button" onPress={() => onSubmit(draft.id)}>
                    <Text>{t("Submit")}</Text>
                  </Pressable>
                ) : null}
                {actions.approve ? (
                  <Pressable accessibilityRole="button" onPress={() => onApprove(draft.id)}>
                    <Text>{t("Approve")}</Text>
                  </Pressable>
                ) : null}
                {actions.cancel ? (
                  <Pressable accessibilityRole="button" onPress={() => onCancel(draft.id)}>
                    <Text>{t("Cancel")}</Text>
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
