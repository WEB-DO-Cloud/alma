import type { DraftApprovalLogEntry } from "@rakazo/contracts";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { AlmaRow, AlmaScreen, almaColors } from "../components/alma-screen";
import { listApprovalHistory } from "../lib/alma-client";
import { almaText } from "../lib/alma-copy";
import { useI18n } from "../lib/i18n";

export default function DraftApprovals() {
  const { locale } = useI18n();
  const [rows, setRows] = useState<DraftApprovalLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listApprovalHistory()
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
    <AlmaScreen title={almaText("history", locale)}>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: almaColors.destructive }}>
          {error}
        </Text>
      ) : null}
      {rows && rows.length === 0 ? (
        <Text style={{ color: almaColors.mutedForeground }}>
          {almaText("historyEmpty", locale)}
        </Text>
      ) : null}
      {rows?.map((row) => (
        <AlmaRow
          key={row.id}
          title={`${row.action === "approved" ? almaText("approvedBy", locale) : almaText("rejectedBy", locale)} ${row.approverName}`}
          detail={`${row.cardNumber} · ${row.createdAt}`}
        />
      ))}
    </AlmaScreen>
  );
}
