// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";

const { get, open, save, approve } = vi.hoisted(() => ({
  get: vi.fn(),
  open: vi.fn(),
  save: vi.fn(),
  approve: vi.fn(),
}));

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: (strings: TemplateStringsArray) => strings.join("") }),
  Trans: ({ children }: { children?: ReactNode }) => children,
}));

vi.mock("../lib/rpc", () => ({
  rpc: {
    drafts: {
      get,
      open,
      save,
      approve,
      list: vi.fn(),
      create: vi.fn(),
      export: vi.fn(),
      reject: vi.fn(),
    },
  },
}));

import { DraftReviewPage } from "./DraftReview";

const draft = {
  id: "draft-1",
  title: "Contrato",
  status: "in_review" as const,
  originalText: "paga la renta hoy",
  editedText: "paga la renta",
  model: "example-model",
  modelVersion: "2026-10-01",
  openedAt: new Date().toISOString(),
  requiredReviewMs: 60_000,
  serverNow: new Date().toISOString(),
  canApprove: true,
  linkedLawyerId: "lawyer-1",
  approverName: null,
  cardNumber: null,
  approvedAt: null,
  diff: [],
};

beforeEach(() => {
  get.mockReset();
  open.mockReset();
  save.mockReset();
  approve.mockReset();
  get.mockResolvedValue(draft);
  open.mockResolvedValue(draft);
  save.mockImplementation(async ({ editedText }: { editedText: string }) => ({
    ...draft,
    editedText,
  }));
});

async function render() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/app/drafts/draft-1"]}>
        <Routes>
          <Route path="/app/drafts/:draftId" element={<DraftReviewPage />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  return {
    container,
    cleanup: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

it("shows the agent draft beside the edit, and keeps approval closed until the review time ends", async () => {
  const { container, cleanup } = await render();
  try {
    expect(container.textContent).toContain("Agent draft");
    expect(container.textContent).toContain("Edited version");
    expect(container.textContent).toContain(
      "He revisado este borrador y asumo la responsabilidad profesional de su contenido",
    );
    expect(container.querySelector(".line-through")?.textContent).toContain("hoy");
    const button = container.querySelector<HTMLButtonElement>('[data-testid="draft-approve"]');
    if (!button) throw new Error("Missing approve button");
    expect(button.disabled).toBe(true);
    const box = container.querySelector<HTMLElement>('[data-testid="draft-confirmation"]');
    if (!box) throw new Error("Missing confirmation");
    await act(async () => {
      box.click();
    });
    expect(button.disabled).toBe(true);
    expect(approve).not.toHaveBeenCalled();
  } finally {
    await cleanup();
  }
});

it("approves only after the confirmation is checked and the review time has elapsed", async () => {
  const ready = {
    ...draft,
    openedAt: new Date(Date.now() - 120_000).toISOString(),
    requiredReviewMs: 60_000,
  };
  get.mockResolvedValue(ready);
  open.mockResolvedValue(ready);
  approve.mockResolvedValue({ ...ready, status: "approved" });
  const { container, cleanup } = await render();
  try {
    const button = container.querySelector<HTMLButtonElement>('[data-testid="draft-approve"]');
    const box = container.querySelector<HTMLElement>('[data-testid="draft-confirmation"]');
    if (!button || !box) throw new Error("Missing review controls");
    expect(button.disabled).toBe(true);
    await act(async () => {
      box.click();
    });
    expect(button.disabled).toBe(false);
    await act(async () => {
      button.click();
    });
    expect(approve).toHaveBeenCalledWith({
      draftId: "draft-1",
      lawyerId: "lawyer-1",
      editedText: "paga la renta",
      confirmation: true,
    });
  } finally {
    await cleanup();
  }
});
