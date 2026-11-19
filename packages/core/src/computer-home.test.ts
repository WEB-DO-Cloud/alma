import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  COMPUTER_HOME,
  COMPUTER_HOME_LEGACY,
  COMPUTER_LOGIN,
  canonicalizeComputerHome,
  computerHomeEnvironment,
} from "./computer-home.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("computer home", () => {
  it("names the visible account alma", () => {
    expect(COMPUTER_LOGIN).toBe("alma");
    expect(COMPUTER_HOME).toBe("/home/alma");
    expect(`${COMPUTER_LOGIN} ${COMPUTER_HOME}`).not.toMatch(/rakazo/i);
  });

  it("rewrites only the previous home", () => {
    expect(canonicalizeComputerHome(COMPUTER_HOME_LEGACY)).toBe(COMPUTER_HOME);
    expect(canonicalizeComputerHome(`${COMPUTER_HOME_LEGACY}/bots/bot-1/flyer/page.html`)).toBe(
      `${COMPUTER_HOME}/bots/bot-1/flyer/page.html`,
    );
    expect(canonicalizeComputerHome(`${COMPUTER_HOME}/notes`)).toBe(`${COMPUTER_HOME}/notes`);
    expect(canonicalizeComputerHome("/tmp/page.html")).toBe("/tmp/page.html");
    expect(canonicalizeComputerHome("/home/rakazotest/file.txt")).toBe("/home/rakazotest/file.txt");
  });

  it("puts the visible home on PATH and HOME", () => {
    expect(computerHomeEnvironment()).toEqual([
      "HOME=/home/alma",
      "PATH=/home/alma/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      "NPM_CONFIG_PREFIX=/home/alma/.local",
      "PIP_USER=1",
    ]);
  });

  it("keeps the image account, the link and the startup home in step", () => {
    const dockerfile = readFileSync(path.join(root, "infra/sandboxes/computer/Dockerfile"), "utf8");
    expect(dockerfile).toContain(
      "useradd --uid 1000 --gid alma --create-home --shell /bin/bash alma",
    );
    expect(dockerfile).toContain("ln -sfn /home/alma /home/rakazo");
    expect(dockerfile).toContain("ENV HOME=/home/alma");
    expect(dockerfile).not.toMatch(/useradd .* rakazo/);
    const start = readFileSync(path.join(root, "infra/sandboxes/computer/start.sh"), "utf8");
    expect(start).toContain("HOME:-/home/alma");
    const userEnv = readFileSync(path.join(root, "infra/sandboxes/computer/user-env.sh"), "utf8");
    expect(userEnv).toContain("alma:x:%s:%s:Computer:/home/alma:/bin/bash");
    expect(userEnv).not.toContain("rakazo");
  });
});
