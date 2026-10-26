import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { AlmaRow, AlmaScreen, almaColors } from "../components/alma-screen";
import { almaText } from "../lib/alma-copy";
import { isMockMode, setMockMode } from "../lib/alma-mock";
import { useI18n } from "../lib/i18n";

export default function AboutScreen() {
  const { locale } = useI18n();
  const router = useRouter();
  const [mock, setMock] = useState(isMockMode());

  return (
    <AlmaScreen title={almaText("about", locale)}>
      <Text style={styles.body}>{almaText("private", locale)}</Text>
      <Text style={styles.body}>{almaText("noAdvice", locale)}</Text>
      <Text style={styles.body}>{almaText("attribution", locale)}</Text>
      <Text style={styles.note}>do.alma.app</Text>
      <AlmaRow title={almaText("server", locale)} onPress={() => router.push("/server")} />
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: mock }}
        onPress={() => {
          const next = !mock;
          setMock(next);
          void setMockMode(next);
        }}
        style={styles.switchRow}
      >
        <Text style={styles.body}>
          {mock ? almaText("useServer", locale) : almaText("useExamples", locale)}
        </Text>
      </Pressable>
    </AlmaScreen>
  );
}

const styles = StyleSheet.create({
  body: { color: almaColors.foreground, fontSize: 16, lineHeight: 24 },
  note: { color: almaColors.mutedForeground, fontSize: 13, lineHeight: 18 },
  switchRow: {
    backgroundColor: almaColors.card,
    borderRadius: 16,
    padding: 16,
  },
});
