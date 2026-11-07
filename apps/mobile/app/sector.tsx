import { ALMA_WORK_SECTORS, almaLanguage, almaText } from "@rakazo/contracts";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { rpc } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";

/** Personal use first, then a sector. Skip leaves the assistant unchanged. */
export default function SectorStart() {
  const { locale, t } = useI18n();
  const tokens = useMobileTokens();
  const router = useRouter();
  const language = almaLanguage(locale);
  const [step, setStep] = useState<"use" | "sector">("use");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);

  async function save(use: "personal" | "work" | "skip", sector?: string) {
    if (pending) return;
    setPending(true);
    try {
      await rpc("onboarding/sector", { use, sector });
      router.replace("/");
    } catch {
      setPending(false);
    }
  }

  const rows = ALMA_WORK_SECTORS.filter((sector) =>
    almaText(sector.label, language).toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <ScrollView
      contentContainerStyle={{ padding: 24, gap: 12 }}
      style={{ flex: 1, backgroundColor: tokens.background }}
    >
      <Text style={{ color: tokens.foreground, fontSize: 28, fontWeight: "500" }}>
        {step === "use" ? t("What do you want ALMA for first?") : t("What kind of work?")}
      </Text>
      {step === "sector" ? (
        <TextInput
          value={query}
          onChangeText={setQuery}
          accessibilityLabel={t("Search")}
          style={{
            color: tokens.foreground,
            borderColor: tokens.border,
            borderWidth: 1,
            borderRadius: 8,
            padding: 10,
          }}
        />
      ) : null}
      {step === "use" ? (
        <>
          <Choice
            label={t("Personal use")}
            disabled={pending}
            onPress={() => void save("personal")}
          />
          <Choice label={t("Work")} disabled={pending} onPress={() => setStep("sector")} />
        </>
      ) : (
        rows.map((sector) => (
          <Choice
            key={sector.id}
            label={almaText(sector.label, language)}
            disabled={pending}
            onPress={() => void save("work", sector.id)}
          />
        ))
      )}
      <Choice label={t("Skip")} disabled={pending} onPress={() => void save("skip")} />
    </ScrollView>
  );
}

function Choice({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}>
      <View style={{ paddingVertical: 12 }}>
        <Text>{label}</Text>
      </View>
    </Pressable>
  );
}
