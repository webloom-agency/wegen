import { getSession } from "auth/server";
import { chatRepository, userRepository } from "lib/db/repository";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const me = await userRepository.findById(session.user.id);
  if (me?.role !== "admin") return new Response("Forbidden", { status: 403 });

  const { id } = await params;
  if (!id) return new Response("Bad Request", { status: 400 });

  const targetUser = await userRepository.findById(id);
  if (!targetUser) return new Response("User not found", { status: 404 });

  await chatRepository.deleteAllThreads(id);
  return Response.json({ success: true });
} 