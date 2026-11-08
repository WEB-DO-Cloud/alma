import * as z from "zod";

/** What an owner or admin sees. The client secret and the full client ID are not here. */
export const GoogleOAuthViewSchema = z.object({
  configured: z.boolean(),
  clientIdLast4: z.string().nullable(),
  redirectUris: z.array(z.string()),
  apps: z.array(
    z.object({
      slug: z.string(),
      name: z.string(),
      scopes: z.array(z.string()),
    }),
  ),
  scopesUnavailable: z.boolean(),
  trustedClientId: z.string().nullable(),
});

export type GoogleOAuthView = z.infer<typeof GoogleOAuthViewSchema>;
