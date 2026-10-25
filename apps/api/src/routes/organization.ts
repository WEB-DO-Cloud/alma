import { createOrganizationLogoStore } from "../organization-logo-store.js";
import {
  readOrganizationSettingsForActor,
  updateOrganizationSettingsForActor,
  uploadOrganizationLogoForActor,
} from "../organization-settings.js";
import type { RouterContext } from "./context.js";

export function organizationRoutes(ctx: RouterContext) {
  const { deps, authed } = ctx;
  const logos = () => deps.organizationLogos ?? createOrganizationLogoStore(deps.dataDir);
  return {
    organization: {
      get: authed.organization.get.handler(async ({ context }) =>
        readOrganizationSettingsForActor(deps.prisma, logos(), context.actor),
      ),
      update: authed.organization.update.handler(async ({ context, input }) =>
        updateOrganizationSettingsForActor(deps.prisma, logos(), context.actor, input),
      ),
      uploadLogo: authed.organization.uploadLogo.handler(async ({ context, input }) =>
        uploadOrganizationLogoForActor(deps.prisma, logos(), context.actor, input),
      ),
    },
  };
}
