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

// Helper function to filter threads by search query (title and agent name)
async function filterThreadsBySearch(threads: any[], search: string, userId: string) {
  const query = search.toLowerCase().trim();
  
  // Return early if search is too short
  if (query.length < 2) {
    return threads;
  }
  
  const filteredThreads: any[] = [];
  
  // First pass: check titles (fast)
  const titleMatches = threads.filter(thread => {
    const title = (thread.title || "").toLowerCase();
    return title.includes(query);
  });
  
  filteredThreads.push(...titleMatches);
  
  // Second pass: check agent names in messages (slower, but necessary)
  const remainingThreads = threads.filter(thread => {
    const title = (thread.title || "").toLowerCase();
    return !title.includes(query); // Only check threads that didn't match by title
  });
  
  for (const thread of remainingThreads) {
    try {
      const messages = await chatRepository.selectMessagesByThreadId(thread.id);
      let foundAgentMatch = false;
      
      for (const message of messages) {
        // Extract text content from message parts
        const textPart = message.parts?.find((p: any) => p?.type === "text");
        const content = (textPart?.text || "").toLowerCase();
        // Look for @agent("name") patterns or similar
        if (content.includes(query)) {
          foundAgentMatch = true;
          break;
        }
      }
      
      if (foundAgentMatch) {
        filteredThreads.push(thread);
      }
    } catch (error) {
      console.error(`Error checking messages for thread ${thread.id}:`, error);
    }
  }
  
  // Remove duplicates and return
  const uniqueThreads = Array.from(new Map(filteredThreads.map(t => [t.id, t])).values());
  return uniqueThreads;
}
