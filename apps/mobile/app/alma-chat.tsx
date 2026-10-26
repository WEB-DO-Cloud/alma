import { ChatMarkdown } from "@rakazo/chat-ui/native";
import { darkTokens } from "@rakazo/ui-tokens";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlmaScreen, almaColors } from "../components/alma-screen";
import { almaText } from "../lib/alma-copy";
import type { MockChatMessage } from "../lib/alma-mock";
import { isMockMode, mockChat, mockSendChat } from "../lib/alma-mock";
import { rpc } from "../lib/api";
import { listen, stop as stopDictation } from "../lib/dictation";
import { useI18n } from "../lib/i18n";

function textOf(blocks: Array<{ kind: string; text?: string }>): string {
  return blocks
    .map((block) => (block.kind === "text" || block.kind === "ask" ? (block.text ?? "") : ""))
    .filter((text) => text.length > 0)
    .join("\n\n");
}

export default function AlmaChat() {
  const { locale } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<MockChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [botId, setBotId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (isMockMode()) {
      setMessages(mockChat());
      return () => {
        active = false;
      };
    }
    void rpc<{ current: { bots: Array<{ id: string }> } }>("spaces/list")
      .then(async (navigation) => {
        const id = navigation.current.bots[0]?.id ?? null;
        if (!active) return;
        setBotId(id);
        if (!id) return;
        const page = await rpc<{
          messages: Array<{
            id: string;
            role: string;
            blocks: Array<{ kind: string; text?: string }>;
          }>;
        }>("threads/messages", { botId: id });
        if (!active) return;
        setMessages(
          page.messages
            .map((message) => ({
              id: message.id,
              role: message.role === "user" ? "user" : "assistant",
              text: textOf(message.blocks),
            }))
            .filter((message) => message.text.length > 0) as MockChatMessage[],
        );
      })
      .catch(() => {
        if (active) setError(almaText("couldNotLoad", locale));
      });
    return () => {
      active = false;
      stopDictation();
    };
  }, [locale]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setDraft("");
    if (isMockMode()) {
      setMessages(mockSendChat(trimmed));
      return;
    }
    if (!botId) {
      router.push("/thread");
      return;
    }
    setMessages((current) => [
      ...current,
      { id: `local-${current.length}`, role: "user", text: trimmed },
    ]);
    try {
      await rpc("threads/send", { botId, text: trimmed, clientNonce: `alma-${Date.now()}` });
    } catch {
      setError(almaText("couldNotSave", locale));
    }
  }

  function dictate() {
    if (listening) {
      stopDictation();
      setListening(false);
      return;
    }
    setListening(true);
    void listen({
      lang: locale === "es" ? "es-DO" : "en-US",
      onInterim: setDraft,
      onFinal: (text) => {
        setListening(false);
        setDraft(text);
      },
      onGiveUp: () => setListening(false),
    });
  }

  return (
    <AlmaScreen
      title={almaText("chat", locale)}
      scroll
      footer={
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            accessibilityLabel={almaText("messagePlaceholder", locale)}
            onChangeText={setDraft}
            placeholder={almaText("messagePlaceholder", locale)}
            placeholderTextColor={almaColors.faintForeground}
            style={styles.input}
            value={draft}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={almaText("voice", locale)}
            onPress={dictate}
            style={styles.voice}
          >
            <Text style={styles.voiceLabel}>
              {listening ? almaText("listening", locale) : almaText("voice", locale)}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={almaText("send", locale)}
            onPress={() => void send(draft)}
            style={styles.send}
          >
            <Text style={styles.sendLabel}>{almaText("send", locale)}</Text>
          </Pressable>
        </View>
      }
    >
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {messages.length === 0 ? (
        <Text style={styles.empty}>{almaText("chatEmpty", locale)}</Text>
      ) : null}
      {messages.map((message) =>
        message.role === "assistant" ? (
          <View key={message.id} style={styles.assistant}>
            <ChatMarkdown colorScheme="dark" palette={darkTokens}>
              {message.text}
            </ChatMarkdown>
          </View>
        ) : (
          <View key={message.id} style={styles.user}>
            <Text style={styles.userText}>{message.text}</Text>
          </View>
        ),
      )}
      {botId ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/thread", params: { botId } })}
        >
          <Text style={styles.link}>{almaText("openChat", locale)}</Text>
        </Pressable>
      ) : null}
    </AlmaScreen>
  );
}

const styles = StyleSheet.create({
  empty: { color: almaColors.mutedForeground, fontSize: 15, lineHeight: 22 },
  assistant: {
    backgroundColor: almaColors.card,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  user: {
    alignSelf: "flex-end",
    backgroundColor: almaColors.chatUser,
    borderRadius: 18,
    maxWidth: "85%",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userText: { color: almaColors.chatUserForeground, fontSize: 16, lineHeight: 22 },
  error: { color: almaColors.destructive },
  link: { color: almaColors.link, fontSize: 15 },
  composer: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: almaColors.background,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    color: almaColors.foreground,
    backgroundColor: almaColors.card,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
  },
  voice: { justifyContent: "center", paddingHorizontal: 8, minHeight: 44 },
  voiceLabel: { color: almaColors.foreground, fontSize: 15 },
  send: {
    backgroundColor: almaColors.primary,
    borderRadius: 22,
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  sendLabel: { color: almaColors.primaryForeground, fontSize: 15, fontWeight: "600" },
});
