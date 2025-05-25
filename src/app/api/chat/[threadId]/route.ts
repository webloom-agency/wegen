import { chatRepository } from "lib/db/repository";
import { NextRequest } from "next/server";
import { generateTitleFromUserMessageAction } from "../actions";
import { auth } from "../../auth/auth";
import { customModelProvider } from "lib/ai/models";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const session = await auth();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { threadId } = await params;
  const { messages, model, projectId } = await request.json();

  console.dir({ messages, model, projectId, threadId }, { depth: null });

  let thread = await chatRepository.selectThread(threadId);
  if (!thread) {
    const title = await generateTitleFromUserMessageAction({
      message: messages[0],
      model: customModelProvider.getModel(model),
    });
    thread = await chatRepository.insertThread({
      id: threadId,
      projectId: projectId ?? null,
      title,
      userId: session.user.id,
    });
  }
  await chatRepository.insertMessages(
    messages.map((message) => ({
      ...message,
      threadId: thread.id,
    })),
  );
  return new Response(
    JSON.stringify({
      success: true,
    }),
    {
      status: 200,
    },
  );
}
