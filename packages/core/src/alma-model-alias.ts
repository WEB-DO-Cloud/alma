/**
 * User-facing names for the managed chat models.
 *
 * Screens, catalogs, and saved choices use `alma-*` ids (`deepseek-flash` is
 * `alma-flash`, and every other `deepseek-*` id follows that prefix). Calls to
 * the provider still use the upstream id. A stored or configured `deepseek-*`
 * id keeps working and is shown as its alias.
 *
 * The provider id stays `deepseek` so credentials, environment, and the
 * provider client do not move. Only names and model ids that a person can
 * read change here.
 */

export const ALMA_UPSTREAM_PROVIDER_ID = "deepseek";
export const ALMA_PUBLIC_PROVIDER_NAME = "ALMA";

const UPSTREAM_PREFIX = "deepseek-";
const PUBLIC_PREFIX = "alma-";

export function isAlmaUpstreamProvider(provider: string | null | undefined): boolean {
  return (provider ?? "").trim().toLowerCase() === ALMA_UPSTREAM_PROVIDER_ID;
}

/** Id shown in pickers, settings, usage, and consent. */
export function toPublicModelId(modelId: string): string {
  const id = modelId.trim();
  const lower = id.toLowerCase();
  if (lower.startsWith(PUBLIC_PREFIX)) return `${PUBLIC_PREFIX}${id.slice(PUBLIC_PREFIX.length)}`;
  if (lower.startsWith(UPSTREAM_PREFIX))
    return `${PUBLIC_PREFIX}${id.slice(UPSTREAM_PREFIX.length)}`;
  return id;
}

/** Id sent to the provider. `alma-flash` and `deepseek-flash` both become `deepseek-flash`. */
export function toUpstreamModelId(modelId: string): string {
  const id = modelId.trim();
  const lower = id.toLowerCase();
  if (lower.startsWith(PUBLIC_PREFIX)) return `${UPSTREAM_PREFIX}${id.slice(PUBLIC_PREFIX.length)}`;
  if (lower.startsWith(UPSTREAM_PREFIX))
    return `${UPSTREAM_PREFIX}${id.slice(UPSTREAM_PREFIX.length)}`;
  return id;
}

export function presentModelId(provider: string | null | undefined, modelId: string): string {
  if (!isAlmaUpstreamProvider(provider)) return modelId;
  return toPublicModelId(modelId);
}

export function resolveModelId(provider: string | null | undefined, modelId: string): string {
  if (!isAlmaUpstreamProvider(provider)) return modelId;
  return toUpstreamModelId(modelId);
}

/** True when both ids name the same model, including a public id and its upstream id. */
export function sameModelId(provider: string, left: string, right: string): boolean {
  return resolveModelId(provider, left) === resolveModelId(provider, right);
}

/**
 * Strip the upstream vendor from a sentence a person can read.
 * `DeepSeek API error` becomes `ALMA model error`. Other mentions of the
 * vendor become ALMA, and `deepseek-*` ids become `alma-*`.
 */
export function presentModelCopy(text: string): string {
  return text
    .replace(/\bdeepseek api error\b/gi, "ALMA model error")
    .replace(/\bdeepseek-/gi, "alma-")
    .replace(/\bdeepseek\b/gi, "ALMA");
}

export function sanitizeUserModelError(message: string): string {
  return presentModelCopy(message);
}

type CatalogFace = {
  provider: string;
  id: string;
  label: string;
  providerName?: string;
  billing?: string;
};

/** Catalog row as a client renders it. The provider id is unchanged. */
export function presentCatalogEntry<T extends CatalogFace>(entry: T): T {
  const aliased = isAlmaUpstreamProvider(entry.provider);
  const id = aliased ? toPublicModelId(entry.id) : entry.id;
  const label = presentModelCopy(entry.label);
  const providerName =
    entry.providerName === undefined
      ? undefined
      : aliased
        ? ALMA_PUBLIC_PROVIDER_NAME
        : presentModelCopy(entry.providerName);
  const billing = entry.billing === undefined ? undefined : presentModelCopy(entry.billing);
  if (
    id === entry.id &&
    label === entry.label &&
    providerName === entry.providerName &&
    billing === entry.billing
  ) {
    return entry;
  }
  return {
    ...entry,
    id,
    label,
    ...(entry.providerName !== undefined ? { providerName } : {}),
    ...(entry.billing !== undefined ? { billing } : {}),
  };
}

export function presentModelChoice<T extends { provider: string; modelId: string }>(choice: T): T {
  const modelId = presentModelId(choice.provider, choice.modelId);
  return modelId === choice.modelId ? choice : { ...choice, modelId };
}

export function upstreamModelChoice<T extends { provider: string; modelId: string }>(choice: T): T {
  const modelId = resolveModelId(choice.provider, choice.modelId);
  return modelId === choice.modelId ? choice : { ...choice, modelId };
}

export function presentCredential<
  T extends {
    provider: string;
    label: string;
    modelId?: string | null;
    enabledModelIds?: string[];
  },
>(row: T): T {
  const modelId = row.modelId ? presentModelId(row.provider, row.modelId) : row.modelId;
  const enabledModelIds = row.enabledModelIds?.map((id) => presentModelId(row.provider, id));
  return {
    ...row,
    label: presentModelCopy(row.label),
    ...(row.modelId !== undefined ? { modelId } : {}),
    ...(enabledModelIds ? { enabledModelIds } : {}),
  };
}

/** Usage rows are display-only. The stored provider and model stay unchanged. */
export function presentUsageIdentity(
  provider: string,
  model: string,
): { provider: string; model: string } {
  if (isAlmaUpstreamProvider(provider)) {
    return { provider: ALMA_PUBLIC_PROVIDER_NAME, model: toPublicModelId(model) };
  }
  return { provider: presentModelCopy(provider), model: presentModelCopy(model) };
}

export function presentAiRecipient<T extends { name: string; detail: string }>(recipient: T): T {
  return {
    ...recipient,
    name: presentModelCopy(recipient.name),
    detail: presentModelCopy(recipient.detail),
  };
}

export function publicProviderLabel(provider: string): string {
  return isAlmaUpstreamProvider(provider) ? ALMA_PUBLIC_PROVIDER_NAME : presentModelCopy(provider);
}
