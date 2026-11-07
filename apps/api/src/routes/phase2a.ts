import { ORPCError } from "@orpc/server";
import { Phase2aError, readPhase2aConfig } from "@rakazo/core";
import type { Phase2aActor } from "@rakazo/db";
import {
  approveOutboundDraft,
  cancelOutboundDraft,
  createOutboundDraft,
  createWorkContext,
  createWorkLink,
  createWorkRecord,
  editOutboundDraft,
  grantWorkRole,
  listOutboundDrafts,
  listWorkContexts,
  listWorkRecords,
  resolveWorkRecord,
  revokeWorkRole,
  submitOutboundDraft,
} from "@rakazo/db";
import type { RouterContext } from "./context.js";

function phase2aConfig() {
  const config = readPhase2aConfig();
  if (!config.enabled) throw new ORPCError("FORBIDDEN", { message: "phase2a_disabled" });
  return config;
}

function rethrow(error: unknown): never {
  if (error instanceof Phase2aError) {
    const code = error.code === "phase2a_missing" ? "NOT_FOUND" : "FORBIDDEN";
    if (
      error.code === "phase2a_stale_approval" ||
      error.code === "phase2a_already_sent" ||
      error.code === "phase2a_in_flight" ||
      error.code === "phase2a_link_taken" ||
      error.code === "phase2a_last_owner"
    ) {
      throw new ORPCError("CONFLICT", { message: error.code });
    }
    throw new ORPCError(code, { message: error.code });
  }
  throw error;
}

async function actorFor(
  ctx: RouterContext,
  userId: string,
  spaceId: string,
): Promise<Phase2aActor> {
  const space = await ctx.deps.prisma.space.findFirst({
    where: { id: spaceId },
    select: { organizationId: true },
  });
  if (!space) throw new ORPCError("NOT_FOUND", { message: "phase2a_missing" });
  return { userId, spaceId, organizationId: space.organizationId };
}

export function phase2aRoutes(ctx: RouterContext) {
  const { authed, deps } = ctx;
  return {
    phase2a: {
      contexts: {
        list: authed.phase2a.contexts.list.handler(async ({ context }) => {
          phase2aConfig();
          try {
            return await listWorkContexts(
              deps.prisma,
              await actorFor(ctx, context.actor.userId, context.actor.spaceId),
            );
          } catch (error) {
            rethrow(error);
          }
        }),
        create: authed.phase2a.contexts.create.handler(async ({ context, input }) => {
          phase2aConfig();
          try {
            return await createWorkContext(
              deps.prisma,
              await actorFor(ctx, context.actor.userId, context.actor.spaceId),
              input,
            );
          } catch (error) {
            rethrow(error);
          }
        }),
        grant: authed.phase2a.contexts.grant.handler(async ({ context, input }) => {
          phase2aConfig();
          try {
            return await grantWorkRole(
              deps.prisma,
              await actorFor(ctx, context.actor.userId, context.actor.spaceId),
              input,
            );
          } catch (error) {
            rethrow(error);
          }
        }),
        revoke: authed.phase2a.contexts.revoke.handler(async ({ context, input }) => {
          phase2aConfig();
          try {
            return await revokeWorkRole(
              deps.prisma,
              await actorFor(ctx, context.actor.userId, context.actor.spaceId),
              input,
            );
          } catch (error) {
            rethrow(error);
          }
        }),
      },
      records: {
        list: authed.phase2a.records.list.handler(async ({ context, input }) => {
          phase2aConfig();
          try {
            return await listWorkRecords(
              deps.prisma,
              await actorFor(ctx, context.actor.userId, context.actor.spaceId),
              input.contextId,
            );
          } catch (error) {
            rethrow(error);
          }
        }),
        create: authed.phase2a.records.create.handler(async ({ context, input }) => {
          phase2aConfig();
          try {
            return await createWorkRecord(
              deps.prisma,
              await actorFor(ctx, context.actor.userId, context.actor.spaceId),
              input,
            );
          } catch (error) {
            rethrow(error);
          }
        }),
        resolve: authed.phase2a.records.resolve.handler(async ({ context, input }) => {
          phase2aConfig();
          try {
            return await resolveWorkRecord(
              deps.prisma,
              await actorFor(ctx, context.actor.userId, context.actor.spaceId),
              input,
            );
          } catch (error) {
            rethrow(error);
          }
        }),
      },
      links: {
        create: authed.phase2a.links.create.handler(async ({ context, input }) => {
          phase2aConfig();
          try {
            return await createWorkLink(
              deps.prisma,
              await actorFor(ctx, context.actor.userId, context.actor.spaceId),
              input,
            );
          } catch (error) {
            rethrow(error);
          }
        }),
      },
      drafts: {
        list: authed.phase2a.drafts.list.handler(async ({ context, input }) => {
          phase2aConfig();
          try {
            return await listOutboundDrafts(
              deps.prisma,
              await actorFor(ctx, context.actor.userId, context.actor.spaceId),
              input.contextId,
            );
          } catch (error) {
            rethrow(error);
          }
        }),
        create: authed.phase2a.drafts.create.handler(async ({ context, input }) => {
          phase2aConfig();
          try {
            return await createOutboundDraft(
              deps.prisma,
              await actorFor(ctx, context.actor.userId, context.actor.spaceId),
              input,
            );
          } catch (error) {
            rethrow(error);
          }
        }),
        edit: authed.phase2a.drafts.edit.handler(async ({ context, input }) => {
          phase2aConfig();
          try {
            return await editOutboundDraft(
              deps.prisma,
              await actorFor(ctx, context.actor.userId, context.actor.spaceId),
              input,
            );
          } catch (error) {
            rethrow(error);
          }
        }),
        submit: authed.phase2a.drafts.submit.handler(async ({ context, input }) => {
          phase2aConfig();
          try {
            return await submitOutboundDraft(
              deps.prisma,
              await actorFor(ctx, context.actor.userId, context.actor.spaceId),
              input,
            );
          } catch (error) {
            rethrow(error);
          }
        }),
        approve: authed.phase2a.drafts.approve.handler(async ({ context, input }) => {
          const config = phase2aConfig();
          try {
            return await approveOutboundDraft(
              deps.prisma,
              await actorFor(ctx, context.actor.userId, context.actor.spaceId),
              { id: input.id, delaySeconds: config.dispatchDelaySeconds },
            );
          } catch (error) {
            rethrow(error);
          }
        }),
        cancel: authed.phase2a.drafts.cancel.handler(async ({ context, input }) => {
          phase2aConfig();
          try {
            return await cancelOutboundDraft(
              deps.prisma,
              await actorFor(ctx, context.actor.userId, context.actor.spaceId),
              input,
            );
          } catch (error) {
            rethrow(error);
          }
        }),
      },
    },
  };
}
