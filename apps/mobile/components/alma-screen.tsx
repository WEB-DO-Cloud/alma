import { darkTokens } from "@rakazo/ui-tokens";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { almaText } from "../lib/alma-copy";
import { isMockMode } from "../lib/alma-mock";
import { useI18n } from "../lib/i18n";

const ink = darkTokens;

export const almaColors = ink;

export function AlmaScreen({
  title,
  children,
  footer,
  scroll = true,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { locale } = useI18n();
  const body = scroll ? (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={styles.fill}>{children}</View>
  );
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        {router.canGoBack() ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={almaText("back", locale)}
            onPress={() => router.back()}
            style={styles.back}
          >
            <Text style={styles.backLabel}>{almaText("back", locale)}</Text>
          </Pressable>
        ) : null}
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {isMockMode() ? (
          <Text style={styles.sample}>{almaText("exampleData", locale)}</Text>
        ) : (
          <View />
        )}
      </View>
      {body}
      {footer ? <View style={{ paddingBottom: insets.bottom }}>{footer}</View> : null}
    </View>
  );
}

export function AlmaRow({
  title,
  detail,
  onPress,
}: {
  title: string;
  detail?: string;
  onPress?: () => void;
}) {
  const content = (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>{title}</Text>
      {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ink.background },
  fill: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  bar: { paddingHorizontal: 16, paddingBottom: 8, gap: 4 },
  back: { alignSelf: "flex-start", paddingVertical: 4 },
  backLabel: { color: ink.mutedForeground, fontSize: 15 },
  title: { color: ink.foreground, fontSize: 28, fontWeight: "600" },
  sample: { color: ink.warning, fontSize: 13 },
  row: {
    backgroundColor: ink.card,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
  },
  rowTitle: { color: ink.foreground, fontSize: 16 },
  rowDetail: { color: ink.mutedForeground, fontSize: 13 },
});
