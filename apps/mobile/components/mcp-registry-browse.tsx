import type { McpRegistryServer, McpServer } from "@rakazo/contracts";
import {
  availableMcpSlug,
  FEATURED_MCP_ICONS,
  FEATURED_MCP_SERVERS,
  featuredMcpIcon,
  remoteMcpCreateInput,
} from "@rakazo/core";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { rpc } from "../lib/api";
import { mobileTokens } from "../lib/appearance";
import { useI18n } from "../lib/i18n";
import { native, useThemedStyles } from "../lib/native";
import { errorText } from "../lib/user-error";
import { ConnectorIcon } from "./connector-icon";
import { NativeActionButton } from "./native-action-button";

const SEARCH_DEBOUNCE_MS = 300;

function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

function featuredDescription(registryName: string, t: (message: string) => string): string {
  switch (registryName) {
    case "com.mintmcp/gmail":
      return t("Search, read, and draft Gmail.");
    case "com.mintmcp/gcal":
      return t("List and update Google Calendar events.");
    case "com.mintmcp/outlook-email":
      return t("Search, read, and draft Outlook mail.");
    case "com.mintmcp/outlook-calendar":
      return t("List and update Outlook Calendar events.");
    case "com.notion/mcp":
      return t("Search and edit your Notion workspace.");
    case "ai.waystation/slack":
      return t("Send messages and read Slack channels.");
    case "io.github.github/github-mcp-server":
      return t("Manage GitHub repositories, issues, and pull requests.");
    case "app.linear/linear":
      return t("Find and manage Linear issues and projects.");
    case "com.atlassian/atlassian-mcp-server":
      return t("Search and update Jira and Confluence.");
    case "com.stripe/mcp":
      return t("Work with Stripe customers, products, and payments.");
    case "com.zapier/mcp":
      return t("Connect apps through Zapier.");
    case "com.canva.mcp/mcp":
      return t("Create and export Canva designs.");
    default:
      return "";
  }
}

export function McpRegistryBrowse({
  query,
  installedEndpoints,
  botId,
  onInstalled,
}: {
  query: string;
  installedEndpoints: ReadonlySet<string>;
  botId?: string;
  onInstalled: () => void;
}) {
  const { t } = useI18n();
  const styles = useThemedStyles(createStyles);
  const typed = query.trim();
  const [results, setResults] = useState<McpRegistryServer[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [headerFor, setHeaderFor] = useState<string | null>(null);
  const [headerValue, setHeaderValue] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (typed.length < 2) {
      setResults(null);
      setSearchError(null);
      return;
    }
    setResults(null);
    setSearchError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void rpc<{ servers: McpRegistryServer[] }>(
        "mcp/registry/search",
        { query: typed, limit: 12 },
        {
          signal: controller.signal,
        },
      )
        .then((response) => {
          if (!controller.signal.aborted) setResults(response.servers);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setSearchError(errorText(error, t("Could not search the MCP registry")));
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
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
      setAddError(t("This server needs a header."));
      return;
    }
    setPending(server.endpoint);
    setAddError(null);
    try {
      const existing = await rpc<McpServer[]>("mcp/servers/list");
      const saved = existing.find((item) => item.endpoint === server.endpoint);
      const created =
        saved ??
        (await rpc<McpServer>(
          "mcp/servers/create",
          remoteMcpCreateInput(
            server,
            availableMcpSlug(
              server.name,
              existing.map((item) => item.slug),
            ),
            server.needsHeader ? headerValue.trim() : undefined,
          ),
        ));
      if (botId) await rpc("mcp/assignments/approve", { botId, serverId: created.id });
      setHeaderFor(null);
      setHeaderValue("");
      onInstalled();
    } catch (error) {
      setAddError(errorText(error, t("Could not add MCP server")));
    } finally {
      setPending(null);
    }
  }

  const browsing = typed.length === 0;
  const searchingNow = typed.length >= 2;
  const cards = browsing ? FEATURED_MCP_SERVERS : (results ?? []);

  return (
    <View testID="mcp-registry" style={styles.section}>
      {browsing ? <Text style={styles.heading}>{t("Popular")}</Text> : null}
      {addError ? <Text style={styles.error}>{addError}</Text> : null}
      {searchError ? <Text style={styles.error}>{searchError}</Text> : null}
      {searchingNow && !results && !searchError ? (
        <Text style={styles.muted}>{t("Searching…")}</Text>
      ) : null}
      {searchingNow && results && results.length === 0 ? (
        <Text style={styles.muted}>{t("No remote MCP servers found")}</Text>
      ) : null}
      {cards.map((server) => {
        const added = installedEndpoints.has(server.endpoint);
        const description = featuredDescription(server.registryName, t) || server.description;
        const icon = featuredMcpIcon(server);
        return (
          <View key={server.endpoint} testID="mcp-registry-card" style={styles.card}>
            {icon ? (
              <View style={[styles.logo, { backgroundColor: mobileTokens().faviconPlate }]}>
                <SvgXml xml={FEATURED_MCP_ICONS[icon]} width={20} height={20} />
              </View>
            ) : (
              <ConnectorIcon logo={server.iconUrl} name={server.name} size={32} />
            )}
            <View style={styles.grow}>
              <Text numberOfLines={1} style={styles.title}>
                {server.name}
              </Text>
              {description ? (
                <Text numberOfLines={2} style={styles.muted}>
                  {description}
                </Text>
              ) : null}
              <Text numberOfLines={1} style={styles.muted}>
                {searchingNow
                  ? `${server.transport === "sse" ? "SSE" : "HTTP"} · ${server.endpoint}`
                  : endpointHost(server.endpoint)}
              </Text>
              {headerFor === server.endpoint ? (
                <TextInput
                  value={headerValue}
                  onChangeText={setHeaderValue}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={t("Header value")}
                  accessibilityLabel={t("Header value")}
                  placeholderTextColor={native.tertiaryLabel}
                  style={styles.input}
                />
              ) : null}
            </View>
            <NativeActionButton
              fill={false}
              size="compact"
              disabled={added || pending === server.endpoint}
              label={pending === server.endpoint ? t("Adding…") : added ? t("Added") : t("Add")}
              accessibilityLabel={added ? t("Added") : t("Add {name}", { name: server.name })}
              onPress={() => void add(server)}
            />
          </View>
        );
      })}
    </View>
  );
}

function createStyles() {
  const destructive = mobileTokens().destructive;
  return StyleSheet.create({
    section: { gap: 8 },
    logo: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    heading: { color: native.label, fontSize: 15, fontWeight: "600" },
    card: {
      minHeight: 72,
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor: native.fill,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    grow: { flex: 1, gap: 2 },
    title: { color: native.label, fontSize: 15, fontWeight: "600" },
    muted: { color: native.secondaryLabel, fontSize: 13 },
    error: { color: destructive, fontSize: 13 },
    input: {
      minHeight: 40,
      borderRadius: 10,
      backgroundColor: native.fillPressed,
      color: native.label,
      paddingHorizontal: 10,
      marginTop: 6,
    },
  });
}
