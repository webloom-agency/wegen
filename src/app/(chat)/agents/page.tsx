import { agentRepository, userRepository } from "lib/db/repository";
import { getSession } from "auth/server";
import { notFound } from "next/navigation";
import { AgentsList } from "@/components/agent/agents-list";

export default async function AgentsPage() {
  const session = await getSession();

  if (!session?.user.id) {
    notFound();
  }

  // Determine admin and choose filters accordingly (admins see all)
  const me = await userRepository.findById(session.user.id);
  const isAdmin = (me as any)?.role === "admin";
  const filters = isAdmin ? ["all"] : ["mine", "shared"];

  // Fetch agents data on the server
  const allAgents = await agentRepository.selectAgents(
    session.user.id,
    filters,
    50,
  );

  // Separate into my agents and shared agents
  const myAgents = allAgents.filter(
    (agent) => agent.userId === session.user.id,
  );
  const sharedAgents = allAgents.filter(
    (agent) => agent.userId !== session.user.id,
  );

  return (
    <AgentsList
      initialMyAgents={myAgents}
      initialSharedAgents={sharedAgents}
      userId={session.user.id}
      isAdminDefault={isAdmin}
    />
  );
}
