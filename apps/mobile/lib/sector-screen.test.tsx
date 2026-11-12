// @vitest-environment jsdom

import { tokensForAppearance } from "@rakazo/ui-tokens";
import type { ReactNode } from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import Sector from "../app/sector";

const screenOptions = vi.hoisted(() => ({ current: {} as { title?: string } }));
const dark = tokensForAppearance("dark");

vi.mock("expo-router", () => ({
  Stack: {
    Screen: ({ options }: { options: { title?: string } }) => {
      screenOptions.current = options;
      return null;
    },
  },
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("./api", () => ({ rpc: vi.fn() }));
vi.mock("./appearance", () => ({
  mobileTokens: () => ({ destructive: "#FF9592", link: "#459FFE" }),
}));
vi.mock("./i18n", () => ({ useUiLocale: () => "en" }));
vi.mock("./native", () => ({
  useMobileTokens: () => ({
    foreground: "#FFFFFF",
    background: "#141414",
    muted: "#202020",
    mutedForeground: "#EBEBF599",
    card: "#202020",
  }),
  useThemedStyles: (factory: () => unknown) => factory(),
  native: {
    label: "#FFFFFF",
    secondaryLabel: "#EBEBF599",
    tertiaryLabel: "#EBEBF573",
    fill: "#202020",
    fillPressed: "#78788052",
    separator: "#FCFCFC14",
    groupedCell: "#202020",
    groupedPage: "#141414",
  },
}));
vi.mock("../components/native-symbol", () => ({ NativeSymbol: () => null }));
vi.mock("../components/native-switch", () => ({ NativeSwitch: () => null }));
vi.mock("react-native", () => {
  function styleOf(style: unknown) {
    const resolved = typeof style === "function" ? style({ pressed: false }) : style;
    return JSON.stringify(resolved ?? null);
  }
  return {
    Platform: { OS: "android", select: (options: { android?: unknown }) => options.android },
    Pressable: ({
      children,
      disabled,
      onPress,
      style,
    }: {
      children?: ReactNode;
      disabled?: boolean;
      onPress?: () => void;
      style?: unknown;
    }) =>
      createElement(
        "button",
        {
          type: "button",
          disabled,
          "data-style": styleOf(style),
          onClick: () => {
            if (!disabled) onPress?.();
          },
        },
        children,
      ),
    ScrollView: ({
      children,
      style,
    }: {
      children?: ReactNode;
      style?: { backgroundColor?: string };
    }) => createElement("div", { "data-background": style?.backgroundColor }, children),
    StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 },
    Text: ({
      children,
      style,
      accessibilityRole,
    }: {
      children?: ReactNode;
      style?: unknown;
      accessibilityRole?: string;
    }) =>
      createElement("span", { role: accessibilityRole, "data-style": styleOf(style) }, children),
    TextInput: ({
      accessibilityLabel,
      placeholder,
      placeholderTextColor,
      style,
      onChangeText,
    }: {
      accessibilityLabel?: string;
      placeholder?: string;
      placeholderTextColor?: string;
      style?: unknown;
      onChangeText?: (value: string) => void;
    }) =>
      createElement("input", {
        "aria-label": accessibilityLabel,
        placeholder,
        "data-placeholder-color": placeholderTextColor,
        "data-style": styleOf(style),
        onChange: (event: { target: { value: string } }) => onChangeText?.(event.target.value),
      }),
    View: ({ children, style }: { children?: ReactNode; style?: unknown }) =>
      createElement("div", { "data-style": styleOf(style) }, children),
    useWindowDimensions: () => ({ width: 390, height: 800, fontScale: 1, scale: 2 }),
  };
});

function colorOf(element: Element | null | undefined) {
  const style = JSON.parse(element?.getAttribute("data-style") ?? "null") as
    | { color?: string; backgroundColor?: string }
    | Array<{ color?: string; backgroundColor?: string }>
    | null;
  const list = Array.isArray(style) ? style : [style];
  return list.find((item) => item?.color)?.color;
}

async function render() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(Sector));
  });
  return {
    host,
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  screenOptions.current = {};
});

it("paints the first question and its choices for dark mode and hides the route name", async () => {
  const view = await render();
  const heading = [...view.host.querySelectorAll("span")].find(
    (node) => node.textContent === "What do you want ALMA for first?",
  );
  const choice = [...view.host.querySelectorAll("span")].find(
    (node) => node.textContent === "Personal use",
  );
  expect(screenOptions.current.title).toBe("");
  expect(view.host.querySelector("div")?.getAttribute("data-background")).toBe(dark.background);
  expect(colorOf(heading)).toBe(dark.foreground);
  expect(colorOf(choice)).toBe(dark.foreground);
  expect(choice?.closest("button")).toBeTruthy();
  expect(view.host.querySelector("input")).toBeNull();
  await view.unmount();
});

it("shows a themed search field and sector rows for work", async () => {
  const view = await render();
  const work = [...view.host.querySelectorAll("button")].find(
    (button) => button.textContent === "Work",
  );
  await act(async () => {
    work?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const search = view.host.querySelector("input");
  const law = [...view.host.querySelectorAll("span")].find((node) => node.textContent === "Law");
  const searchStyle = JSON.parse(search?.getAttribute("data-style") ?? "null") as {
    color?: string;
    backgroundColor?: string;
  } | null;
  expect(view.host.textContent).toContain("What kind of work?");
  expect(search?.getAttribute("placeholder")).toBe("Search");
  expect(search?.getAttribute("data-placeholder-color")).toBe(dark.mutedForeground);
  expect(searchStyle?.color).toBe(dark.foreground);
  expect(searchStyle?.backgroundColor).toBe(dark.muted);
  expect(colorOf(law)).toBe(dark.foreground);
  await view.unmount();
});
