/**
 * Linux account of the bot computer.
 *
 * Paths, the login and the hostname that a person can see (a file URL, the
 * shell prompt, a file chooser, a path the assistant repeats) use this name.
 * The previous home stays accepted, and the computer image links it here, so a
 * sandbox created before the rename still opens the files it already has.
 */

/** Login and hostname inside the computer. */
export const COMPUTER_LOGIN = "alma";

/** Home directory, and the portable workspace root, inside the computer. */
export const COMPUTER_HOME = "/home/alma";

/**
 * Home from before the account was renamed. Still a real path: the image
 * links it at the home, and Docker mounts the same directory at both.
 */
export const COMPUTER_HOME_LEGACY = "/home/rakazo";

const LEGACY_PREFIX = `${COMPUTER_HOME_LEGACY}/`;

/** Rewrite a legacy home path to the visible home. Any other path is unchanged. */
export function canonicalizeComputerHome(value: string): string {
  if (value === COMPUTER_HOME_LEGACY) return COMPUTER_HOME;
  if (value.startsWith(LEGACY_PREFIX)) {
    return COMPUTER_HOME + value.slice(COMPUTER_HOME_LEGACY.length);
  }
  return value;
}

/**
 * Environment of a command in the computer. HOME and PATH use the visible home
 * so `pwd`, a login shell and the file chooser do not show the previous name.
 */
export function computerHomeEnvironment(): string[] {
  return [
    `HOME=${COMPUTER_HOME}`,
    `PATH=${COMPUTER_HOME}/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
    `NPM_CONFIG_PREFIX=${COMPUTER_HOME}/.local`,
    "PIP_USER=1",
  ];
}
