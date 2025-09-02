import { getSession } from "auth/server";
import { workflowRepository } from "lib/db/repository";
import { generateUUID } from "lib/utils";

function remapMentionsDeep(value: any, nodeIdMap: Map<string, string>): any {
  if (Array.isArray(value)) {
    return value.map((v) => remapMentionsDeep(v, nodeIdMap));
  }
  if (value && typeof value === "object") {
    const next: any = {};
    for (const [k, v] of Object.entries(value)) {
      next[k] = remapMentionsDeep(v, nodeIdMap);
    }
    // Remap TipTap mentions
    if (
      typeof next?.type === "string" &&
      next.type === "mention" &&
      next.attrs &&
      typeof next.attrs.label === "string"
    ) {
      try {
        const parsed = JSON.parse(next.attrs.label);
        if (parsed && typeof parsed === "object" && parsed.nodeId) {
          const mapped = nodeIdMap.get(parsed.nodeId);
          if (mapped) {
            parsed.nodeId = mapped;
            next.attrs.label = JSON.stringify(parsed);
          }
        }
      } catch {}
    }
    // Remap structured OutputSchemaSourceKey objects { nodeId, path }
    if (
      typeof next.nodeId === "string" &&
      Array.isArray(next.path)
    ) {
      const mapped = nodeIdMap.get(next.nodeId);
      if (mapped) next.nodeId = mapped;
    }
    // Remap explicit loop pairing: startNodeId
    if (typeof next.startNodeId === "string") {
      const mapped = nodeIdMap.get(next.startNodeId);
      if (mapped) next.startNodeId = mapped;
    }
    return next;
  }
  return value;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();

  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const hasAccess = await workflowRepository.checkAccess(id, session.user.id, true);
  if (!hasAccess) {
    return new Response("Unauthorized", { status: 401 });
  }

  const source = await workflowRepository.selectStructureById(id);
  if (!source) {
    return new Response("Not Found", { status: 404 });
  }

  const duplicated = await workflowRepository.save({
    name: `${source.name} (copy)`,
    description: source.description,
    icon: source.icon,
    isPublished: false,
    visibility: "private",
    userId: session.user.id,
  }, true);

  // First pass: build complete old->new node ID map
  const nodeIdMap = new Map<string, string>();
  for (const node of source.nodes || []) {
    nodeIdMap.set(node.id, generateUUID());
  }

  // Second pass: create nodes with remapped mentions using the full map
  const newNodes = (source.nodes || []).map((node) => {
    const newId = nodeIdMap.get(node.id)!;
    return {
      id: newId,
      workflowId: duplicated.id,
      kind: node.kind,
      name: node.name,
      description: node.description,
      nodeConfig: remapMentionsDeep(node.nodeConfig, nodeIdMap),
      uiConfig: node.uiConfig,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  const newEdges = (source.edges || []).map((edge) => ({
    id: generateUUID(),
    workflowId: duplicated.id,
    source: nodeIdMap.get(edge.source) || edge.source,
    target: nodeIdMap.get(edge.target) || edge.target,
    uiConfig: edge.uiConfig,
    createdAt: new Date(),
  }));

  await workflowRepository.saveStructure({
    workflowId: duplicated.id,
    nodes: newNodes,
    edges: newEdges,
  });

  return Response.json(duplicated);
} 