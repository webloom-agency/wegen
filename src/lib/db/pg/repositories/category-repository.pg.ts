import {
  Category,
  CategoryItem,
  CategoryRepository,
  CategoryWithItemCount,
} from "app-types/category";
import { pgDb as db } from "../db.pg";
import { CategorySchema, CategoryItemSchema } from "../schema.pg";
import { and, eq, count } from "drizzle-orm";
import { generateUUID } from "lib/utils";

export const pgCategoryRepository: CategoryRepository = {
  async createCategory(category) {
    const [result] = await db
      .insert(CategorySchema)
      .values({
        id: generateUUID(),
        name: category.name,
        description: category.description,
        userId: category.userId,
        visibility: category.visibility || ("private" as const),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return result as Category;
  },

  async getCategoriesByUserId(userId) {
    const result = await db
      .select({
        id: CategorySchema.id,
        name: CategorySchema.name,
        description: CategorySchema.description,
        userId: CategorySchema.userId,
        visibility: CategorySchema.visibility,
        createdAt: CategorySchema.createdAt,
        updatedAt: CategorySchema.updatedAt,
        itemCount: count(CategoryItemSchema.id),
      })
      .from(CategorySchema)
      .leftJoin(
        CategoryItemSchema,
        eq(CategorySchema.id, CategoryItemSchema.categoryId),
      )
      .where(eq(CategorySchema.userId, userId))
      .groupBy(CategorySchema.id)
      .orderBy(CategorySchema.updatedAt);

    return result.map((row) => ({
      ...row,
      itemCount: Number(row.itemCount),
    })) as CategoryWithItemCount[];
  },

  async getCategoryById(id) {
    const [result] = await db
      .select()
      .from(CategorySchema)
      .where(eq(CategorySchema.id, id));
    return result as Category | null;
  },

  async updateCategory(id, category) {
    const [result] = await db
      .update(CategorySchema)
      .set({
        name: category.name,
        description: category.description,
        visibility: category.visibility,
        updatedAt: new Date(),
      })
      .where(eq(CategorySchema.id, id))
      .returning();
    return result as Category;
  },

  async deleteCategory(id) {
    await db
      .delete(CategoryItemSchema)
      .where(eq(CategoryItemSchema.categoryId, id));
    await db.delete(CategorySchema).where(eq(CategorySchema.id, id));
  },

  async addItemToCategory(categoryId, itemId, userId) {
    const [result] = await db
      .insert(CategoryItemSchema)
      .values({
        id: generateUUID(),
        categoryId,
        itemId,
        userId,
        addedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    return result as CategoryItem;
  },

  async removeItemFromCategory(categoryId, itemId) {
    await db
      .delete(CategoryItemSchema)
      .where(
        and(
          eq(CategoryItemSchema.categoryId, categoryId),
          eq(CategoryItemSchema.itemId, itemId),
        ),
      );
  },

  async getCategoryItems(categoryId) {
    const result = await db
      .select()
      .from(CategoryItemSchema)
      .where(eq(CategoryItemSchema.categoryId, categoryId))
      .orderBy(CategoryItemSchema.addedAt);
    return result as CategoryItem[];
  },

  async getItemCategories(itemId, userId) {
    const result = await db
      .select({
        id: CategorySchema.id,
        name: CategorySchema.name,
        description: CategorySchema.description,
        userId: CategorySchema.userId,
        visibility: CategorySchema.visibility,
        createdAt: CategorySchema.createdAt,
        updatedAt: CategorySchema.updatedAt,
      })
      .from(CategorySchema)
      .innerJoin(
        CategoryItemSchema,
        eq(CategorySchema.id, CategoryItemSchema.categoryId),
      )
      .where(
        and(
          eq(CategoryItemSchema.itemId, itemId),
          eq(CategorySchema.userId, userId),
        ),
      )
      .orderBy(CategorySchema.name);
    return result as Category[];
  },
}; 