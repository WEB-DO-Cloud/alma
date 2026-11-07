import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { captureScreenshot, completeOnboarding, signup } from "./helpers";

const phone = { width: 390, height: 844 };
// Headless Chromium has no Android IME. Chrome on Android shrinks the layout
// viewport only when `viewportContent` asks it to. This height is that shrink.
const keyboardOpen = { width: 390, height: 420 };
const viewportContent =
  "width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content";

test.use({ hasTouch: true, isMobile: true, viewport: phone });

async function composerFits(page: Page, viewportHeight: number) {
  const bar = page.getByTestId("composer-bar");
  await expect(page.getByRole("combobox", { name: /^Message/ })).toBeFocused();
  await expect(bar).toBeInViewport({ ratio: 1 });
  await expect
    .poll(async () => {
      const box = await bar.boundingBox();
      const shell = await page.getByTestId("shell-root").boundingBox();
      if (!box || !shell) return "missing";
      const bottom = box.y + box.height;
      if (box.height < 44) return `short ${Math.round(box.height)}`;
      if (box.y < 0) return `above ${Math.round(box.y)}`;
      if (bottom > viewportHeight + 1) return `below ${Math.round(bottom)}`;
      if (bottom <= viewportHeight - 48) return `not docked ${Math.round(bottom)}`;
      if (Math.abs(shell.height - viewportHeight) > 1) return `shell ${Math.round(shell.height)}`;
      return "ok";
    })
    .toBe("ok");
}

test("the phone composer stays on screen when the layout viewport shrinks for the keyboard", async ({
  page,
}, testInfo) => {
  await signup(page, `android-keyboard-${Date.now()}@rakazo.test`, "password12", "Keyboard Test");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", viewportContent);
  await completeOnboarding(page);

  await page.getByRole("combobox", { name: /^Message/ }).focus();
  await composerFits(page, phone.height);

  await page.setViewportSize(keyboardOpen);
  await composerFits(page, keyboardOpen.height);
  await captureScreenshot(page, testInfo, "android-keyboard-composer");
});
