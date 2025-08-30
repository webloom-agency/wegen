import { getSession } from "auth/server";
import { userRepository } from "lib/db/repository";

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const me = await userRepository.findById(session.user.id);
  if (!me) return new Response("Unauthorized", { status: 401 });
  return Response.json({ id: me.id, email: me.email, name: me.name, role: (me as any).role || "user", image: me.image });
} 