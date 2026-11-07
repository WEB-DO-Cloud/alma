export type MailConnectorTarget = "gmail" | "outlook";

const GMAIL_ITEM_KEYS = new Set(["gmail", "googlemail"]);
const OUTLOOK_ITEM_KEYS = new Set(["outlook", "hotmail", "microsoftoutlook"]);

const QUERY_TARGETS: ReadonlyArray<readonly [string, readonly MailConnectorTarget[]]> = [
  ["gmail", ["gmail"]],
  ["googlemail", ["gmail"]],
  ["googleworkspace", ["gmail"]],
  ["gsuite", ["gmail"]],
  ["outlook", ["outlook"]],
  ["hotmail", ["outlook"]],
  ["microsoftoutlook", ["outlook"]],
  ["microsoft365", ["outlook"]],
  ["office365", ["outlook"]],
  ["m365", ["outlook"]],
  ["livemail", ["outlook"]],
  ["email", ["gmail", "outlook"]],
  ["emails", ["gmail", "outlook"]],
  ["mail", ["gmail", "outlook"]],
  ["correo", ["gmail", "outlook"]],
  ["correos", ["gmail", "outlook"]],
  ["correoelectronico", ["gmail", "outlook"]],
];

export function normalizeConnectorQuery(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/** Mail apps a search phrase should find. Null when the phrase is not a mail alias. */
export function mailTargetsForQuery(query: string): readonly MailConnectorTarget[] | null {
  const key = normalizeConnectorQuery(query);
  if (!key) return null;
  return QUERY_TARGETS.find(([alias]) => alias === key)?.[1] ?? null;
}

export function itemMatchesMailTarget(
  item: { slug: string; name: string },
  target: MailConnectorTarget,
): boolean {
  const slug = normalizeConnectorQuery(item.slug);
  const name = normalizeConnectorQuery(item.name);
  const keys = target === "gmail" ? GMAIL_ITEM_KEYS : OUTLOOK_ITEM_KEYS;
  if (keys.has(slug) || keys.has(name)) return true;
  if (target === "outlook") {
    const mentionsOutlook = (value: string) =>
      value.includes("outlook") && !value.includes("calendar");
    return mentionsOutlook(slug) || mentionsOutlook(name);
  }
  return false;
}

/** True when a catalog row is one of the mail apps this phrase names. */
export function catalogItemMatchesQuery(
  item: { slug: string; name: string },
  query: string,
): boolean {
  const targets = mailTargetsForQuery(query);
  if (!targets) return false;
  return targets.some((target) => itemMatchesMailTarget(item, target));
}
