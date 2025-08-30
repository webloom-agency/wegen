import { getSession } from "auth/server";
import { workflowRepository } from "lib/db/repository";

export async function GET() {
  const session = await getSession();
  const workflows = await workflowRepository.selectAll(session.user.id);
  return Response.json(workflows);
}

export async function POST(request: Request) {
  const {
    name,
    description,
    icon,
    id,
    isPublished,
    visibility,
    noGenerateInputNode,
  } = await request.json();

  const session = await getSession();

  let base = {
    name,
    description,
    id,
    isPublished,
    visibility,
    icon,
    userId: session.user.id,
  } as any;

  if (id) {
    const hasAccess = await workflowRepository.checkAccess(
      id,
      session.user.id,
      false,
    );
    if (!hasAccess) {
      return new Response("Unauthorized", { status: 401 });
    }
    // Merge with existing workflow so unspecified fields are preserved
    const existing = await workflowRepository.selectById(id);
    if (!existing) {
      return new Response("Workflow not found", { status: 404 });
    }
    base = {
      ...existing,
      name: name ?? existing.name,
      description: description ?? existing.description,
      icon: icon ?? existing.icon,
      isPublished: isPublished ?? existing.isPublished,
      visibility: visibility ?? existing.visibility,
      userId: existing.userId, // do not change owner
    };
  }

  const workflow = await workflowRepository.save(base, noGenerateInputNode);

  return Response.json(workflow);
}
