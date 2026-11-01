import type { McpRegistryServer, McpServer } from "@rakazo/contracts";
import { availableMcpSlug, remoteMcpCreateInput } from "@rakazo/core";
import { connectMcpOauth } from "./mcp-connect";
import { rpc } from "./rpc";

/** Create a registry server, then start the existing OAuth popup unless a header was saved. */
export async function addRemoteMcpServer(input: {
  server: McpRegistryServer;
  headerValue?: string;
  botId?: string;
}): Promise<McpServer> {
  const existing = await rpc.mcp.servers.list();
  const saved = existing.find((server) => server.endpoint === input.server.endpoint);
  const server =
    saved ??
    (await rpc.mcp.servers.create(
      remoteMcpCreateInput(
        input.server,
        availableMcpSlug(
          input.server.name,
          existing.map((item) => item.slug),
        ),
        input.headerValue,
      ),
    ));
  if (input.botId) {
    await rpc.mcp.assignments.approve({ botId: input.botId, serverId: server.id });
  }
  if (!input.headerValue) await connectMcpOauth(server.id);
  return server;
}
