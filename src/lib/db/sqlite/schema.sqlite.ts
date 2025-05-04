import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  check,
  primaryKey,
} from "drizzle-orm/sqlite-core";

export const ChatThreadSchema = sqliteTable("chat_thread", {
  id: text("id").primaryKey().notNull(),
  title: text("title").notNull(),
  userId: text("user_id").notNull(),
  createdAt: integer("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  projectId: text("project_id"),
});

export const ChatMessageSchema = sqliteTable("chat_message", {
  id: text("id").primaryKey().notNull(),
  threadId: text("thread_id").notNull(),
  role: text("role").notNull(),
  parts: text("parts").notNull(),
  attachments: text("attachments"),
  annotations: text("annotations"),
  model: text("model"),
  createdAt: integer("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ProjectSchema = sqliteTable("project", {
  id: text("id").primaryKey().notNull(),
  name: text("name").notNull(),
  userId: text("user_id").notNull(),
  instructions: text("instructions"),
  createdAt: integer("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const UserSchema = sqliteTable("user", {
  id: text("id").primaryKey().notNull().default(sql`(random())`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  image: text("image"),
  createdAt: integer("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const McpServerBindingSchema = sqliteTable(
  "mcp_server_binding",
  {
    ownerType: text("owner_type").notNull(), // 'project' | 'thread'
    ownerId: text("owner_id").notNull(), // project.id or chat_thread.id
    mcpId: text("mcp_id").notNull(), // mcp_server.id
    toolNames: text("tool_names").default(sql`'[]'`), // string[]
    createdAt: integer("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (tbl) => [
    primaryKey({ columns: [tbl.ownerType, tbl.ownerId, tbl.mcpId] }),
    check(
      "binding_owner_type_ck",
      sql`${tbl.ownerType} IN ('project', 'thread')`,
    ),
  ],
);
// export const McpServerSchema = sqliteTable("mcp_server", {
//   id: text("id").primaryKey().notNull().default(sql`(random())`),
//   enabled: integer("enabled").notNull().default(1),
//   name: text("name").notNull(),
//   config: text("config").notNull(),
//   createdAt: integer("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
//   updatedAt: integer("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
// });
