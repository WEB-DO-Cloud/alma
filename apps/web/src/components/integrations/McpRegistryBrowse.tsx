import { Trans, useLingui } from "@lingui/react/macro";
import type { McpRegistryServer } from "@rakazo/contracts";
import { FEATURED_MCP_SERVERS } from "@rakazo/core";
import { Button, Input } from "@rakazo/ui-web";
import { useEffect, useState } from "react";
import { addRemoteMcpServer } from "../../lib/add-remote-mcp";
import { rpc } from "../../lib/rpc";
import { errorText } from "../../lib/user-error";

const SEARCH_DEBOUNCE_MS = 300;

function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

function RegistryIcon({ name, iconUrl }: { name: string; iconUrl: string | null }) {
  return iconUrl ? (
    <img
      src={iconUrl}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className="h-9 w-9 shrink-0 rounded-xl bg-accent object-contain"
    />
  ) : (
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-sm font-semibold text-foreground">
      {name[0] ?? "?"}
    </div>
  );
}

export function McpRegistryBrowse({
  query = "",
  showSearch = false,
  installedEndpoints,
  botId,
  onInstalled,
}: {
  /** The connectors search box. Ignored when `showSearch` renders its own field. */
  query?: string;
  showSearch?: boolean;
  installedEndpoints: ReadonlySet<string>;
  botId?: string;
  onInstalled: () => void;
}) {
  const { t } = useLingui();
  const [localQuery, setLocalQuery] = useState("");
  const typed = (showSearch ? localQuery : query).trim();
  const [results, setResults] = useState<McpRegistryServer[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [headerFor, setHeaderFor] = useState<string | null>(null);
  const [headerValue, setHeaderValue] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const copy: Record<string, string> = {
    "com.mintmcp/gmail": t`Search, read, and draft Gmail.`,
    "com.mintmcp/gcal": t`List and update Google Calendar events.`,
    "com.mintmcp/outlook-email": t`Search, read, and draft Outlook mail.`,
    "com.mintmcp/outlook-calendar": t`List and update Outlook Calendar events.`,
    "com.notion/mcp": t`Search and edit your Notion workspace.`,
    "ai.waystation/slack": t`Send messages and read Slack channels.`,
    "io.github.github/github-mcp-server": t`Manage GitHub repositories, issues, and pull requests.`,
    "app.linear/linear": t`Find and manage Linear issues and projects.`,
    "com.atlassian/atlassian-mcp-server": t`Search and update Jira and Confluence.`,
    "com.stripe/mcp": t`Work with Stripe customers, products, and payments.`,
    "com.zapier/mcp": t`Connect apps through Zapier.`,
    "com.canva.mcp/mcp": t`Create and export Canva designs.`,
  };

  useEffect(() => {
    if (typed.length < 2) {
      setResults(null);
      setSearchError(null);
      return;
    }
    setResults(null);
    setSearchError(null);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void rpc.mcp.registry
        .search({ query: typed, limit: 12 }, { signal: controller.signal })
        .then((response) => {
          if (!controller.signal.aborted) setResults(response.servers);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setSearchError(errorText(error, t`Could not search the MCP registry`));
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [typed]);

  async function add(server: McpRegistryServer) {
    if (installedEndpoints.has(server.endpoint) || pending) return;
    if (server.needsHeader && headerFor !== server.endpoint) {
      setHeaderFor(server.endpoint);
      setHeaderValue("");
      setAddError(null);
      return;
    }
    if (server.needsHeader && !headerValue.trim()) {
      setAddError(t`This server needs a header.`);
      return;
    }
    setPending(server.endpoint);
    setAddError(null);
    try {
      await addRemoteMcpServer({
        server,
        headerValue: server.needsHeader ? headerValue.trim() : undefined,
        botId,
      });
      setHeaderFor(null);
      setHeaderValue("");
      onInstalled();
    } catch (error) {
      setAddError(errorText(error, t`Could not add MCP server`));
    } finally {
      setPending(null);
    }
  }

  const browsing = typed.length === 0;
  const searchingNow = typed.length >= 2;
  const cards = browsing ? FEATURED_MCP_SERVERS : (results ?? []);

  function renderCard(server: McpRegistryServer) {
    const added = installedEndpoints.has(server.endpoint);
    const busy = pending === server.endpoint;
    const description = copy[server.registryName] ?? server.description;
    return (
      <div
        key={server.endpoint}
        data-testid="mcp-registry-card"
        className="flex min-w-0 items-start gap-3 rounded-xl border border-border p-3"
      >
        <RegistryIcon name={server.name} iconUrl={server.iconUrl} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium text-foreground">{server.name}</div>
          {description ? (
            <p className="line-clamp-2 text-[12.5px] leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
          <p className="truncate text-[12px] text-muted-foreground/80">
            {searchingNow
              ? `${server.transport === "sse" ? "SSE" : "HTTP"} · ${server.endpoint}`
              : endpointHost(server.endpoint)}
          </p>
          {headerFor === server.endpoint ? (
            <Input
              className="mt-2"
              type="password"
              autoComplete="new-password"
              aria-label={t`Header value`}
              placeholder={t`Header value`}
              value={headerValue}
              onChange={(event) => setHeaderValue(event.target.value)}
            />
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={added || busy}
          aria-label={added ? t`Added` : t`Add ${server.name}`}
          onClick={() => void add(server)}
        >
          {busy ? <Trans>Adding…</Trans> : added ? <Trans>Added</Trans> : <Trans>Add</Trans>}
        </Button>
      </div>
    );
  }

  return (
    <section data-testid="mcp-registry" className="mb-6">
      {showSearch ? (
        <Input
          value={localQuery}
          onChange={(event) => setLocalQuery(event.target.value)}
          aria-label={t`Search MCP servers`}
          placeholder={t`Search MCP servers`}
          className="mb-4 h-11 rounded-xl px-4"
        />
      ) : null}
      {searchingNow ? null : (
        <h2 className="mb-2 text-sm font-medium text-foreground">
          <Trans>Popular</Trans>
        </h2>
      )}
      {addError ? (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {addError}
        </p>
      ) : null}
      {searchError ? (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {searchError}
        </p>
      ) : null}
      {searchingNow && !results && !searchError ? (
        <p className="text-sm text-muted-foreground">
          <Trans>Searching…</Trans>
        </p>
      ) : null}
      {searchingNow && results && results.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          <Trans>No remote MCP servers found</Trans>
        </p>
      ) : null}
      {cards.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{cards.map(renderCard)}</div>
      ) : null}
    </section>
  );
}
