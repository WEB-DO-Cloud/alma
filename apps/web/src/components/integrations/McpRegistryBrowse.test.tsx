// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { McpRegistryBrowse } from "./McpRegistryBrowse";

const search = vi.hoisted(() => vi.fn());
const add = vi.hoisted(() => vi.fn());

vi.mock("../../lib/rpc", () => ({
  rpc: { mcp: { registry: { search } } },
}));
vi.mock("../../lib/add-remote-mcp", () => ({
  addRemoteMcpServer: add,
}));
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
  useLingui: () => ({
    t: (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce(
        (text, part, index) => text + (index ? String(values[index - 1]) : "") + part,
        "",
      ),
  }),
}));
vi.mock("@rakazo/ui-web", async () => {
  const { createElement } = await import("react");
  return {
    Button: ({
      children,
      onClick,
      disabled,
    }: {
      children: ReactNode;
      onClick: () => void;
      disabled?: boolean;
    }) => createElement("button", { type: "button", onClick, disabled }, children),
    Input: ({
      value,
      onChange,
      "aria-label": label,
    }: {
      value: string;
      onChange: (event: { target: { value: string } }) => void;
      "aria-label": string;
    }) => createElement("input", { "aria-label": label, value, onChange }),
  };
});

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  search.mockReset();
  add.mockReset().mockResolvedValue({});
});

function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return {
    host,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

it("shows the curated remote servers before a search", () => {
  const view = render(
    <McpRegistryBrowse installedEndpoints={new Set()} onInstalled={() => undefined} />,
  );
  expect(view.host.textContent).toContain("Popular");
  expect(view.host.textContent).toContain("Gmail");
  expect(view.host.textContent).toContain("Notion");
  expect(view.host.textContent).toContain("gmail.mintmcp.com");
  expect(search).not.toHaveBeenCalled();
  view.unmount();
});

it("searches the registry after the field settles and adds the chosen remote", async () => {
  vi.useFakeTimers();
  search.mockResolvedValue({
    servers: [
      {
        registryName: "com.example/docs",
        name: "Docs",
        description: "Read the docs",
        iconUrl: null,
        transport: "sse",
        endpoint: "https://docs.example.test/mcp",
        needsHeader: false,
        headerName: null,
      },
    ],
  });
  const installed = vi.fn();
  const view = render(
    <McpRegistryBrowse showSearch installedEndpoints={new Set()} onInstalled={installed} />,
  );
  const input = view.host.querySelector("input");
  await act(async () => {
    input?.dispatchEvent(new Event("input", { bubbles: true }));
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, "docs");
    input?.dispatchEvent(new Event("input", { bubbles: true }));
    input?.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  expect(search).toHaveBeenCalledWith({ query: "docs", limit: 12 }, expect.any(Object));
  expect(view.host.textContent).toContain("SSE · https://docs.example.test/mcp");
  const addButton = [...view.host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Add"),
  );
  await act(async () => {
    addButton?.click();
  });
  expect(add).toHaveBeenCalledWith(
    expect.objectContaining({
      server: expect.objectContaining({
        endpoint: "https://docs.example.test/mcp",
        transport: "sse",
      }),
    }),
  );
  expect(installed).toHaveBeenCalled();
  view.unmount();
  vi.useRealTimers();
});
