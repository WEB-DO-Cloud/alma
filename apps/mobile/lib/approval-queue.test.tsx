// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

vi.mock("./native", () => ({
  useMobileTokens: () => ({
    foreground: "#FFFFFF",
    mutedForeground: "#EBEBF599",
    muted: "#202020",
    border: "#FCFCFC14",
  }),
}));
vi.mock("react-native", () => ({
  StyleSheet: { create: <T,>(styles: T) => styles },
  View: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  Text: ({ children, style }: { children?: ReactNode; style?: { color?: string } }) =>
    createElement("span", { "data-color": style?.color }, children),
  TextInput: ({
    style,
    placeholderTextColor,
  }: {
    style?: { color?: string; backgroundColor?: string };
    placeholderTextColor?: string;
  }) =>
    createElement("input", {
      "data-color": style?.color,
      "data-background": style?.backgroundColor,
      "data-placeholder-color": placeholderTextColor,
    }),
  Pressable: ({ children, onPress }: { children?: ReactNode; onPress?: () => void }) =>
    createElement("button", { type: "button", onClick: onPress }, children),
}));

import { ApprovalQueue, showApprovalQueue } from "./approval-queue";

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

it("approves a waiting draft and never says delivered", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const onApprove = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <ApprovalQueue
        actorUserId="owner"
        contexts={[{ id: "ctx-1", kind: "work", label: "Office", parentId: null, role: "owner" }]}
        contextId="ctx-1"
        drafts={[draft]}
        onSelectContext={() => undefined}
        onCreateContext={() => undefined}
        onCreateDraft={() => undefined}
        onSubmit={() => undefined}
        onApprove={onApprove}
        onCancel={() => undefined}
      />,
    );
  });
  expect(host.querySelector("span")?.getAttribute("data-color")).toBe("#FFFFFF");
  expect(host.querySelector("input")?.getAttribute("data-color")).toBe("#FFFFFF");
  expect(host.querySelector("input")?.getAttribute("data-placeholder-color")).toBe("#EBEBF599");
  expect(host.textContent).toContain("Hola");
  expect(host.textContent).toContain("waiting");
  expect(host.textContent?.toLowerCase()).not.toContain("delivered");
  const approve = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Approve",
  );
  await act(async () => {
    approve?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(onApprove).toHaveBeenCalledWith("draft-1");
  expect(showApprovalQueue(undefined)).toBe(false);
  expect(showApprovalQueue(true)).toBe(true);
  await act(async () => root.unmount());
  host.remove();
});
