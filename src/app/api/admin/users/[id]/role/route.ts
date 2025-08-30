import { getSession } from "auth/server";
import { userRepository } from "lib/db/repository";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const me = await userRepository.findById(session.user.id);
  if (me?.role !== "admin") return new Response("Forbidden", { status: 403 });

  const body = await request.json();
  const { role } = body as { role?: "user" | "admin" };
  if (role !== "user" && role !== "admin") {
    return new Response("Invalid role", { status: 400 });
  }
  const { id } = await params;
  if (!id) return new Response("Bad Request", { status: 400 });

  const updated = await userRepository.updateRole(id, role);
  return Response.json({ id: updated.id, role: updated.role });
} 