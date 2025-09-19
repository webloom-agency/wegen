import { agentRepository, userRepository } from "lib/db/repository";
import { getSession } from "auth/server";
import { z } from "zod";
import { AgentUpdateSchema } from "app-types/agent";
import { serverCache } from "lib/cache";
import { CacheKeys } from "lib/cache/cache-keys";
import { compressPdfAttachmentsIfNeeded } from "lib/pdf/compress";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();

  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  const hasAccess = await agentRepository.checkAccess(id, session.user.id);
  if (!hasAccess) {
    return new Response("Unauthorized", { status: 401 });
  }

  const agent = await agentRepository.selectAgentById(id, session.user.id);
  return Response.json(agent);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();

  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const data = AgentUpdateSchema.parse(body);

    // Check access for write operations
    const hasAccess = await agentRepository.checkAccess(id, session.user.id);
    if (!hasAccess) {
      return new Response("Unauthorized", { status: 401 });
    }

    // For non-owners of public agents, preserve original visibility unless admin
    const existingAgent = await agentRepository.selectAgentById(id, session.user.id);
    const me = await userRepository.findById(session.user.id);
    const isAdmin = (me as any)?.role === "admin";
    if (!isAdmin && existingAgent && existingAgent.userId !== session.user.id) {
      data.visibility = existingAgent.visibility;
    }

    // Compress large PDF attachments in agent instructions, if any
    const compressedData = {
      ...data,
      instructions: data.instructions
        ? {
            ...data.instructions,
            attachments: data.instructions.attachments
              ? await compressPdfAttachmentsIfNeeded(data.instructions.attachments as any)
              : data.instructions.attachments,
          }
        : undefined,
    } as any;

    const agent = await agentRepository.updateAgent(id, session.user.id, compressedData);
    serverCache.delete(CacheKeys.agentInstructions(agent.id));

    return Response.json(agent);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 },
      );
    }

    console.error("Failed to update agent:", error);
    return Response.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();

  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { id } = await params;
    const hasAccess = await agentRepository.checkAccess(
      id,
      session.user.id,
      true, // destructive = true for delete operations
    );
    if (!hasAccess) {
      return new Response("Unauthorized", { status: 401 });
    }
    await agentRepository.deleteAgent(id, session.user.id);
    serverCache.delete(CacheKeys.agentInstructions(id));
    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to delete agent:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
