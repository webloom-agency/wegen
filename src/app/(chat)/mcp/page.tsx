import MCPDashboard from "@/components/mcp-dashboard";
import { IS_VERCEL_ENV } from "lib/const";
import { getTranslations } from "next-intl/server";
import { getSession } from "auth/server";
import { redirect } from "next/navigation";

export default async function Page() {
  const session = await getSession();
  const me = session?.user as any;
  if (!me || me.role !== "admin") {
    redirect("/");
  }

  const isAddingDisabled = process.env.NOT_ALLOW_ADD_MCP_SERVERS;

  const t = await getTranslations("Info");
  let message: string | undefined;

  if (isAddingDisabled) {
    message = t("mcpAddingDisabled");
  } else if (IS_VERCEL_ENV) {
    message = t("vercelSyncDelay");
  }

  return <MCPDashboard message={message} />;
}
