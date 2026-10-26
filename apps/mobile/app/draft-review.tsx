import type { DraftDiffSpan, ReviewDraft } from "@rakazo/contracts";
import { diffDraftText } from "@rakazo/core";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { AlmaScreen, almaColors } from "../components/alma-screen";
import {
  approveReviewDraft,
  openReviewDraft,
  rejectReviewDraft,
  saveReviewDraft,
} from "../lib/alma-client";
import { almaText } from "../lib/alma-copy";
import {
  DRAFT_CONFIRMATION,
  formatReviewClock,
  remainingReviewSeconds,
  reviewGate,
} from "../lib/alma-review";
import { useI18n } from "../lib/i18n";

function DiffText({ spans, side }: { spans: DraftDiffSpan[]; side: "original" | "edited" }) {
  return (
    <Text style={styles.diff}>
      {spans.map((span, index) => {
        if (side === "original" && span.type === "insert") return null;
        if (side === "edited" && span.type === "delete") return null;
        const highlight =
          span.type === "delete" ? styles.delete : span.type === "insert" ? styles.insert : null;
        return (
          <Text key={index} style={highlight}>
            {span.text}
          </Text>
        );
      })}
    </Text>
  );
}

export default function DraftReviewScreen() {
  const { draftId } = useLocalSearchParams<{ draftId?: string }>();
  const { locale } = useI18n();
  const wide = useWindowDimensions().width >= 720;
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [edited, setEdited] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [side, setSide] = useState<"original" | "edited" | "both">("both");

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!draftId) return;
    let active = true;
    openReviewDraft(draftId)
      .then((opened) => {
        if (!active) return;
        setDraft(opened);
        setEdited(opened.editedText);
      })
      .catch(() => {
        if (active) setError(almaText("couldNotLoad", locale));
      });
    return () => {
      active = false;
    };
  }, [draftId, locale]);

  useEffect(() => {
    if (!draft?.canApprove || draft.status === "approved" || draft.status === "rejected") return;
    if (edited === draft.editedText) return;
    const handle = setTimeout(() => {
      void saveReviewDraft(draft.id, edited)
        .then((saved) => setDraft(saved))
        .catch(() => setError(almaText("couldNotSave", locale)));
    }, 500);
    return () => clearTimeout(handle);
  }, [draft, edited, locale]);

  const remaining = draft
    ? remainingReviewSeconds({
        openedAt: draft.openedAt,
        requiredReviewMs: draft.requiredReviewMs,
        nowMs: now,
      })
    : 0;
  const gate = draft
    ? reviewGate({
        canApprove: draft.canApprove,
        status: draft.status,
        confirmed,
        remainingSeconds: remaining,
        lawyerId: draft.linkedLawyerId,
        pending,
      })
    : null;
  const spans = draft ? diffDraftText(draft.originalText, edited) : [];
  const finished = draft?.status === "approved" || draft?.status === "rejected";

  async function approve() {
    if (!draft?.linkedLawyerId || !gate?.approve) return;
    setPending(true);
    setError(null);
    try {
      setDraft(
        await approveReviewDraft({
          draftId: draft.id,
          lawyerId: draft.linkedLawyerId,
          editedText: edited,
          confirmation: true,
        }),
      );
    } catch {
      setError(almaText("timerBlocked", locale));
    } finally {
      setPending(false);
    }
  }

  async function reject() {
    if (!draft?.linkedLawyerId || !gate?.reject) return;
    setPending(true);
    setError(null);
    try {
      setDraft(
        await rejectReviewDraft({
          draftId: draft.id,
          lawyerId: draft.linkedLawyerId,
          editedText: edited,
        }),
      );
    } catch {
      setError(almaText("couldNotSave", locale));
    } finally {
      setPending(false);
    }
  }

  return (
    <AlmaScreen
      title={draft?.title ?? almaText("review", locale)}
      footer={
        gate &&
        (gate.approve || gate.reject || gate.block === "timer" || gate.block === "confirmation") ? (
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !gate.approve }}
              disabled={!gate.approve}
              onPress={() => void approve()}
              style={[styles.approve, !gate.approve && styles.disabled]}
            >
              <Text style={styles.approveLabel}>
                {almaText("approve", locale)}
                {remaining > 0 ? ` ${formatReviewClock(remaining)}` : ""}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !gate.reject }}
              disabled={!gate.reject}
              onPress={() => void reject()}
              style={styles.reject}
            >
              <Text style={styles.rejectLabel}>{almaText("reject", locale)}</Text>
            </Pressable>
          </View>
        ) : null
      }
    >
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {draft ? (
        <>
          {draft.approverName ? (
            <Text style={styles.meta}>
              {almaText("responsible", locale)} · {draft.approverName}
              {draft.cardNumber ? ` · ${almaText("card", locale)} ${draft.cardNumber}` : ""}
            </Text>
          ) : null}
          <Text style={styles.meta}>
            {almaText("remaining", locale)} {formatReviewClock(remaining)}
          </Text>
          {!wide ? (
            <View style={styles.toggle}>
              {(["original", "edited", "both"] as const).map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: side === value }}
                  onPress={() => setSide(value)}
                  style={[styles.toggleItem, side === value && styles.toggleOn]}
                >
                  <Text style={[styles.toggleLabel, side === value && styles.toggleLabelOn]}>
                    {almaText(value === "both" ? "both" : value, locale)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={wide ? styles.columns : styles.stack}>
            {wide || side !== "edited" ? (
              <View style={styles.pane}>
                <Text style={styles.paneTitle}>{almaText("agentDraft", locale)}</Text>
                <DiffText spans={spans} side="original" />
              </View>
            ) : null}
            {wide || side !== "original" ? (
              <View style={styles.pane}>
                <Text style={styles.paneTitle}>{almaText("edited", locale)}</Text>
                <DiffText spans={spans} side="edited" />
                <TextInput
                  accessibilityLabel={almaText("edited", locale)}
                  editable={Boolean(draft.canApprove) && !finished}
                  multiline
                  onChangeText={setEdited}
                  style={styles.editor}
                  value={edited}
                />
              </View>
            ) : null}
          </View>
          {draft.canApprove && !finished ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: confirmed }}
              onPress={() => setConfirmed((value) => !value)}
              style={styles.confirm}
            >
              <View style={[styles.box, confirmed && styles.boxOn]} />
              <Text style={styles.confirmLabel}>{DRAFT_CONFIRMATION}</Text>
            </Pressable>
          ) : null}
          {draft.status === "approved" && draft.approverName ? (
            <Text style={styles.meta}>
              {almaText("approvedBy", locale)} {draft.approverName}
            </Text>
          ) : null}
        </>
      ) : null}
    </AlmaScreen>
  );
}

