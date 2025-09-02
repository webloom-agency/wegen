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
    // If this looks like a TipTap mention part, remap its attrs.label
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

  const nodeIdMap = new Map<string, string>();
  const newNodes = (source.nodes || []).map((node) => {
    const newId = generateUUID();
    nodeIdMap.set(node.id, newId);
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