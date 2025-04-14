import MCPEditor from "@/components/mcp-editor";
import { selectMcpClientsAction } from "@/app/api/mcp/actions";
import { Alert } from "ui/alert";

export default async function Page({
  params,
}: { params: Promise<{ name: string }> }) {
  const { name } = await params;

  const mcpClients = await selectMcpClientsAction();
  const mcpClient = mcpClients.find((mcp) => mcp.name === name);

  if (!mcpClient) {
    return <div>MCP client not found</div>;
  }

  return (
    <div className="container max-w-3xl mx-4 md:mx-auto py-8">
      <div>
        <header>
          <h2 className="text-3xl font-semibold mb-2">MCP Configuration</h2>
          <p className="text text-muted-foreground">
            Configure your MCP server connection settings
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
