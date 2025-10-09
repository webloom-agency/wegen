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
  const search = url.searchParams.get("search");

  if ((me as any)?.role === "admin") {
    // Admin: show all threads; if agent filter present, still respect it by showing only threads referencing that agent
    let threads;
    
    if (agentId && search) {
      // Both agent filter and search: get threads for specific agent, then filter by search within those
      threads = await chatRepository.selectThreadsByAgentVisibleToUser(session.user.id, agentId);
      const filteredThreads = (threads || []).filter((t: any) => (t.lastMessageAt ?? 0) > 0);
      // For agent-filtered threads, only search by title (agent is already filtered)
      return Response.json(filteredThreads.filter(thread => 
        (thread.title || "").toLowerCase().includes(search.toLowerCase())
      ));
    } else if (agentId) {
      // Only agent filter: show all threads using this agent
      threads = await chatRepository.selectThreadsByAgentVisibleToUser(session.user.id, agentId);
    } else if (search) {
      // Only search: search across all threads by title and agent name
      threads = await chatRepository.selectAllThreadsWithEmails();
      const filteredThreads = (threads || []).filter((t: any) => (t.lastMessageAt ?? 0) > 0);
      return Response.json(await filterThreadsBySearch(filteredThreads, search, session.user.id));
    } else {
      // No filters: show all threads
      threads = await chatRepository.selectAllThreadsWithEmails();
    }
    
    // Hide empty threads (no messages) from the list
    const filteredThreads = (threads || []).filter((t: any) => (t.lastMessageAt ?? 0) > 0);
    return Response.json(filteredThreads);
  }

  let threads;
  
  if (agentId && search) {
    // Both agent filter and search: get threads for specific agent, then filter by search within those
    threads = await chatRepository.selectThreadsByAgentVisibleToUser(session.user.id, agentId);
    const filteredThreads = (threads || []).filter((t: any) => (t.lastMessageAt ?? 0) > 0);
    // For agent-filtered threads, only search by title (agent is already filtered)
    return Response.json(filteredThreads.filter(thread => 
      (thread.title || "").toLowerCase().includes(search.toLowerCase())
    ));
  } else if (agentId) {
    // Only agent filter: show all threads using this agent
    threads = await chatRepository.selectThreadsByAgentVisibleToUser(session.user.id, agentId);
  } else if (search) {
    // Only search: search across all threads by title and agent name
    threads = await chatRepository.selectThreadsByUserId(session.user.id);
    const filteredThreads = (threads || []).filter((t: any) => (t.lastMessageAt ?? 0) > 0);
    return Response.json(await filterThreadsBySearch(filteredThreads, search, session.user.id));
  } else {
    // No filters: show all threads
    threads = await chatRepository.selectThreadsByUserId(session.user.id);
  }
  
  // Hide empty threads (no messages) from the list
  const filteredThreads = (threads || []).filter((t: any) => (t.lastMessageAt ?? 0) > 0);
  return Response.json(filteredThreads);
}

// Helper function to filter threads by search query (title or agent name)
async function filterThreadsBySearch(threads: any[], search: string, userId: string) {
  const query = search.toLowerCase().trim();
  
  // Return early if search is too short
  if (query.length < 2) {
    return threads;
  }
  
  const { agentRepository, chatRepository } = await import("lib/db/repository");
  const filteredThreads: any[] = [];
  
  // First pass: filter by title (fast)
  const titleMatches = threads.filter(thread => 
    (thread.title || "").toLowerCase().includes(query)
  );
  
  // Add title matches to results
  filteredThreads.push(...titleMatches);
  
  // Second pass: find threads by agent name (slower)
  // Get all agents accessible to the user for agent name matching
  const userAgents = await agentRepository.selectAgents(userId, ["all"], 1000);
  const matchingAgentIds = userAgents
    .filter(agent => agent.name.toLowerCase().includes(query))
    .map(agent => agent.id);
  
  if (matchingAgentIds.length > 0) {
    // Get all threads that use any of the matching agents
    const agentThreadPromises = matchingAgentIds.map(agentId => 
      chatRepository.selectThreadsByUserIdAndAgentId(userId, agentId)
    );
    
    const agentThreadsResults = await Promise.all(agentThreadPromises);
    const agentThreadIds = new Set(
      agentThreadsResults.flat().map(t => t.id)
    );
    
    // Add threads that match by agent but not already included by title
    const titleMatchIds = new Set(titleMatches.map(t => t.id));
    const agentOnlyMatches = threads.filter(thread => 
      agentThreadIds.has(thread.id) && !titleMatchIds.has(thread.id)
    );
    
    filteredThreads.push(...agentOnlyMatches);
  }
  
  return filteredThreads;
}
