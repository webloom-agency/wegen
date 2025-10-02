import { getSession } from "auth/server";
import { agentRepository } from "lib/db/repository";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();

  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const hasAccess = await agentRepository.checkAccess(id, session.user.id, false);
  if (!hasAccess) {
    return new Response("Unauthorized", { status: 401 });
  }

  const sourceAgent = await agentRepository.selectAgentById(id, session.user.id);
  if (!sourceAgent) {
    return new Response("Not Found", { status: 404 });
  }

  const duplicated = await agentRepository.insertAgent({
    name: `${sourceAgent.name} (copy)`,
    description: sourceAgent.description,
    icon: sourceAgent.icon,
    instructions: sourceAgent.instructions,
    userId: session.user.id,
    visibility: "readonly",
  });

  return Response.json(duplicated);
} 