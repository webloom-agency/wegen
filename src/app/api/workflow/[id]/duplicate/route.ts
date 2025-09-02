import { getSession } from "auth/server";
import { workflowRepository } from "lib/db/repository";
import { generateUUID } from "lib/utils";

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
    name: `${source.name}`,
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
      nodeConfig: node.nodeConfig,
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