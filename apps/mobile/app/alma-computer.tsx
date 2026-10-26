import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { AlmaScreen, almaColors } from "../components/alma-screen";
import { loadComputerTasks, stopAlmaComputer } from "../lib/alma-client";
import { almaText } from "../lib/alma-copy";
import type { MockTask } from "../lib/alma-mock";
import { isMockMode } from "../lib/alma-mock";
import { currentApiBase, rpc } from "../lib/api";
import { embeddableScreenUrl } from "../lib/computer";
import { useI18n } from "../lib/i18n";

export default function AlmaComputer() {
  const { locale } = useI18n();
  const [botId, setBotId] = useState<string | null>(isMockMode() ? "bot-ejemplo" : null);
  const [tasks, setTasks] = useState<MockTask[]>([]);
  const [screenUrl, setScreenUrl] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      let id = botId;
      if (!isMockMode()) {
        const navigation = await rpc<{ current: { bots: Array<{ id: string }> } }>("spaces/list");
        id = navigation.current.bots[0]?.id ?? null;
        if (!active) return;
        setBotId(id);
      }
      if (!id) return;
      const nextTasks = await loadComputerTasks(id);
      if (!active) return;
      setTasks(nextTasks);
      if (isMockMode()) return;
      const screen = await rpc<{ url: string | null }>("computer/screenUrl", { botId: id });
      if (!active) return;
      setScreenUrl(embeddableScreenUrl(screen.url, currentApiBase()));
    }
    load().catch(() => {
      if (active) setError(almaText("couldNotLoad", locale));
    });
    return () => {
      active = false;
    };
  }, [botId, locale]);

  async function stop() {
    if (!botId || pending) return;
    setPending(true);
    setError(null);
    try {
      await stopAlmaComputer(botId);
      setStopped(true);
      setScreenUrl(null);
    } catch {
      setError(almaText("couldNotSave", locale));
    } finally {
      setPending(false);
    }
  }

  return (
    <AlmaScreen
      title={almaText("computer", locale)}
      scroll={false}
      footer={
        <View style={styles.stopBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={almaText("stop", locale)}
            disabled={pending || stopped}
            onPress={() => void stop()}
            style={[styles.stop, (pending || stopped) && styles.disabled]}
          >
            <Text style={styles.stopLabel}>
              {stopped ? almaText("stopped", locale) : almaText("stop", locale)}
            </Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.body}>
        <Text style={styles.readOnly}>{almaText("readOnly", locale)}</Text>
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <View style={styles.screen}>
          {screenUrl && !stopped ? (
            <View pointerEvents="none" style={styles.screen}>
              <WebView source={{ uri: screenUrl }} style={styles.screen} />
            </View>
          ) : (
            <View style={styles.placeholder}>
              {pending ? <ActivityIndicator color={almaColors.foreground} /> : null}
              <Text style={styles.placeholderText}>
                {stopped ? almaText("stopped", locale) : almaText("noScreen", locale)}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.tasks}>{almaText("tasks", locale)}</Text>
        {tasks.map((task) => (
          <Text key={task.id} style={styles.task}>
            {task.name}
          </Text>
        ))}
      </View>
    </AlmaScreen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: 16, gap: 10 },
  readOnly: { color: almaColors.mutedForeground, fontSize: 13 },
  error: { color: almaColors.destructive },
  screen: {
    flex: 1,
    minHeight: 220,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: almaColors.card,
  },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  placeholderText: { color: almaColors.mutedForeground, textAlign: "center" },
  tasks: { color: almaColors.foreground, fontSize: 13 },
  task: { color: almaColors.foreground, fontSize: 16 },
  stopBar: { padding: 16 },
  stop: {
    backgroundColor: almaColors.destructiveFill,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  stopLabel: { color: almaColors.destructiveForeground, fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.5 },
});
