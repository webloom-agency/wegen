"use server";

import { User } from "app-types/user";
import { userRepository } from "lib/db/repository";

import { CacheKeys } from "lib/cache/cache-keys";
import { serverCache } from "lib/cache";

export async function existsByEmailAction(email: string) {
  const exists = await userRepository.existsByEmail(email);
  return exists;
}
export const rememberUserAction = async (userId: string) => {
  const cacheKey = CacheKeys.user(userId);
  const cache = await serverCache.get<User>(cacheKey);
  if (cache) {
    return cache;
  }
  const user = await userRepository.findById(userId);
  if (!user) {
    return null;
  }
  await serverCache.set(cacheKey, user, 1000 * 60 * 60);
  return user;
};
