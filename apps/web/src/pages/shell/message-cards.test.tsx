// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  begin: vi.fn(async () => ({ connectionId: "connection", authorizationUrl: null })),
  complete: vi.fn(async () => ({ status: "connected" })),
  drivePicker: vi.fn(async () => ({ url: "https://app.example.test/drive-picker.html#ticket" })),
  mark: vi.fn(async () => ({ ok: true })),
  oauthBegin: vi.fn(async () => ({
    status: "authorization_required" as const,
    authorizationUrl: "https://identity.example.test/authorize",
  })),
  approve: vi.fn(async () => ({ ok: true })),
}));
vi.mock("../../lib/rpc", () => ({
  rpc: {
    connections: { begin: calls.begin, complete: calls.complete, drivePicker: calls.drivePicker },
    onboarding: { appConnected: calls.mark },
    mcp: { oauth: { begin: calls.oauthBegin }, assignments: { approve: calls.approve } },
  },
}));
vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce((text, part, index) => text + (index ? values[index - 1] : "") + part, ""),
  }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));

import { connectMcpOauth } from "../../lib/mcp-connect";
import { AppConnectCard, McpApprovalCard } from "./message-cards";

function popupFlow({ focused }: { focused: boolean }) {
  const channels: FakeChannel[] = [];
  class FakeChannel {
    onmessage: ((event: MessageEvent) => void) | null = null;
    close = vi.fn();
    constructor(public name: string) {
      channels.push(this);
    }
  }
  // A popup on a COOP provider page reads as closed to the opener.
  const popup = { closed: true, close: vi.fn() };
  vi.stubGlobal("BroadcastChannel", FakeChannel);
  vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
  vi.spyOn(document, "hasFocus").mockReturnValue(focused);
  return { popup, channels };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("approves the bot after OAuth completes while a COOP popup keeps focus", async () => {
  vi.useFakeTimers();
  const { channels } = popupFlow({ focused: false });
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <McpApprovalCard
          botId="bot"
          threadId="thread"
          block={{
            kind: "mcp_approval",
            name: "Example",
            serverId: "server",
            transport: "streamable_http",
            endpoint: "https://example.test/mcp",
            needsOAuth: true,
            status: "pending",
          }}
        />,
      ),
    );
    await act(async () => host.querySelector("button")?.click());
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(calls.approve).not.toHaveBeenCalled();
    await act(async () =>
      channels[0]?.onmessage?.({ data: { type: "mcp-oauth-complete" } } as MessageEvent),
    );
    expect(calls.approve).toHaveBeenCalledExactlyOnceWith({
      botId: "bot",
      serverId: "server",
      threadId: "thread",
    });
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    await act(async () => root.unmount());
  }
});

it("cancels once the popup is closed and the app has focus again", async () => {
  vi.useFakeTimers();
  const { channels } = popupFlow({ focused: true });
  const flow = connectMcpOauth("server");
  await vi.advanceTimersByTimeAsync(500);
  await expect(flow).resolves.toBe("cancelled");
  expect(channels[0]?.close).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("authorizes a card in a normal chat and marks its thread connected", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <AppConnectCard
          botId="bot"
          threadId="normal-chat"
          block={{
            kind: "app_connect",
            connectorId: "fake",
            provider: "gmail",
            name: "Gmail",
            description: "",
            logo: null,
            status: "pending",
          }}
        />,
      ),
    );
    expect(host.querySelector("button")?.textContent).toBe("Connect");
    await act(async () => host.querySelector("button")?.click());
    expect(calls.mark).toHaveBeenCalledWith({
      botId: "bot",
      threadId: "normal-chat",
      connectorId: "fake",
      provider: "gmail",
    });
    expect(host.textContent).toContain("Connected");
    expect(host.querySelector("button")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("shows the Google notice before Connect and the file chooser only after", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const notice =
    "ALMA solo envía correos que apruebas en el chat. No lee tu bandeja.\n\nLimited Use. not used to train models.";
  try {
    await act(async () =>
      root.render(
        <AppConnectCard
          botId="bot"
          threadId="normal-chat"
          block={{
            kind: "app_connect",
            connectorId: "google",
            provider: "gmail",
            name: "Gmail",
            description: "Send email you approve.",
            logo: null,
            status: "pending",
            notice,
          }}
        />,
      ),
    );
    const paragraph = [...host.querySelectorAll("p")].find((node) =>
      node.textContent?.includes("No lee tu bandeja"),
    );
    const button = host.querySelector("button");
    expect(paragraph).toBeTruthy();
    expect(button).toBeTruthy();
    expect(paragraph?.textContent).toContain("Limited Use");
    if (!paragraph || !button) return;
    expect(paragraph.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    await act(async () => button?.click());
    expect(host.textContent).not.toContain("No lee tu bandeja");
    expect(host.textContent).toContain("Connected");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("opens the file chooser after Drive is connected", async () => {
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <AppConnectCard
          botId="bot"
          threadId="normal-chat"
          block={{
            kind: "app_connect",
            connectorId: "google",
            provider: "googledrive",
            name: "Google Drive",
            description: "Read files you choose.",
            logo: null,
            status: "connected",
            filePicker: true,
            notice: "hidden once connected",
          }}
        />,
      ),
    );
    expect(host.textContent).not.toContain("hidden once connected");
    const button = [...host.querySelectorAll("button")].find(
      (node) => node.textContent === "Elegir archivo",
    );
    expect(button?.getAttribute("aria-label")).toBe("Elegir archivo. Choose a file.");
    await act(async () => button?.click());
    expect(calls.drivePicker).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith(
      "https://app.example.test/drive-picker.html#ticket",
      "rakazo-drive-picker",
      "popup,width=960,height=720,noopener",
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("links OAuth failures in chat to the shared recovery guide without approving the server", async () => {
  calls.oauthBegin.mockRejectedValueOnce(
    Object.assign(new Error("Sign-in configuration mismatch"), {
      code: "MCP_OAUTH_REDIRECT_MISMATCH",
    }),
  );
  const approvalsBefore = calls.approve.mock.calls.length;
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <McpApprovalCard
          botId="bot"
          threadId="thread"
          block={{
            kind: "mcp_approval",
            name: "Example",
            serverId: "server",
            transport: "streamable_http",
            endpoint: "https://example.test/mcp",
            needsOAuth: true,
            status: "pending",
          }}
        />,
      ),
    );
    await act(async () => host.querySelector("button")?.click());
    expect(host.querySelector('[role="alert"] a')?.getAttribute("href")).toBe(
      "https://rakazo.com/docs/troubleshooting/#mcp-oauth-redirect-mismatch",
    );
    expect(calls.approve.mock.calls).toHaveLength(approvalsBefore);
    expect(host.querySelector("button")?.disabled).toBe(false);
  } finally {
    await act(async () => root.unmount());
  }
});
