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

  // Debug logging
  console.log("Thread API called with:", { agentId, search, userId: session.user.id });

  if ((me as any)?.role === "admin") {
    // Admin: show all threads; if agent filter present, still respect it by showing only threads referencing that agent
    let threads;
    
    if (agentId && search) {
      // Both agent filter and search: get USER'S threads for specific agent, then filter by search within those
      threads = await chatRepository.selectThreadsByUserIdAndAgentId(session.user.id, agentId);
      const filteredThreads = (threads || []).filter((t: any) => (t.lastMessageAt ?? 0) > 0);
      // For agent-filtered threads, only search by title (simple contains)
      const query = search.toLowerCase().trim();
      return Response.json(filteredThreads.filter(thread => {
        const title = (thread.title || "").toLowerCase();
        return title.includes(query);
      }));
    } else if (agentId) {
      // Only agent filter: show all threads that actually used this agent
      // Due to data corruption issues, let's implement our own filtering
      const allThreads = await chatRepository.selectAllThreadsWithEmails();
      const filteredThreads = [];
      
      for (const thread of allThreads) {
        const messages = await chatRepository.selectMessagesByThreadId(thread.id);
        let threadUsesAgent = false;
        
        for (const message of messages) {
          const annotations = (message as any).annotations || [];
          // Check if any annotation in this specific message references our agent
          const hasAgentInMessage = annotations.some((ann: any) => 
            ann && typeof ann === 'object' && ann.agentId === agentId
          );
          if (hasAgentInMessage) {
            threadUsesAgent = true;
            break;
          }
        }
        
        if (threadUsesAgent) {
          filteredThreads.push(thread);
        }
      }
      
      threads = filteredThreads;
      console.log(`Found ${threads?.length || 0} threads that actually use agent ${agentId}:`, threads?.map(t => ({ id: t.id, title: t.title || 'Untitled' })));
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
    // Both agent filter and search: get USER'S threads for specific agent, then filter by search within those
    threads = await chatRepository.selectThreadsByUserIdAndAgentId(session.user.id, agentId);
    const filteredThreads = (threads || []).filter((t: any) => (t.lastMessageAt ?? 0) > 0);
    // For agent-filtered threads, only search by title (simple contains)
    const query = search.toLowerCase().trim();
    return Response.json(filteredThreads.filter(thread => {
      const title = (thread.title || "").toLowerCase();
      return title.includes(query);
    }));
  } else if (agentId) {
    // Only agent filter: show ALL threads (from any user) that actually used this agent
    // Due to data corruption issues, let's implement our own filtering
    const allThreads = await chatRepository.selectAllThreadsWithEmails();
    const filteredThreads = [];
    
    for (const thread of allThreads) {
      const messages = await chatRepository.selectMessagesByThreadId(thread.id);
      let threadUsesAgent = false;
      
      for (const message of messages) {
        const annotations = (message as any).annotations || [];
        // Check if any annotation in this specific message references our agent
        const hasAgentInMessage = annotations.some((ann: any) => 
          ann && typeof ann === 'object' && ann.agentId === agentId
        );
        if (hasAgentInMessage) {
          threadUsesAgent = true;
          break;
        }
      }
      
      if (threadUsesAgent) {
        filteredThreads.push(thread);
      }
    }
    
    threads = filteredThreads;
    console.log(`Found ${threads?.length || 0} threads that actually use agent ${agentId} (non-admin):`, threads?.map(t => ({ id: t.id, title: t.title || 'Untitled' })));
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

// Helper function to filter threads by search query (title only for testing)
async function filterThreadsBySearch(threads: any[], search: string, userId: string) {
  const query = search.toLowerCase().trim();
  
  // Return early if search is too short
  if (query.length < 2) {
    return threads;
  }
  
  // For testing: only filter by title contains (simple includes, not word boundaries)
  const titleMatches = threads.filter(thread => {
    const title = (thread.title || "").toLowerCase();
    return title.includes(query);
  });
  
  return titleMatches;
}
