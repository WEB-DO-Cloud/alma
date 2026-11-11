// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import type { AgentSkillCatalogEntry } from "@rakazo/contracts";
import type { ComposerMention } from "@rakazo/core";
import type { ComponentProps, ReactNode } from "react";
import { act, createRef } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@lingui/react/macro", () => {
  const t = (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce((text, part, index) => `${text}${index > 0 ? values[index - 1] : ""}${part}`, "");
  return { useLingui: () => ({ t }), Trans: ({ children }: { children: ReactNode }) => children };
});

const me = vi.hoisted(() => vi.fn(async () => ({ mobileActionsEnabled: true })));
vi.mock("../../lib/rpc", () => ({ rpc: { me } }));

import { Composer } from "./composer";

beforeEach(() => {
  i18n.load("en", {});
  i18n.activate("en");
  me.mockClear();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const bob: ComposerMention = { kind: "bot", id: "bot-2", name: "Bob" };
const summarize: AgentSkillCatalogEntry = {
  id: "skill-1",
  name: "summarize",
  description: "Summarize a document",
  source: "user",
  readOnly: false,
};

function buttonNames(): string[] {
  return [...(container?.querySelectorAll("button") ?? [])].map(
    (button) => button.textContent?.trim() || button.getAttribute("aria-label") || "",
  );
}

it("keeps Attach file and does not show Camera, Share, or Voice note", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia ??= () =>
    ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const props: ComponentProps<typeof Composer> = {
    artifactTarget: { botId: "bot-1" },
    activeName: "Ada",
    running: false,
    pendingAttachments: [],
    attachmentNotice: null,
    sendError: null,
    onOpenModels: () => {},
    onOpenConnections: () => {},
    onOpenBilling: () => {},
    runError: null,
    runErrorId: null,
    onRunErrorPresented: () => {},
    onDismissError: () => {},
    sending: false,
    fileInputRef: createRef(),
    onAttachmentPick: () => true,
    onRemoveAttachment: () => {},
    onSend: async () => true,
    onStop: async () => {},
    draftKey: "bot:bot-1",
    enterToSend: true,
    mentionTargets: [bob],
    agentSkills: [summarize],
  };
  act(() => root?.render(<Composer {...props} />));
  const names = buttonNames();
  expect(names).toContain("Attach file");
  expect(names).not.toContain("Camera");
  expect(names).not.toContain("Share");
  expect(names).not.toContain("Voice note");
});
