import { getSession } from "auth/server";
import { chatRepository, userRepository, agentRepository } from "lib/db/repository";

export async function GET(request: Request) {
  const session = await getSession();

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const me = await userRepository.findById(session.user.id);
  const url = new URL(request.url);
  const agentId = url.searchParams.get("agentId");
  const search = url.searchParams.get("search");

  // Debug logging
  console.log("Thread API called with:", { agentId, search, userId: session.user.id });

  // Convert agentId to agent name for search
  let effectiveSearch = search;
  if (agentId) {
    try {
      const agent = await agentRepository.selectAgentById(agentId, session.user.id);
      if (agent) {
        effectiveSearch = agent.name;
        console.log(`Converting agentId ${agentId} to search for agent name: "${agent.name}"`);
      }
    } catch (error) {
      console.error("Error fetching agent:", error);
    }
  }

  // Determine which threads to search based on whether we're filtering by agent or doing general search
  let threads;
  
  if (agentId) {
    // Agent filter: EVERYONE sees all threads that used this agent (agent permissions already checked in sidebar)
    threads = await chatRepository.selectAllThreadsWithEmails();
    console.log(`Agent filter active - searching ALL threads for agent: ${effectiveSearch}`);
  } else {
    // Regular search: admins see all threads, users see only their own
    if ((me as any)?.role === "admin") {
      threads = await chatRepository.selectAllThreadsWithEmails();
    } else {
      threads = await chatRepository.selectThreadsByUserId(session.user.id);
    }
  }
  
  const filteredThreads = (threads || []).filter((t: any) => (t.lastMessageAt ?? 0) > 0);
  
  if (effectiveSearch) {
    return Response.json(await filterThreadsBySearch(filteredThreads, effectiveSearch, session.user.id));
  }
  
  return Response.json(filteredThreads);
}

// Helper function to filter threads by search query (title only for performance)
async function filterThreadsBySearch(threads: any[], search: string, userId: string) {
  const query = search.toLowerCase().trim();
  
  // Return early if search is too short
  if (query.length < 2) {
    return threads;
  }
  
  // Only search by title for performance - message content search is too expensive
  const titleMatches = threads.filter(thread => {
    const title = (thread.title || "").toLowerCase();
    return title.includes(query);
  });
  
  return titleMatches;
}
