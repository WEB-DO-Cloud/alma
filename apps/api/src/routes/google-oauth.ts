import { ORPCError } from "@orpc/server";
import type { GoogleOAuthRemote } from "@rakazo/adapters";
import {
  ComposioConnector,
  createGoogleOAuthStore,
  deploymentGoogleClientId,
  GoogleOAuthBadRequestError,
  GoogleOAuthForbiddenError,
  GoogleOAuthNotFoundError,
  GoogleOAuthService,
} from "@rakazo/adapters";
import type { RouterContext } from "./context.js";

function mapError(error: unknown): never {
  if (error instanceof GoogleOAuthNotFoundError) {
    throw new ORPCError("NOT_FOUND", { message: error.message });
  }
  if (error instanceof GoogleOAuthForbiddenError) {
    throw new ORPCError("FORBIDDEN", { message: error.message });
  }
  if (error instanceof GoogleOAuthBadRequestError) {
    throw new ORPCError("BAD_REQUEST", { message: error.message });
  }
  throw error;
}

const unavailable: GoogleOAuthRemote = {
  googleToolkits: async () => {
    throw new Error("Google sign-in is not configured");
  },
  scopes: async () => [],
  upsert: async () => {
    throw new Error("Google sign-in is not configured");
  },
  deleteConfig: async () => {
    throw new Error("Google sign-in is not configured");
  },
  restoreCredentials: async () => {
    throw new Error("Google sign-in is not configured");
  },
  testGmail: async () => {
    throw new Error("Google sign-in is not configured");
  },
};

async function service(ctx: RouterContext): Promise<GoogleOAuthService> {
  const { deps } = ctx;
  const trustedClientId = deploymentGoogleClientId(deps.env.googleOAuthClientId);
  if (deps.env.googleByoOauth !== true) {
    return new GoogleOAuthService({
      enabled: false,
      trustedClientId,
      store: createGoogleOAuthStore(deps.prisma),
      remote: unavailable,
      secrets: deps.secrets,
      callbackUrl: `${deps.env.webOrigin}/integrations/callback`,
    });
  }
  const connector = deps.integrationSettings
    ? await deps.integrationSettings.resolve("composio")
    : deps.composio;
  if (!(connector instanceof ComposioConnector)) {
    return new GoogleOAuthService({
      enabled: true,
      trustedClientId,
      store: createGoogleOAuthStore(deps.prisma),
      remote: unavailable,
      secrets: deps.secrets,
      callbackUrl: `${deps.env.webOrigin}/integrations/callback`,
    });
  }
  return new GoogleOAuthService({
    enabled: true,
    trustedClientId,
    store: createGoogleOAuthStore(deps.prisma),
    remote: await connector.googleOAuthRemote(),
    secrets: deps.secrets,
    callbackUrl: `${deps.env.webOrigin}/integrations/callback`,
  });
}

export function googleOAuthRoutes(ctx: RouterContext) {
  const { authed } = ctx;
  return {
    googleOAuth: {
      get: authed.googleOAuth.get.handler(async ({ context }) => {
        try {
          return await (await service(ctx)).get(context.actor);
        } catch (error) {
          mapError(error);
        }
      }),
      save: authed.googleOAuth.save.handler(async ({ context, input }) => {
        try {
          return await (await service(ctx)).save(context.actor, input);
        } catch (error) {
          mapError(error);
        }
      }),
      remove: authed.googleOAuth.remove.handler(async ({ context, input }) => {
        try {
          return await (await service(ctx)).remove(context.actor, input.organizationId);
        } catch (error) {
          mapError(error);
        }
      }),
      test: authed.googleOAuth.test.handler(async ({ context, input }) => {
        try {
          return await (await service(ctx)).test(context.actor, input.organizationId);
        } catch (error) {
          mapError(error);
        }
      }),
    },
  };
}
