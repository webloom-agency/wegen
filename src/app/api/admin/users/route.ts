import { getSession } from "auth/server";
import { userRepository } from "lib/db/repository";

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  // Only admin can list users
  if ((session.user as any).role !== "admin") {
    // Fallback: check from DB if not present on session
    const me = await userRepository.findById(session.user.id);
    if (me?.role !== "admin") return new Response("Forbidden", { status: 403 });
  }

  const users = await userRepository.listAll();
  return Response.json(users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, image: u.image })));
} 