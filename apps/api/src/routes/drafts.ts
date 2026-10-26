import { managedDraftIdentity, managedModelActive, resolveManagedModel } from "@rakazo/adapters";
import {
  approveDraftForActor,
  copySourceForActor,
  createDraftForActor,
  exportApprovalLogForActor,
  exportDraftForActor,
  getDraftForActor,
  listApprovalLogForActor,
  listDraftsForActor,
  openDraftForActor,
  rejectDraftForActor,
  saveDraftForActor,
} from "../drafts.js";
import type { RouterContext } from "./context.js";

export function draftRoutes(ctx: RouterContext) {
  const { deps, authed } = ctx;
  return {
    drafts: {
      list: authed.drafts.list.handler(async ({ context, input }) =>
        listDraftsForActor(deps.prisma, context.actor, input.status),
      ),
      get: authed.drafts.get.handler(async ({ context, input }) =>
        getDraftForActor(deps.prisma, context.actor, input.draftId),
      ),
      create: authed.drafts.create.handler(async ({ context, input }) => {
        const identity = managedModelActive() ? managedDraftIdentity(resolveManagedModel()) : null;
        return createDraftForActor(
          deps.prisma,
          context.actor,
          identity
            ? { ...input, model: identity.model, modelVersion: identity.modelVersion }
            : input,
        );
      }),
      open: authed.drafts.open.handler(async ({ context, input }) =>
        openDraftForActor(deps.prisma, context.actor, input.draftId),
      ),
      save: authed.drafts.save.handler(async ({ context, input }) =>
        saveDraftForActor(deps.prisma, context.actor, input),
      ),
      approve: authed.drafts.approve.handler(async ({ context, input }) =>
        approveDraftForActor(deps.prisma, context.actor, input),
      ),
      reject: authed.drafts.reject.handler(async ({ context, input }) =>
        rejectDraftForActor(deps.prisma, context.actor, input),
      ),
      export: authed.drafts.export.handler(async ({ context, input }) =>
        exportDraftForActor(deps.prisma, context.actor, input.draftId),
      ),
      copySource: authed.drafts.copySource.handler(async ({ context, input }) =>
        copySourceForActor(deps.prisma, context.actor, input),
      ),
    },
    draftApprovals: {
      list: authed.draftApprovals.list.handler(async ({ context, input }) =>
        listApprovalLogForActor(deps.prisma, context.actor, input),
      ),
      exportCsv: authed.draftApprovals.exportCsv.handler(async ({ context, input }) =>
        exportApprovalLogForActor(deps.prisma, context.actor, input),
      ),
    },
  };
}
