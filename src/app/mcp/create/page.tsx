import MCPEditor from "@/components/mcp-editor";

export default function Page() {
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
          <MCPEditor />
        </main>
      </div>
    </div>
  );
}
