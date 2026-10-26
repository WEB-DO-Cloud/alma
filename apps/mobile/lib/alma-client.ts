import type {
  DraftApprovalLogEntry,
  OrganizationSettings,
  ReviewDraft,
  ReviewDraftSummary,
} from "@rakazo/contracts";
import type { MockSpace, MockTask } from "./alma-mock";
import {
  isMockMode,
  mockApprovalHistory,
  mockApproveDraft,
  mockListDrafts,
  mockOpenDraft,
  mockOrganization,
  mockRejectDraft,
  mockSaveDraft,
  mockSpaces,
  mockTasks,
} from "./alma-mock";
import type { MobileSpaceNavigation } from "./api";
import { rpc, selectSpace } from "./api";

export type { MockSpace, MockTask };

export async function listReviewDrafts(): Promise<ReviewDraftSummary[]> {
  if (isMockMode()) return mockListDrafts();
  return rpc<ReviewDraftSummary[]>("drafts/list", {});
}

export async function openReviewDraft(draftId: string): Promise<ReviewDraft> {
  if (isMockMode()) return mockOpenDraft(draftId);
  const current = await rpc<ReviewDraft>("drafts/get", { draftId });
  if (current.canApprove && current.status !== "approved" && current.status !== "rejected") {
    return rpc<ReviewDraft>("drafts/open", { draftId });
  }
  return current;
}

export async function saveReviewDraft(draftId: string, editedText: string): Promise<ReviewDraft> {
  if (isMockMode()) return mockSaveDraft(draftId, editedText);
  return rpc<ReviewDraft>("drafts/save", { draftId, editedText });
}

export async function approveReviewDraft(input: {
  draftId: string;
  lawyerId: string;
  editedText: string;
  confirmation: true;
}): Promise<ReviewDraft> {
  if (isMockMode()) return mockApproveDraft(input);
  return rpc<ReviewDraft>("drafts/approve", input);
}

export async function rejectReviewDraft(input: {
  draftId: string;
  lawyerId: string;
  editedText: string;
}): Promise<ReviewDraft> {
  if (isMockMode()) return mockRejectDraft(input);
  return rpc<ReviewDraft>("drafts/reject", input);
}

export async function listApprovalHistory(): Promise<DraftApprovalLogEntry[]> {
  if (isMockMode()) return mockApprovalHistory();
  return rpc<DraftApprovalLogEntry[]>("draftApprovals/list", {});
}

export async function loadFirm(): Promise<OrganizationSettings> {
  if (isMockMode()) return mockOrganization();
  return rpc<OrganizationSettings>("organization/get");
}

export async function loadFirmSpaces(): Promise<{ currentId: string | null; spaces: MockSpace[] }> {
  if (isMockMode()) {
    const spaces = mockSpaces();
    return { currentId: spaces[0]?.id ?? null, spaces };
  }
  const navigation = await rpc<MobileSpaceNavigation>("spaces/list");
  return {
    currentId: navigation.current.id,
    spaces: navigation.spaces.map((space) => ({ id: space.id, name: space.name })),
  };
}

export async function chooseFirmSpace(spaceId: string): Promise<void> {
  if (isMockMode()) return;
  await selectSpace(spaceId);
}

export async function loadComputerTasks(botId: string): Promise<MockTask[]> {
  if (isMockMode()) return mockTasks();
  const routines = await rpc<Array<{ id: string; name: string }>>("routines/list", { botId });
  return routines.map((routine) => ({ id: routine.id, name: routine.name }));
}

export async function stopAlmaComputer(botId: string): Promise<void> {
  if (isMockMode()) return;
  await rpc("threads/stop", { botId }).catch(() => undefined);
  await rpc("computer/stop", { botId });
}
