import { chatRepository } from "lib/db/repository";
import { getSession } from "lib/auth";
import { redirect } from "next/navigation";
import { generateUUID } from "lib/utils";
import { generateTitleFromUserMessageAction } from "../chat/actions";

export async function POST(request: Request) {
  const { id, projectId, message, model } = await request.json();

  const session = await getSession();

  if (!session?.user.id) {
    return redirect("/login");
  }

  const title = await generateTitleFromUserMessageAction({
    message,
    model,
  });

  const newThread = await chatRepository.insertThread({
    id: id ?? generateUUID(),
    projectId,
    title,
    userId: session.user.id,
  });

  return Response.json({
    threadId: newThread.id,
  });
}
