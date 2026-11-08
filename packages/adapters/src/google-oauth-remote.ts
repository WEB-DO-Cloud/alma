import { GOOGLE_OAUTH_REDIRECT_URI, googleAuthConfigName, splitScopes } from "./google-oauth.js";

type AuthField = { name?: string; default?: string | null };

/** The catalog calls this file makes. The installed SDK matches this shape. */
export type GoogleAuthRemoteClient = {
  authConfigs: {
    list(query: { search: string; limit: number; cursor?: string }): Promise<{
      items: Array<{ id: string; name?: string | null }>;
      nextCursor?: string | null;
    }>;
    create(
      toolkit: string,
      options: {
        type: "use_custom_auth";
        authScheme: "OAUTH2";
        name: string;
        credentials: Record<string, string>;
        isEnabledForToolRouter: true;
      },
    ): Promise<{ id: string }>;
    update(
      id: string,
      data: { type: "custom"; credentials: Record<string, string> },
    ): Promise<unknown>;
    delete(id: string): Promise<unknown>;
  };
  toolkits: {
    get(slug: string): Promise<{
      authConfigDetails?: Array<{
        mode?: string;
        fields?: {
          authConfigCreation?: { required?: AuthField[]; optional?: AuthField[] };
        };
      }>;
    }>;
  };
  create(
    userId: string,
    config: {
      manageConnections: false;
      sandbox: { enable: false };
      authConfigs: Record<string, string>;
    },
  ): Promise<{
    authorize(
      provider: string,
      options: { callbackUrl: string },
    ): Promise<{ id?: string; redirectUrl?: string | null }>;
  }>;
  connectedAccounts: { delete(id: string): Promise<unknown> };
};

export function credentialsFor(clientId: string, clientSecret: string): Record<string, string> {
  return {
    client_id: clientId,
    client_secret: clientSecret,
    oauth_redirect_uri: GOOGLE_OAUTH_REDIRECT_URI,
  };
}

export function scopesFromToolkit(toolkit: {
  authConfigDetails?: Array<{
    mode?: string;
    fields?: { authConfigCreation?: { required?: AuthField[]; optional?: AuthField[] } };
  }>;
}): string[] {
  const oauth = toolkit.authConfigDetails?.find(
    (detail) => detail.mode?.toUpperCase() === "OAUTH2",
  );
  const fields = [
    ...(oauth?.fields?.authConfigCreation?.required ?? []),
    ...(oauth?.fields?.authConfigCreation?.optional ?? []),
  ];
  const scopes = fields.find((field) => field.name === "scopes");
  return splitScopes(scopes?.default);
}

function isMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { status?: unknown; statusCode?: unknown };
  return record.status === 404 || record.statusCode === 404;
}

async function idsNamed(client: GoogleAuthRemoteClient, name: string): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const listed = await client.authConfigs.list({ search: name, limit: 100, cursor });
    for (const item of listed.items) {
      if (item.name === name && item.id) ids.push(item.id);
    }
    if (!listed.nextCursor) return ids;
    cursor = listed.nextCursor;
  }
  throw new Error("auth config list did not end");
}

export async function upsertGoogleAuthConfig(
  client: GoogleAuthRemoteClient,
  input: {
    organizationId: string;
    slug: string;
    clientId: string;
    clientSecret: string;
    existingId?: string;
  },
): Promise<{ id: string; created: boolean; slug: string }> {
  const credentials = credentialsFor(input.clientId, input.clientSecret);
  if (input.existingId) {
    await client.authConfigs.update(input.existingId, { type: "custom", credentials });
    return { id: input.existingId, created: false, slug: input.slug };
  }
  const name = googleAuthConfigName(input.organizationId, input.slug);
  const matches = await idsNamed(client, name);
  if (matches.length > 1) throw new Error("more than one auth config has this name");
  if (matches.length === 1) {
    const id = matches[0]!;
    await client.authConfigs.update(id, { type: "custom", credentials });
    return { id, created: false, slug: input.slug };
  }
  const created = await client.authConfigs.create(input.slug, {
    type: "use_custom_auth",
    authScheme: "OAUTH2",
    name,
    credentials,
    isEnabledForToolRouter: true,
  });
  return { id: created.id, created: true, slug: input.slug };
}

export async function deleteGoogleAuthConfig(
  client: GoogleAuthRemoteClient,
  id: string,
): Promise<"deleted" | "missing"> {
  try {
    await client.authConfigs.delete(id);
    return "deleted";
  } catch (error) {
    if (isMissing(error)) return "missing";
    throw error;
  }
}

export function authorizationAccepted(
  url: string,
  clientId: string,
  clientSecret: string,
): boolean {
  if (!url.startsWith("https://")) return false;
  if (clientSecret && url.includes(clientSecret)) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const param = parsed.searchParams.get("client_id");
  return param === null || param === clientId;
}

export async function testGoogleAuthorization(
  client: GoogleAuthRemoteClient,
  input: {
    userId: string;
    slug: string;
    authConfigId: string;
    callbackUrl: string;
    clientId: string;
    clientSecret: string;
  },
): Promise<void> {
  const session = await client.create(input.userId, {
    manageConnections: false,
    sandbox: { enable: false },
    authConfigs: { [input.slug]: input.authConfigId },
  });
  const request = await session.authorize(input.slug, { callbackUrl: input.callbackUrl });
  const url = request.redirectUrl ?? "";
  if (!authorizationAccepted(url, input.clientId, input.clientSecret)) {
    throw new Error("authorization url was not accepted");
  }
  const id = request.id?.trim();
  if (!id) throw new Error("authorization could not be cancelled");
  try {
    await client.connectedAccounts.delete(id);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}
