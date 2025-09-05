import { z } from "zod";

export const CategoryCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const CategoryUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

export type Category = {
  id: string;
  name: string;
  description: string | null;
  userId: string;
  visibility: "private" | "public" | "readonly";
  createdAt: Date;
  updatedAt: Date;
};

export type CategoryItem = {
  id: string;
  categoryId: string;
  itemId: string;
  userId: string;
  addedAt: Date;
};

export type CategoryWithItemCount = Category & {
  itemCount: number;
};

export type CategoryRepository = {
  createCategory(
    category: Omit<Category, "id" | "createdAt" | "updatedAt">,
  ): Promise<Category>;
  getCategoriesByUserId(userId: string): Promise<CategoryWithItemCount[]>;
  getCategoryById(id: string): Promise<Category | null>;
  updateCategory(
    id: string,
    category: Partial<Omit<Category, "id" | "createdAt" | "updatedAt">>,
  ): Promise<Category>;
  deleteCategory(id: string): Promise<void>;

  addItemToCategory(
    categoryId: string,
    itemId: string,
    userId: string,
  ): Promise<CategoryItem>;
  removeItemFromCategory(categoryId: string, itemId: string): Promise<void>;
  getCategoryItems(categoryId: string): Promise<CategoryItem[]>;
  getItemCategories(itemId: string, userId: string): Promise<Category[]>;
}; 