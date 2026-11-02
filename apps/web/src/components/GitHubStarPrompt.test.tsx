// @vitest-environment jsdom
import { act } from "react";
import { expect, it } from "vitest";
import { recordMessageSent } from "./GitHubStarPrompt";

it("does not ask for a GitHub star", async () => {
  for (let i = 0; i < 8; i++) await act(async () => recordMessageSent());
  expect(document.querySelector('[aria-label="Star on GitHub"]')).toBeNull();
  expect(document.body.innerHTML).not.toContain("github.com/elie222/rakazo");
});
