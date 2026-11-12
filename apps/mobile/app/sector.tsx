import { useLingui } from "@lingui/react/macro";
import { ALMA_WORK_SECTORS, almaLanguage, almaText } from "@rakazo/contracts";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text } from "react-native";
import { ListSearchInput } from "../components/list-search-input";
import { SettingsGroup, SettingsRow } from "../components/settings-group";
import { rpc } from "../lib/api";
import { useUiLocale } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";

/** Personal use first, then a sector. Skip leaves the assistant unchanged. */
export default function SectorStart() {
  const { t } = useLingui();
  const locale = useUiLocale();
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
    <>
      <Stack.Screen options={{ title: "" }} />
      <ScrollView
        contentContainerStyle={{ padding: 24, gap: 20 }}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1, backgroundColor: tokens.background }}
      >
        <Text
          accessibilityRole="header"
          style={{ color: tokens.foreground, fontSize: 28, fontWeight: "500" }}
        >
          {step === "use" ? t`What do you want ALMA for first?` : t`What kind of work?`}
        </Text>
        {step === "sector" ? <ListSearchInput query={query} setQuery={setQuery} /> : null}
        <SettingsGroup>
          {step === "use" ? (
            <>
              <SettingsRow
                disabled={pending}
                dimmed={pending}
                onPress={() => void save("personal")}
                title={t`Personal use`}
              />
              <SettingsRow
                disabled={pending}
                dimmed={pending}
                onPress={() => setStep("sector")}
                title={t`Work`}
              />
            </>
          ) : (
            rows.map((sector) => (
              <SettingsRow
                key={sector.id}
                disabled={pending}
                dimmed={pending}
                onPress={() => void save("work", sector.id)}
                title={almaText(sector.label, language)}
              />
            ))
          )}
          <SettingsRow
            disabled={pending}
            dimmed={pending}
            onPress={() => void save("skip")}
            title={t`Skip`}
          />
        </SettingsGroup>
      </ScrollView>
    </>
  );
}
