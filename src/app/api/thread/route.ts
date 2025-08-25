import { getSession } from "auth/server";
import { chatRepository } from "lib/db/repository";

export async function GET(request: Request) {
  const session = await getSession();

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const agentId = url.searchParams.get("agentId");
  const threads = agentId
    ? await chatRepository.selectThreadsByUserIdAndAgentId(
        session.user.id,
        agentId,
      )
    : await chatRepository.selectThreadsByUserId(session.user.id);
  return Response.json(threads);
}
