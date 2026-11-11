import type { GoogleWorkspaceConnector } from "@rakazo/adapters";
import { Hono } from "hono";
import { readBoundedBody } from "./http-body.js";

const MAX_BYTES = 8 * 1024;

/**
 * The file chooser page posts here. The ticket in the body is the credential.
 * Responses never include a refresh token.
 */
export function googleDrivePickerRoutes(connector: GoogleWorkspaceConnector): Hono {
  const app = new Hono();
  app.post("/api/google-drive-picker/session", async (c) => {
    const body = await readTicketBody(c.req.raw);
    if (!body) return c.json({ error: "Not available." }, 400);
    const session = await connector.pickerSession(body.ticket, c.req.raw.signal);
    if (!session) return c.json({ error: "Not available." }, 404);
    c.header("cache-control", "no-store");
    return c.json(session);
  });
  app.post("/api/google-drive-picker/files", async (c) => {
    const body = await readTicketBody(c.req.raw);
    if (!body || !Array.isArray(body.files)) return c.json({ error: "Not available." }, 400);
    const saved = await connector.recordPickedFiles(
      body.ticket,
      body.files.slice(0, 10),
      c.req.raw.signal,
    );
    if (!saved) return c.json({ error: "Not available." }, 404);
    c.header("cache-control", "no-store");
    return c.json({ ok: true });
  });
  return app;
}

async function readTicketBody(request: Request): Promise<{
  ticket: string;
  files?: { id?: unknown; name?: unknown; mimeType?: unknown }[];
} | null> {
  const text = await readBoundedBody(request, MAX_BYTES);
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text) as { ticket?: unknown; files?: unknown };
    if (typeof parsed.ticket !== "string" || !parsed.ticket || parsed.ticket.length > 2000) {
      return null;
    }
    const files = Array.isArray(parsed.files)
      ? parsed.files.filter(
          (item): item is { id?: unknown; name?: unknown; mimeType?: unknown } =>
            Boolean(item) && typeof item === "object",
        )
      : undefined;
    return { ticket: parsed.ticket, ...(files ? { files } : {}) };
  } catch {
    return null;
  }
}
