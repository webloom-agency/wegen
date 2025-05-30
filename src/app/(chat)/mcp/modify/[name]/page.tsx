import MCPEditor from "@/components/mcp-editor";
import { selectMcpClientsAction } from "@/app/api/mcp/actions";
import { Alert } from "ui/alert";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function Page({
  params,
}: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const t = await getTranslations();
  const mcpClients = await selectMcpClientsAction();
  const mcpClient = mcpClients.find((mcp) => mcp.name === name);

  if (!mcpClient) {
    return <div>MCP client not found</div>;
  }

  return (
    <div className="container max-w-3xl mx-4 md:mx-auto py-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/mcp"
          className="flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="size-3" />
          {t("Common.back")}
        </Link>
        <header>
          <h2 className="text-3xl font-semibold my-2">
            {t("MCP.mcpConfiguration")}
          </h2>
          <p className="text text-muted-foreground">
            {t("MCP.configureYourMcpServerConnectionSettings")}
          </p>
        </header>

        <main className="my-8">
          {mcpClient ? (
            <MCPEditor initialConfig={mcpClient.config} name={name} />
          ) : (
            <Alert variant="destructive">MCP client not found</Alert>
          )}
        </main>
      </div>
    </div>
  );
}
