import { ORPCError } from "@orpc/server";
import type { PrismaClient } from "@rakazo/db";
import { unapprovedDraftBlocksText } from "@rakazo/db";

/** Stop a response that would take an unapproved agent draft out of the firm. */
export async function refuseUnapprovedDraftContent(
  prisma: PrismaClient,
  spaceId: string,
  input: { texts: string[]; messageIds?: string[]; artifactIds?: string[] },
): Promise<void> {
  const blocked = await unapprovedDraftBlocksText(prisma, { spaceId, ...input });
  if (blocked) {
    throw new ORPCError("FORBIDDEN", {
      message: "This draft has not been approved by a named lawyer.",
    });
  }
}

export function textFromBase64(value: string): string {
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return "";
  }
}
