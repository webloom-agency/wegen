import { getRequestConfig } from "next-intl/server";
import { safe } from "ts-safe";
import { getLocaleAction } from "./get-locale";

export default getRequestConfig(async () => {
  const locale = await getLocaleAction();

  const messages = await safe(() => import(`../../messages/${locale}.json`))
    .ifFail(() => import(`../../messages/en.json`))
    .unwrap();

  return {
    locale,
    messages: messages.default,
  };
});
