import type { OutboundDraft, WorkContext } from "@rakazo/contracts";
import { useCallback, useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { rpc } from "../../lib/api";
import { ApprovalQueue } from "../../lib/approval-queue";

/** Drafts waiting for an exact-text approval. Shown only when Phase 2A is on. */
export default function QueueScreen() {
  const [actorUserId, setActorUserId] = useState("");
  const [sendUndo, setSendUndo] = useState(false);
  const [contexts, setContexts] = useState<WorkContext[]>([]);
  const [contextId, setContextId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<OutboundDraft[]>([]);

  const load = useCallback(async (nextContextId?: string) => {
    const [me, next] = await Promise.all([rpc("me"), rpc("phase2a/contexts/list")]);
    setActorUserId(me.userId);
    setSendUndo(me.sendUndoEnabled === true);
    setContexts(next);
    const id = nextContextId ?? next[0]?.id ?? null;
    setContextId(id);
    setDrafts(id ? await rpc("phase2a/drafts/list", { contextId: id }) : []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView>
      <ApprovalQueue
        actorUserId={actorUserId}
        contexts={contexts}
        contextId={contextId}
        drafts={drafts}
        onSelectContext={(id) => void load(id)}
        onCreateContext={(kind, label) =>
          void rpc("phase2a/contexts/create", { kind, label }).then((created) => load(created.id))
        }
        onCreateDraft={(input) => {
          if (!contextId) return;
          void rpc("phase2a/drafts/create", { contextId, ...input }).then(() => load(contextId));
        }}
        onSubmit={(id) => {
          if (!contextId) return;
          void rpc("phase2a/drafts/submit", { id }).then(() => load(contextId));
        }}
        onApprove={(id) => {
          if (!contextId) return;
          void rpc("phase2a/drafts/approve", { id }).then(() => load(contextId));
        }}
        sendUndo={sendUndo}
        onCancel={(id) => {
          if (!contextId) return;
          void rpc("phase2a/drafts/cancel", { id }).then(() => load(contextId));
        }}
      />
    </ScrollView>
  );
}
