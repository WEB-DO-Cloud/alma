import type { DraftStatus, ReviewDraftSummary } from "@rakazo/contracts";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { AlmaRow, AlmaScreen, almaColors } from "../components/alma-screen";
import { listReviewDrafts } from "../lib/alma-client";
import type { AlmaCopyKey } from "../lib/alma-copy";
import { almaText } from "../lib/alma-copy";
import { useI18n } from "../lib/i18n";

const statusKey: Record<DraftStatus, AlmaCopyKey> = {
  generated: "generated",
  in_review: "inReview",
  approved: "approved",
  rejected: "rejected",
};

export default function DraftInbox() {
  const { locale } = useI18n();
  const router = useRouter();
  const [rows, setRows] = useState<ReviewDraftSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listReviewDrafts()
      .then((list) => {
        if (active) setRows(list);
      })
      .catch(() => {
        if (active) setError(almaText("couldNotLoad", locale));
      });
    return () => {
      active = false;
    };
  }, [locale]);

  return (
    <AlmaScreen title={almaText("drafts", locale)}>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: almaColors.destructive }}>
          {error}
        </Text>
      ) : null}
      {rows && rows.length === 0 ? (
        <Text style={{ color: almaColors.mutedForeground }}>{almaText("draftsEmpty", locale)}</Text>
      ) : null}
      {rows?.map((row) => (
        <AlmaRow
          key={row.id}
          title={row.title}
          detail={almaText(statusKey[row.status], locale)}
          onPress={() => router.push({ pathname: "/draft-review", params: { draftId: row.id } })}
        />
      ))}
    </AlmaScreen>
  );
}
