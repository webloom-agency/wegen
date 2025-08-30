import { getSession } from "auth/server";
import { workflowRepository } from "lib/db/repository";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  const hasAccess = await workflowRepository.checkAccess(id, session.user.id);
  if (!hasAccess) {
    return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const workflow = await workflowRepository.selectStructureById(id);
  return new Response(JSON.stringify(workflow), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { visibility, isPublished, name, description, icon } = await request.json();

  const session = await getSession();
  const hasAccess = await workflowRepository.checkAccess(
    id,
    session.user.id,
    false,
  );
  if (!hasAccess) {
    return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  // Get existing workflow
  const existingWorkflow = await workflowRepository.selectById(id);
  if (!existingWorkflow) {
    return new Response("Workflow not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  // Update only the specified fields
  const updatedWorkflow = await workflowRepository.save({
    ...existingWorkflow,
    name: name ?? existingWorkflow.name,
    description: description ?? existingWorkflow.description,
    icon: icon ?? existingWorkflow.icon,
    visibility: visibility ?? existingWorkflow.visibility,
    isPublished: isPublished ?? existingWorkflow.isPublished,
    updatedAt: new Date(),
  });

  return new Response(JSON.stringify(updatedWorkflow), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  const hasAccess = await workflowRepository.checkAccess(
    id,
    session.user.id,
    false,
  );
  if (!hasAccess) {
    return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  await workflowRepository.delete(id);
  return new Response(JSON.stringify({ message: "Workflow deleted" }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
