import { ORPCError } from "@orpc/server";
import { EmailImapConnector, MailboxFailure } from "@rakazo/adapters";
import { EMAIL_IMAP_CONNECTOR_ID } from "@rakazo/contracts";
import { connectionContext } from "../connection-flows.js";
import type { RouterContext } from "./context.js";

function connectorOf(ctx: RouterContext): EmailImapConnector {
  if (ctx.deps.env.emailImapConnector !== true) {
    throw new ORPCError("NOT_FOUND", { message: "Not found." });
  }
  const connector = ctx.deps.connectors.managed(EMAIL_IMAP_CONNECTOR_ID);
  if (!(connector instanceof EmailImapConnector)) {
    throw new ORPCError("NOT_FOUND", { message: "Not found." });
  }
  return connector;
}

function failure(error: unknown): {
  ok: false;
  code: MailboxFailure["code"];
  side?: "imap" | "smtp";
} {
  if (error instanceof MailboxFailure) {
    return { ok: false, code: error.code, ...(error.side ? { side: error.side } : {}) };
  }
  return { ok: false, code: "unreachable" };
}

export function emailImapRoutes(ctx: RouterContext) {
  const { authed } = ctx;
  return {
    emailImap: {
      detect: authed.emailImap.detect.handler(async ({ context, input }) => {
        const connector = connectorOf(ctx);
        try {
          const found = await connector.discover(
            input.email,
            connectionContext(context.actor, "emailImap.detect", context.signal),
          );
          if (!found.detected) return { detected: false };
          return {
            detected: true,
            username: found.settings.username,
            imap: found.settings.imap,
            smtp: found.settings.smtp,
          };
        } catch (error) {
          if (error instanceof ORPCError) throw error;
          throw new ORPCError("BAD_REQUEST", { message: failure(error).code });
        }
      }),
      test: authed.emailImap.test.handler(async ({ context, input }) => {
        const connector = connectorOf(ctx);
        try {
          await connector.test(
            input,
            connectionContext(context.actor, "emailImap.test", context.signal),
          );
          return { ok: true };
        } catch (error) {
          if (error instanceof ORPCError) throw error;
          return failure(error);
        }
      }),
      save: authed.emailImap.save.handler(async ({ context, input }) => {
        const connector = connectorOf(ctx);
        try {
          const connectionId = await connector.save(
            input,
            connectionContext(context.actor, "emailImap.save", context.signal),
          );
          return { ok: true, connectionId };
        } catch (error) {
          if (error instanceof ORPCError) throw error;
          return failure(error);
        }
      }),
    },
  };
}
