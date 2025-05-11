"use server";

import { User, UserZodSchema } from "app-types/user";
import { userRepository } from "lib/db/repository";
import { signIn } from "./auth";

import { safe } from "ts-safe";
import logger from "logger";

export async function existsByEmailAction(email: string) {
  const exists = await userRepository.existsByEmail(email);
  return exists;
}
export async function registerAction(
  user: Omit<User, "id"> & { plainPassword: string },
) {
  const createdUser = await userRepository.register(user);
  return createdUser;
}

export async function loginAction({
  email,
  password,
}: { email: string; password: string }) {
  return safe(async () => {
    const validated = UserZodSchema.pick({
      email: true,
      password: true,
    }).parse({ email, password });

    await signIn("credentials", {
      email: validated.email,
      password: validated.password,
      redirect: false,
    });
  })
    .ifFail((e) => {
      logger.error(e);
      throw new Error("Invalid credentials");
    })
    .unwrap();
}
