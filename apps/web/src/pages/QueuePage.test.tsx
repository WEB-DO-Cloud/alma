// @vitest-environment jsdom

import type { ComponentProps, ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";

const phase2a = vi.hoisted(() => ({
  contexts: { list: vi.fn(), create: vi.fn() },
  drafts: {
    list: vi.fn(),
    create: vi.fn(),
    submit: vi.fn(),
    approve: vi.fn(),
    cancel: vi.fn(),
    edit: vi.fn(),
  },
}));
vi.mock("../lib/rpc", () => ({
  rpc: {
    me: vi.fn(async () => ({ userId: "owner" })),
    phase2a,
  },
}));
vi.mock("@lingui/react/macro", () => {
  const t = (parts: TemplateStringsArray) => parts.join("");
  return { useLingui: () => ({ t }), Trans: ({ children }: { children: ReactNode }) => children };
});
vi.mock("@rakazo/ui-web", () => ({
  Button: (props: ComponentProps<"button">) => <button type="button" {...props} />,
}));

import { QueuePage } from "./QueuePage";

const draft = {
  id: "draft-1",
  contextId: "ctx-1",
  recipient: "ada@example.test",
  channel: "email" as const,
  body: "Hola",
  attachmentIds: [],
  status: "pending" as const,
  label: "waiting" as const,
  dispatchAfter: null,
  createdByUserId: "junior",
  creatorRole: "assistant" as const,
};

beforeEach(() => {
  phase2a.contexts.list.mockResolvedValue([
    { id: "ctx-1", kind: "work", label: "Office", parentId: null, role: "owner" },
  ]);
  phase2a.drafts.list.mockResolvedValue([draft]);
  phase2a.drafts.approve.mockResolvedValue({ ...draft, status: "approved", label: "waiting" });
});

it("approves a waiting draft and never says delivered", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<QueuePage />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(host.textContent).toContain("Hola");
  expect(host.textContent).toContain("waiting");
  expect(host.textContent?.toLowerCase()).not.toContain("delivered");
  const approve = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Approve",
  );
  expect(approve).toBeTruthy();
  await act(async () => {
    approve?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(phase2a.drafts.approve).toHaveBeenCalledWith({ id: "draft-1" });
  await act(async () => root.unmount());
  host.remove();
});
