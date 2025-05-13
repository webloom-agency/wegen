import { pgChatRepository } from "./pg/repositories/chat-repository.pg";
import { pgUserRepository } from "./pg/repositories/user-repository.pg";
import { sqliteChatRepository } from "./sqlite/repositories/chat-repository.sqlite";
import { sqliteUserRepository } from "./sqlite/repositories/user-repository.sqlite";

export const chatRepository =
  process.env.USE_FILE_SYSTEM_DB === "true"
    ? sqliteChatRepository
    : pgChatRepository;

export const userRepository =
  process.env.USE_FILE_SYSTEM_DB === "true"
    ? sqliteUserRepository
    : pgUserRepository;
