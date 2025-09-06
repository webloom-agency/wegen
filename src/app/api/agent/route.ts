import { agentRepository } from "lib/db/repository";
import { getSession } from "auth/server";
import { z } from "zod";
import { serverCache } from "lib/cache";
import { CacheKeys } from "lib/cache/cache-keys";
import { AgentCreateSchema, AgentQuerySchema } from "app-types/agent";
import { compressPdfAttachmentsIfNeeded } from "lib/pdf/compress";

export async function GET(request: Request) {
  const session = await getSession();

  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams);
    const {
      type,
      filters: filtersParam,
      limit,
    } = AgentQuerySchema.parse(queryParams);

    // Parse filters - can be passed as comma-separated string or single type
    let filters;
    if (filtersParam) {
      filters = filtersParam.split(",").map((f) => f.trim());
    } else {
      // Fallback to single type parameter for backward compatibility
      filters = [type];
    }

    // Use the new simplified selectAgents method with database-level filtering and limiting
    const agents = await agentRepository.selectAgents(
      session.user.id,
      filters,
      limit,
    );
    return Response.json(agents);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid query parameters", details: error.errors },
        { status: 400 },
      );
    }

    console.error("Failed to fetch agents:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const session = await getSession();

  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body = await request.json();
    const data = AgentCreateSchema.parse(body);

    // Compress large PDF attachments in agent instructions, if any
    const compressedInstructions = {
      ...data.instructions,
      attachments: data.instructions?.attachments
        ? await compressPdfAttachmentsIfNeeded(data.instructions.attachments as any)
        : data.instructions?.attachments,
    } as any;

    const agent = await agentRepository.insertAgent({
      ...data,
      instructions: compressedInstructions,
      userId: session.user.id,
    });
    serverCache.delete(CacheKeys.agentInstructions(agent.id));

    return Response.json(agent);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 },
      );
    }

    console.error("Failed to upsert agent:", error);
    return Response.json(
      { message: "Internal Server Error" },
      {
        status: 500,
      },
    );
  }
}
