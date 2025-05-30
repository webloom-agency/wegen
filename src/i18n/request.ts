import { COOKIE_KEY_LOCALE } from "lib/const";
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { safe } from "ts-safe";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();

  const locale = cookieStore.get(COOKIE_KEY_LOCALE)?.value || "en";

  const messages = await safe(() => import(`../../messages/${locale}.json`))
    .ifFail(() => import(`../../messages/en.json`))
    .unwrap();

  return {
    locale,
    messages: messages.default,
  };
});
