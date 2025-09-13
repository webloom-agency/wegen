import { getSession } from "auth/server";
import { chatRepository, userRepository } from "lib/db/repository";

export async function GET(request: Request) {
  const session = await getSession();

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const me = await userRepository.findById(session.user.id);
  const url = new URL(request.url);
  const agentId = url.searchParams.get("agentId");

  if ((me as any)?.role === "admin") {
    // Admin: show all threads; if agent filter present, still respect it by showing only threads referencing that agent
    const threads = agentId
      ? await chatRepository.selectThreadsByAgentVisibleToUser(session.user.id, agentId)
      : await chatRepository.selectAllThreadsWithEmails();
    // Hide empty threads (no messages) from the list
    return Response.json((threads || []).filter((t: any) => (t.lastMessageAt ?? 0) > 0));
  }

  const threads = agentId
    ? await chatRepository.selectThreadsByAgentVisibleToUser(
        session.user.id,
        agentId,
      )
    : await chatRepository.selectThreadsByUserId(session.user.id);
  // Hide empty threads (no messages) from the list
  return Response.json((threads || []).filter((t: any) => (t.lastMessageAt ?? 0) > 0));
}
