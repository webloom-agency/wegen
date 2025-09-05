import { categoryRepository } from "lib/db/repository";
import { getSession } from "auth/server";
import { z } from "zod";
import { CategoryUpdateSchema } from "app-types/category";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();

  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  try {
    const category = await categoryRepository.getCategoryById(id);

    if (!category) {
      return Response.json({ error: "Category not found" }, { status: 404 });
    }

    // Allow if owner or public/readonly
    if (
      category.userId !== session.user.id &&
      !(category.visibility === "public" || category.visibility === "readonly")
    ) {
      return new Response("Forbidden", { status: 403 });
    }

    // Get items
    const items = await categoryRepository.getCategoryItems(id);

    return Response.json({
      ...category,
      items,
    });
  } catch (error) {
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();

  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  try {
    // Check if category exists and user owns it
    const existingCategory = await categoryRepository.getCategoryById(id);

    if (!existingCategory) {
      return Response.json({ error: "Category not found" }, { status: 404 });
    }

    if (existingCategory.userId !== session.user.id) {
      return new Response("Forbidden", { status: 403 });
    }

    const body = await request.json();
    const data = CategoryUpdateSchema.parse(body);

    const category = await categoryRepository.updateCategory(id, {
      name: data.name,
      description: data.description || null,
      visibility: (body.visibility as any) || existingCategory.visibility,
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();

  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  try {
    const existingCategory = await categoryRepository.getCategoryById(id);

    if (!existingCategory) {
      return Response.json({ error: "Category not found" }, { status: 404 });
    }

    if (existingCategory.userId !== session.user.id) {
      return new Response("Forbidden", { status: 403 });
    }

    await categoryRepository.deleteCategory(id);

    return Response.json({ success: true });
  } catch (error) {
    return new Response("Internal Server Error", { status: 500 });
  }
} 