import type {
  DraftApprovalLogEntry,
  OrganizationSettings,
  ReviewDraft,
  ReviewDraftSummary,
} from "@rakazo/contracts";
import { diffDraftText, reviewTimeSatisfied } from "@rakazo/core";
import { DRAFT_CONFIRMATION } from "./alma-review";

const MOCK_KEY = "alma.mock";

let override: boolean | null = null;
let storedMode: boolean | null = null;

export function mockModeFromEnv(env: Record<string, string | undefined> = process.env): boolean {
  const value = env.EXPO_PUBLIC_ALMA_MOCK?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function isMockMode(): boolean {
  if (override !== null) return override;
  if (storedMode !== null) return storedMode;
  return mockModeFromEnv();
}

export async function hydrateMockMode(): Promise<boolean> {
  if (override !== null) return override;
  try {
    const SecureStore = await import("expo-secure-store");
    const stored = await SecureStore.getItemAsync(MOCK_KEY);
    if (stored === "1" || stored === "0") storedMode = stored === "1";
  } catch {
    // Sample data still follows the env flag when storage is unavailable.
  }
  return isMockMode();
}

export async function setMockMode(on: boolean): Promise<void> {
  override = on;
  storedMode = on;
  try {
    const SecureStore = await import("expo-secure-store");
    await SecureStore.setItemAsync(MOCK_KEY, on ? "1" : "0");
  } catch {
    // The in-memory switch still applies for this launch.
  }
}

export function resetMockModeForTests(): void {
  override = null;
  storedMode = null;
}

export const SAMPLE_LAWYER_ID = "lawyer-ejemplo";

const originalDemand =
  "Datos de ejemplo. La señora Ejemplo solicita la entrega del inmueble ubicado en la calle Ejemplo, apto. 3A.";
const editedDemand =
  "Datos de ejemplo. La señora Ejemplo solicita la entrega del inmueble ubicado en la calle Ejemplo, apto. 3B.";

interface StoredDraft {
  id: string;
  title: string;
  status: ReviewDraft["status"];
  originalText: string;
  editedText: string;
  model: string;
  modelVersion: string;
  openedAt: string | null;
  requiredReviewMs: number;
  canApprove: boolean;
  linkedLawyerId: string | null;
  approverName: string | null;
  cardNumber: string | null;
  approvedAt: string | null;
}

function draftRecord(partial: StoredDraft): StoredDraft {
  return partial;
}

function seedDrafts(): StoredDraft[] {
  return [
    draftRecord({
      id: "draft-ejemplo",
      title: "Instancia de entrega",
      status: "generated",
      originalText: originalDemand,
      editedText: editedDemand,
      model: "ejemplo",
      modelVersion: "2026-10",
      openedAt: null,
      requiredReviewMs: 3_000,
      canApprove: true,
      linkedLawyerId: SAMPLE_LAWYER_ID,
      approverName: "Lcda. Ejemplo",
      cardNumber: "CARD-0000",
      approvedAt: null,
    }),
    draftRecord({
      id: "draft-lectura",
      title: "Resumen de audiencia",
      status: "in_review",
      originalText: "Datos de ejemplo. Resumen preparado por ALMA.",
      editedText: "Datos de ejemplo. Resumen preparado por ALMA.",
      model: "ejemplo",
      modelVersion: "2026-10",
      openedAt: new Date().toISOString(),
      requiredReviewMs: 60_000,
      canApprove: false,
      linkedLawyerId: null,
      approverName: null,
      cardNumber: null,
      approvedAt: null,
    }),
  ];
}

let drafts = seedDrafts();
let history: DraftApprovalLogEntry[] = [];

export function resetAlmaMock(): void {
  drafts = seedDrafts();
  history = [];
}

export function mockOrganization(): OrganizationSettings {
  return {
    legalName: "Bufete Ejemplo S.R.L.",
    tradeName: "Bufete Ejemplo",
    rnc: "101123456",
    addressLine: "Calle Ejemplo 1",
    cityProvince: "Santo Domingo",
    phone: "809-555-0100",
    email: "ejemplo@bufete.example",
    website: "https://example.com",
    bankName: "",
    bankAccount: "",
    invoiceFooter: "",
    minimumReviewSeconds: 60,
    accentColor: null,
    logo: null,
    lawyers: [
      {
        id: SAMPLE_LAWYER_ID,
        name: "Lcda. Ejemplo",
        cardNumber: "CARD-0000",
        email: "lcda@bufete.example",
        mayApproveDrafts: true,
      },
    ],
  };
}

export interface MockSpace {
  id: string;
  name: string;
}

export function mockSpaces(): MockSpace[] {
  return [
    { id: "space-ejemplo", name: "Bufete Ejemplo" },
    { id: "space-norte", name: "Bufete Ejemplo Norte" },
  ];
}

export interface MockTask {
  id: string;
  name: string;
}

export function mockTasks(): MockTask[] {
  return [{ id: "task-1", name: "Preparar borrador de instancia" }];
}

export interface MockChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

let chat: MockChatMessage[] = [
  {
    id: "m1",
    role: "assistant",
    text: "Datos de ejemplo. Puedo dejar un borrador listo para su revisión.",
  },
];

export function mockChat(): MockChatMessage[] {
  return chat.map((message) => ({ ...message }));
}

export function mockSendChat(text: string): MockChatMessage[] {
  chat = [
    ...chat,
    { id: `u-${chat.length}`, role: "user", text },
    {
      id: `a-${chat.length}`,
      role: "assistant",
      text: "Datos de ejemplo. Dejé el resultado en Borradores para revisión.",
    },
  ];
  return mockChat();
}

export function resetMockChat(): void {
  chat = [
    {
      id: "m1",
      role: "assistant",
      text: "Datos de ejemplo. Puedo dejar un borrador listo para su revisión.",
    },
  ];
}

function toReview(draft: StoredDraft, now = new Date()): ReviewDraft {
  return {
    id: draft.id,
    title: draft.title,
    status: draft.status,
    originalText: draft.originalText,
    editedText: draft.editedText,
    model: draft.model,
    modelVersion: draft.modelVersion,
    openedAt: draft.openedAt,
    requiredReviewMs: draft.requiredReviewMs,
    serverNow: now.toISOString(),
    canApprove: draft.canApprove,
    linkedLawyerId: draft.linkedLawyerId,
    approverName: draft.approverName,
    cardNumber: draft.cardNumber,
    approvedAt: draft.approvedAt,
    diff: diffDraftText(draft.originalText, draft.editedText),
  };
}

function requireDraft(id: string): StoredDraft {
  const draft = drafts.find((item) => item.id === id);
  if (!draft) throw new Error("Could not load drafts");
  return draft;
}

export function mockListDrafts(): ReviewDraftSummary[] {
  return drafts.map((draft) => ({
    id: draft.id,
    title: draft.title,
    status: draft.status,
    model: draft.model,
    modelVersion: draft.modelVersion,
    createdAt: "2026-10-26T14:00:00.000Z",
    approvedAt: draft.approvedAt,
  }));
}

export function mockGetDraft(id: string): ReviewDraft {
  return toReview(requireDraft(id));
}

export function mockOpenDraft(id: string, now = new Date()): ReviewDraft {
  const draft = requireDraft(id);
  if (draft.canApprove && draft.status !== "approved" && draft.status !== "rejected") {
    draft.status = "in_review";
    draft.openedAt = draft.openedAt ?? now.toISOString();
  }
  return toReview(draft, now);
}

export function mockSaveDraft(id: string, editedText: string): ReviewDraft {
  const draft = requireDraft(id);
  if (!draft.canApprove || draft.status === "approved" || draft.status === "rejected") {
    throw new Error("Could not save the draft");
  }
  draft.editedText = editedText;
  return toReview(draft);
}

export function mockApproveDraft(
  input: { draftId: string; lawyerId: string; editedText: string; confirmation: true },
  now = new Date(),
): ReviewDraft {
  const draft = requireDraft(input.draftId);
  if (!draft.canApprove || draft.linkedLawyerId !== input.lawyerId) {
    throw new Error("Could not save the draft");
  }
  if (input.confirmation !== true) throw new Error("Could not save the draft");
  if (
    !reviewTimeSatisfied(
      draft.openedAt ? new Date(draft.openedAt) : null,
      now,
      draft.requiredReviewMs,
    )
  ) {
    throw new Error("The minimum review time has not elapsed.");
  }
  draft.editedText = input.editedText;
  draft.status = "approved";
  draft.approvedAt = now.toISOString();
  history = [
    {
      id: `log-${history.length + 1}`,
      draftId: draft.id,
      approverLawyerId: input.lawyerId,
      approverName: draft.approverName ?? "",
      cardNumber: draft.cardNumber ?? "",
      userId: "user-ejemplo",
      openedAt: draft.openedAt ?? now.toISOString(),
      approvedAt: draft.approvedAt,
      reviewDurationMs: draft.openedAt ? now.getTime() - Date.parse(draft.openedAt) : 0,
      model: draft.model,
      modelVersion: draft.modelVersion,
      originalHash: "sample-original",
      finalHash: "sample-final",
      diff: diffDraftText(draft.originalText, draft.editedText),
      action: "approved",
      createdAt: now.toISOString(),
    },
    ...history,
  ];
  return toReview(draft, now);
}

export function mockRejectDraft(
  input: { draftId: string; lawyerId: string; editedText: string },
  now = new Date(),
): ReviewDraft {
  const draft = requireDraft(input.draftId);
  if (!draft.canApprove || draft.linkedLawyerId !== input.lawyerId) {
    throw new Error("Could not save the draft");
  }
  if (draft.status === "approved" || draft.status === "rejected") {
    throw new Error("Could not save the draft");
  }
  draft.editedText = input.editedText;
  draft.status = "rejected";
  history = [
    {
      id: `log-${history.length + 1}`,
      draftId: draft.id,
      approverLawyerId: input.lawyerId,
      approverName: draft.approverName ?? "",
      cardNumber: draft.cardNumber ?? "",
      userId: "user-ejemplo",
      openedAt: draft.openedAt ?? now.toISOString(),
      approvedAt: null,
      reviewDurationMs: 0,
      model: draft.model,
      modelVersion: draft.modelVersion,
      originalHash: "sample-original",
      finalHash: "sample-final",
      diff: diffDraftText(draft.originalText, draft.editedText),
      action: "rejected",
      createdAt: now.toISOString(),
    },
    ...history,
  ];
  return toReview(draft, now);
}

export function mockApprovalHistory(): DraftApprovalLogEntry[] {
  return history.map((entry) => ({ ...entry, diff: entry.diff.map((span) => ({ ...span })) }));
}

export const SAMPLE_CONFIRMATION = DRAFT_CONFIRMATION;
