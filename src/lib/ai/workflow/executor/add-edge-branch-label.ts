import { DBEdge, DBNode } from "app-types/workflow";
import { NodeKind } from "../workflow.interface";

export function addEdgeBranchLabel(nodes: DBNode[], edges: DBEdge[]) {
  const outs = (id: string) => edges.filter((e) => e.source === id);
  const start = nodes.find((n) => n.kind === NodeKind.Input)!;
  // Track: bid = concurrency label, cgid = last condition ancestor id (if any), handleKey = branch handle id at that condition
  const q: { id: string; bid: string; cgid?: string; handleKey?: string }[] = [
    { id: start.id, bid: "B0" },
  ];

  while (q.length) {
    const { id, bid, cgid, handleKey } = q.shift()!;
    const node = nodes.find((n) => n.id === id)!;
    const nexts = outs(id);

    if (node.kind === NodeKind.Condition) {
      const byHandle = new Map<string, DBEdge[]>();
      nexts.forEach((e) => {
        const h = e.uiConfig.sourceHandle ?? "right";
        (byHandle.get(h) ?? byHandle.set(h, []).get(h))!.push(e);
      });
      byHandle.forEach((group) => {
        if (group.length === 1) {
          const [e] = group;
          // Always recompute label to avoid stale persisted labels breaking joins
          e.uiConfig.label = bid;
          // Mark condition ancestry and handle key for downstream join logic (preserve first condition ancestor)
          const nextCgid = cgid ?? node.id;
          const nextHandleKey = handleKey ?? (e.uiConfig.sourceHandle ?? "right");
          e.uiConfig.cgid = nextCgid;
          e.uiConfig.handleKey = nextHandleKey;
          q.push({ id: e.target, bid, cgid: nextCgid, handleKey: nextHandleKey });
        } else {
          group.forEach((e, i) => {
            const newBid = `${bid}.${i}`;
            // Always recompute label to avoid stale persisted labels breaking joins
            e.uiConfig.label = newBid;
            // Mark condition ancestry and handle key for downstream join logic (preserve first condition ancestor)
            const nextCgid = cgid ?? node.id;
            const nextHandleKey = handleKey ?? (e.uiConfig.sourceHandle ?? "right");
            e.uiConfig.cgid = nextCgid;
            e.uiConfig.handleKey = nextHandleKey;
            q.push({ id: e.target, bid: newBid, cgid: nextCgid, handleKey: nextHandleKey });
          });
        }
      });
    } else {
      nexts.forEach((e, i) => {
        const newBid = nexts.length > 1 ? `${bid}.${i}` : bid;
        // Always recompute label to avoid stale persisted labels breaking joins
        e.uiConfig.label = newBid;
        // Propagate condition ancestry and handle key unchanged
        if (cgid) e.uiConfig.cgid = cgid;
        if (handleKey) e.uiConfig.handleKey = handleKey;
        q.push({ id: e.target, bid: newBid, cgid, handleKey });
      });
    }
  }
}
