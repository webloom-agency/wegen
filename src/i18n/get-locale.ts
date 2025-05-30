"use server";
import { cookies } from "next/headers";
import { COOKIE_KEY_LOCALE } from "lib/const";

export async function getLocaleAction() {
  const cookieStore = await cookies();
  const locale = cookieStore.get(COOKIE_KEY_LOCALE)?.value || "en";
  return locale;
}
