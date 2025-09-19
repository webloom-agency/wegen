import { Agent, AgentRepository, AgentSummary } from "app-types/agent";
import { pgDb as db } from "../db.pg";
import { AgentSchema, BookmarkSchema, UserSchema } from "../schema.pg";
import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import { generateUUID } from "lib/utils";

async function isAdmin(userId: string) {
  const [u] = await db
    .select({ role: UserSchema.role })
    .from(UserSchema)
    .where(eq(UserSchema.id, userId));
  return u?.role === "admin";
}

export const pgAgentRepository: AgentRepository = {
  async insertAgent(agent) {
    const [result] = await db
      .insert(AgentSchema)
      .values({
        id: generateUUID(),
        name: agent.name,
        description: agent.description,
        icon: agent.icon,
        userId: agent.userId,
        instructions: agent.instructions,
        visibility: agent.visibility || "private",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return {
      ...result,
      description: result.description ?? undefined,
      icon: result.icon ?? undefined,
      instructions: result.instructions ?? {},
    };
  },

  async selectAgentById(id, userId): Promise<Agent | null> {
    const admin = await isAdmin(userId);

    const base = db
      .select({
        id: AgentSchema.id,
        name: AgentSchema.name,
        description: AgentSchema.description,
        icon: AgentSchema.icon,
        userId: AgentSchema.userId,
        instructions: AgentSchema.instructions,
        visibility: AgentSchema.visibility,
        createdAt: AgentSchema.createdAt,
        updatedAt: AgentSchema.updatedAt,
        isBookmarked: sql<boolean>`${BookmarkSchema.id} IS NOT NULL`,
      })
      .from(AgentSchema)
      .leftJoin(
        BookmarkSchema,
        and(
          eq(BookmarkSchema.itemId, AgentSchema.id),
          eq(BookmarkSchema.userId, userId),
          eq(BookmarkSchema.itemType, "agent"),
        ),
      );

    const rows = admin
      ? await base.where(eq(AgentSchema.id, id))
      : await base.where(
          and(
            eq(AgentSchema.id, id),
            or(
              eq(AgentSchema.userId, userId),
              eq(AgentSchema.visibility, "public"),
              eq(AgentSchema.visibility, "readonly"),
            ),
          ),
        );

    const result = rows[0];
    if (!result) return null;

    return {
      ...result,
      description: result.description ?? undefined,
      icon: result.icon ?? undefined,
      instructions: result.instructions ?? {},
      isBookmarked: result.isBookmarked ?? false,
    };
  },

  async selectAgentsByUserId(userId) {
    const results = await db
      .select({
        id: AgentSchema.id,
        name: AgentSchema.name,
        description: AgentSchema.description,
        icon: AgentSchema.icon,
        userId: AgentSchema.userId,
        instructions: AgentSchema.instructions,
        visibility: AgentSchema.visibility,
        createdAt: AgentSchema.createdAt,
        updatedAt: AgentSchema.updatedAt,
        userName: UserSchema.name,
        userAvatar: UserSchema.image,
        isBookmarked: sql<boolean>`false`,
      })
      .from(AgentSchema)
      .innerJoin(UserSchema, eq(AgentSchema.userId, UserSchema.id))
      .where(eq(AgentSchema.userId, userId))
      .orderBy(desc(AgentSchema.createdAt));

    return results.map((result) => ({
      ...result,
      description: result.description ?? undefined,
      icon: result.icon ?? undefined,
      instructions: result.instructions ?? {},
      userName: result.userName ?? undefined,
      userAvatar: result.userAvatar ?? undefined,
      isBookmarked: false,
    }));
  },

  async updateAgent(id, userId, agent) {
    const admin = await isAdmin(userId);
    const [result] = await db
      .update(AgentSchema)
      .set({
        ...agent,
        updatedAt: new Date(),
      })
      .where(
        admin
          ? eq(AgentSchema.id, id)
          : and(eq(AgentSchema.id, id), eq(AgentSchema.userId, userId)),
      )
      .returning();
    return {
      ...result,
      description: result.description ?? undefined,
      icon: result.icon ?? undefined,
      instructions: result.instructions ?? {},
    } as Agent;
  },

  async deleteAgent(id, userId) {
    const admin = await isAdmin(userId);
    await db
      .delete(AgentSchema)
      .where(admin ? eq(AgentSchema.id, id) : and(eq(AgentSchema.id, id), eq(AgentSchema.userId, userId)));
  },

  async selectAgents(
    currentUserId,
    filters = ["all"],
    limit = 50,
  ): Promise<AgentSummary[]> {
    const admin = await isAdmin(currentUserId);
    let orConditions: any[] = [];

    for (const filter of filters) {
      if (filter === "mine") {
        orConditions.push(eq(AgentSchema.userId, currentUserId));
      } else if (filter === "shared") {
        orConditions.push(
          and(
            ne(AgentSchema.userId, currentUserId),
            or(
              eq(AgentSchema.visibility, "public"),
              eq(AgentSchema.visibility, "readonly"),
            ),
          ),
        );
      } else if (filter === "bookmarked") {
        orConditions.push(
          and(
            ne(AgentSchema.userId, currentUserId),
            or(
              eq(AgentSchema.visibility, "public"),
              eq(AgentSchema.visibility, "readonly"),
            ),
            sql`${BookmarkSchema.id} IS NOT NULL`,
          ),
        );
      } else if (filter === "all") {
        orConditions = [
          admin
            ? sql`true`
            : or(
                eq(AgentSchema.userId, currentUserId),
                and(
                  ne(AgentSchema.userId, currentUserId),
                  or(
                    eq(AgentSchema.visibility, "public"),
                    eq(AgentSchema.visibility, "readonly"),
                  ),
                ),
              ),
        ];
        break;
      }
    }

    const results = await db
      .select({
        id: AgentSchema.id,
        name: AgentSchema.name,
        description: AgentSchema.description,
        icon: AgentSchema.icon,
        userId: AgentSchema.userId,
        instructions: AgentSchema.instructions,
        visibility: AgentSchema.visibility,
        createdAt: AgentSchema.createdAt,
        updatedAt: AgentSchema.updatedAt,
        userName: UserSchema.name,
        userAvatar: UserSchema.image,
        isBookmarked: sql<boolean>`false`,
      })
      .from(AgentSchema)
      .leftJoin(
        BookmarkSchema,
        and(
          eq(BookmarkSchema.itemId, AgentSchema.id),
          eq(BookmarkSchema.userId, currentUserId),
          eq(BookmarkSchema.itemType, "agent"),
        ),
      )
      .innerJoin(UserSchema, eq(AgentSchema.userId, UserSchema.id))
      .where(orConditions.length > 1 ? or(...orConditions) : orConditions[0])
      .orderBy(
        sql`CASE WHEN ${AgentSchema.userId} = ${currentUserId} THEN 0 ELSE 1 END`,
        desc(AgentSchema.createdAt),
      )
      .limit(limit);

    return results.map((result) => ({
      ...result,
      description: result.description ?? undefined,
      icon: result.icon ?? undefined,
      userName: result.userName ?? undefined,
      userAvatar: result.userAvatar ?? undefined,
    }));
  },

  async checkAccess(agentId, userId, destructive = false) {
    const admin = await isAdmin(userId);
    if (admin) return true;
    const [agent] = await db
      .select({
        visibility: AgentSchema.visibility,
        userId: AgentSchema.userId,
      })
      .from(AgentSchema)
      .where(eq(AgentSchema.id, agentId));
    if (!agent) {
      return false;
    }
    if (userId == agent.userId) return true;
    if (agent.visibility === "public" && !destructive) return true;
    return false;
  },
};