const styles = StyleSheet.create({
  error: { color: almaColors.destructive, fontSize: 14 },
  meta: { color: almaColors.mutedForeground, fontSize: 13 },
  toggle: { flexDirection: "row", gap: 8 },
  toggleItem: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: almaColors.card,
  },
  toggleOn: { backgroundColor: almaColors.primary },
  toggleLabel: { color: almaColors.foreground, fontSize: 13 },
  toggleLabelOn: { color: almaColors.primaryForeground },
  columns: { flexDirection: "row", gap: 12 },
  stack: { gap: 12 },
  pane: {
    flexGrow: 1,
    flexBasis: 0,
    backgroundColor: almaColors.card,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  paneTitle: { color: almaColors.mutedForeground, fontSize: 13 },
  diff: { color: almaColors.foreground, fontSize: 15, lineHeight: 22 },
  delete: { color: almaColors.destructive, textDecorationLine: "line-through" },
  insert: { backgroundColor: almaColors.success, color: almaColors.background },
  editor: {
    minHeight: 120,
    color: almaColors.foreground,
    fontSize: 15,
    lineHeight: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: almaColors.border,
    paddingTop: 8,
  },
  confirm: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: almaColors.foreground,
    marginTop: 2,
  },
  boxOn: { backgroundColor: almaColors.foreground },
  confirmLabel: { color: almaColors.foreground, flex: 1, fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: "row", gap: 8, padding: 16 },
  approve: {
    flex: 1,
    backgroundColor: almaColors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  approveLabel: { color: almaColors.primaryForeground, fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.4 },
  reject: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: almaColors.border,
    alignItems: "center",
  },
  rejectLabel: { color: almaColors.foreground, fontSize: 16 },
});
