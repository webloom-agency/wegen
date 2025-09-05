import { categoryRepository } from "lib/db/repository";
import { getSession } from "auth/server";
import { z } from "zod";
import { CategoryCreateSchema } from "app-types/category";

export async function GET() {
  const session = await getSession();

  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // For now, return only user's categories; UI can fetch shared separately if needed
    const categories = await categoryRepository.getCategoriesByUserId(
      session.user.id,
    );
    return Response.json(categories);
  } catch (error) {
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();

  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body = await request.json();
    const data = CategoryCreateSchema.parse(body);

    const category = await categoryRepository.createCategory({
      name: data.name,
      description: data.description || null,
      userId: session.user.id,
      visibility: "private",
    });

    return Response.json(category);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 },
      );
    }

    return Response.json({ message: "Internal Server Error" }, { status: 500 });
  }
} 