import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AlmaRow, AlmaScreen, almaColors } from "../components/alma-screen";
import { almaText } from "../lib/alma-copy";
import { hydrateMockMode, isMockMode } from "../lib/alma-mock";
import { loadSessionToken } from "../lib/api";
import { useI18n } from "../lib/i18n";

export default function AlmaHome() {
  const { locale } = useI18n();
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(isMockMode());

  useEffect(() => {
    let active = true;
    void hydrateMockMode().then(async () => {
      if (isMockMode()) {
        if (active) setSignedIn(true);
        return;
      }
      const token = await loadSessionToken();
      if (active) setSignedIn(Boolean(token));
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <AlmaScreen title={almaText("alma", locale)}>
      <Text style={styles.lead}>{almaText("private", locale)}</Text>
      {!signedIn ? (
        <AlmaRow title={almaText("signIn", locale)} onPress={() => router.push("/sign-in")} />
      ) : null}
      <View style={styles.list}>
        <AlmaRow title={almaText("drafts", locale)} onPress={() => router.push("/drafts")} />
        <AlmaRow title={almaText("chat", locale)} onPress={() => router.push("/alma-chat")} />
        <AlmaRow
          title={almaText("computer", locale)}
          detail={almaText("readOnly", locale)}
          onPress={() => router.push("/alma-computer")}
        />
        <AlmaRow
          title={almaText("history", locale)}
          onPress={() => router.push("/draft-approvals")}
        />
        <AlmaRow title={almaText("firm", locale)} onPress={() => router.push("/firm")} />
        <AlmaRow title={almaText("about", locale)} onPress={() => router.push("/about")} />
      </View>
    </AlmaScreen>
  );
}

const styles = StyleSheet.create({
  lead: { color: almaColors.mutedForeground, fontSize: 15, lineHeight: 22 },
  list: { gap: 8 },
});
