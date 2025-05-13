import { selectMcpClientsAction } from "@/app/api/mcp/actions";
import { appStore } from "@/app/store";
import { useStateWithBrowserStorage } from "@/hooks/use-state-with-browserstorage";
import { AppDefaultToolkit } from "app-types/chat";
import { AllowedMCPServer } from "app-types/mcp";
import { cn } from "lib/utils";
import { ChartColumn, Check, ChevronRight, Package } from "lucide-react";
import { PropsWithChildren, useCallback, useMemo } from "react";
import useSWR from "swr";
import { Button } from "ui/button";
import { Checkbox } from "ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "ui/dropdown-menu";
import { MCPIcon } from "ui/mcp-icon";

import { handleErrorWithToast } from "ui/shared-toast";
import { Skeleton } from "ui/skeleton";
import { Switch } from "ui/switch";
import { useShallow } from "zustand/shallow";

interface ToolSelectorProps {
  align?: "start" | "end" | "center";
  side?: "left" | "right" | "top" | "bottom";
}

export function ToolSelector({
  children,
  align,
  side,
}: PropsWithChildren<ToolSelectorProps>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {children ?? (
          <Button
            variant={"outline"}
            className="rounded-full bg-secondary font-semibold"
          >
            <MCPIcon className="size-3.5 fill-muted-foreground" />
            Tools
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" align={align} side={side}>
        <DropdownMenuLabel>Tools Setup</DropdownMenuLabel>
        <ToolPresets />
        <DropdownMenuSeparator />
        <AppDefaultToolKitSelector />
        <DropdownMenuSeparator />
        <McpServerSelector />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const PRESET_KEY = "~tools-presets ";

interface Preset {
  allowedMcpServers?: Record<string, AllowedMCPServer>;
  allowedAppDefaultToolkit?: AppDefaultToolkit[];
  name: string;
}

function ToolPresets() {
  const [presets, setPresets] = useStateWithBrowserStorage<Preset[]>(
    PRESET_KEY,
    [],
  );

  return (
    <DropdownMenuGroup className="cursor-pointer">
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="text-xs flex items-center gap-2 font-semibold cursor-pointer">
          <Package className="size-3.5 " />
          Preset
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent className="w-80 max-h-96 overflow-y-auto">
            <DropdownMenuLabel className="text-muted-foreground flex items-center gap-2">
              'test'
              <div className="flex-1" />
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    </DropdownMenuGroup>
  );
}

function McpServerSelector() {
  const [appStoreMutate, allowedMcpServers] = appStore(
    useShallow((state) => [state.mutate, state.allowedMcpServers]),
  );

  const { data: mcpServerList, isLoading } = useSWR(
    "mcp-list",
    selectMcpClientsAction,
    {
      refreshInterval: 1000 * 60 * 1,
      fallbackData: [],
      onError: handleErrorWithToast,
      onSuccess: (data) => {
        appStoreMutate({ mcpList: data });
      },
    },
  );

  const selectedMcpServerList = useMemo(() => {
    if (mcpServerList.length === 0) return [];
    return [...mcpServerList]
      .sort(
        (a, b) =>
          (a.status === "connected" ? -1 : 1) -
          (b.status === "connected" ? -1 : 1),
      )
      .map((server) => {
        const allowedTools: string[] =
          allowedMcpServers?.[server.name]?.tools ??
          server.toolInfo.map((tool) => tool.name);
        return {
          id: server.name,
          serverName: server.name,
          checked: allowedTools.length > 0,
          tools: server.toolInfo.map((tool) => ({
            name: tool.name,
            checked: allowedTools.includes(tool.name),
            description: tool.description,
          })),
          error: server.error,
          status: server.status,
        };
      });
  }, [mcpServerList, allowedMcpServers]);

  const setMcpServerTool = useCallback(
    (serverName: string, toolNames: string[]) => {
      appStoreMutate((prev) => {
        return {
          allowedMcpServers: {
            ...prev.allowedMcpServers,
            [serverName]: {
              ...(prev.allowedMcpServers?.[serverName] ?? {}),
              tools: toolNames,
            },
          },
        };
      });
    },
    [],
  );
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="text-muted-foreground flex items-center gap-2 text-xs">
        <MCPIcon className="size-3.5 fill-muted-foreground" />
        MCP Server
      </DropdownMenuLabel>

      {isLoading ? (
        <div className="flex flex-col gap-2 px-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : selectedMcpServerList.length === 0 ? (
        <div className="text-sm text-muted-foreground w-full h-full flex items-center justify-center py-6">
          No MCP servers found.
        </div>
      ) : (
        selectedMcpServerList.map((server) => (
          <DropdownMenuSub key={server.id}>
            <DropdownMenuSubTrigger
              className={cn(
                server.status === "disconnected" && "opacity-40",
                "flex items-center gap-2 font-semibold cursor-pointer",
              )}
              icon={
                <div className="flex items-center gap-2 ml-auto">
                  {server.tools.filter((t) => t.checked).length > 0 ? (
                    <span className="text-xs text-muted-foreground font-normal">
                      {server.tools.filter((t) => t.checked).length} tools
                    </span>
                  ) : null}

                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              }
              onClick={(e) => {
                e.preventDefault();
                setMcpServerTool(
                  server.id,
                  server.checked ? [] : server.tools.map((t) => t.name),
                );
              }}
            >
              <Check
                className={cn(
                  !server.checked && "opacity-0",
                  "size-3 text-muted-foreground opacity-0",
                )}
              />

              <span className={cn("truncate", !server.checked && "opacity-40")}>
                {server.serverName}
              </span>
              {Boolean(server.error) ? (
                <span
                  className={cn("text-xs text-destructive ml-1 p-1 rounded")}
                >
                  error
                </span>
              ) : server.status === "disconnected" ? (
                <span
                  className={cn(
                    "text-xs text-muted-foreground ml-1 p-1 rounded",
                  )}
                >
                  disabled
                </span>
              ) : null}
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-80 max-h-96 overflow-y-auto">
                <DropdownMenuLabel
                  className="text-muted-foreground flex items-center gap-2"
                  onClick={(e) => {
                    e.preventDefault();
                    setMcpServerTool(
                      server.id,
                      server.checked ? [] : server.tools.map((t) => t.name),
                    );
                  }}
                >
                  {server.serverName}
                  <div className="flex-1" />
                  <Switch checked={server.checked} />
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {server.tools.map((tool) => (
                  <DropdownMenuItem
                    key={tool.name}
                    className="flex items-center gap-2 cursor-pointer mb-1"
                    onClick={(e) => {
                      e.preventDefault();
                      if (tool.checked) {
                        setMcpServerTool(
                          server.id,
                          server.tools
                            .filter((t) => t.checked && t.name != tool.name)
                            .map((t) => t.name),
                        );
                      } else {
                        setMcpServerTool(server.id, [
                          ...server.tools
                            .filter((t) => t.checked)
                            .map((t) => t.name),
                          tool.name,
                        ]);
                      }
                    }}
                  >
                    <div className="mx-1 flex-1 min-w-0">
                      <p className="font-medium text-xs mb-1 truncate">
                        {tool.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {tool.description}
                      </p>
                    </div>
                    <Checkbox checked={tool.checked} className="ml-auto" />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        ))
      )}
    </DropdownMenuGroup>
  );
}

function AppDefaultToolKitSelector() {
  const [appStoreMutate, allowedAppDefaultToolkit] = appStore(
    useShallow((state) => [state.mutate, state.allowedAppDefaultToolkit]),
  );

  const toggleAppDefaultToolkit = useCallback((toolkit: string) => {
    appStoreMutate((prev) => {
      const newAllowedAppDefaultToolkit = [
        ...(prev.allowedAppDefaultToolkit ?? []),
      ];
      if (newAllowedAppDefaultToolkit.includes(toolkit)) {
        newAllowedAppDefaultToolkit.splice(
          newAllowedAppDefaultToolkit.indexOf(toolkit),
          1,
        );
      } else {
        newAllowedAppDefaultToolkit.push(toolkit);
      }
      return { allowedAppDefaultToolkit: newAllowedAppDefaultToolkit };
    });
  }, []);

  return (
    <DropdownMenuGroup>
      <DropdownMenuItem
        className="cursor-pointer font-semibold text-xs"
        onClick={(e) => {
          e.preventDefault();
          toggleAppDefaultToolkit("chart");
        }}
      >
        <ChartColumn className="size-3.5 text-blue-500 stroke-3" />
        Chart Tools
        <Switch
          className="ml-auto"
          checked={allowedAppDefaultToolkit?.includes("chart")}
        />
      </DropdownMenuItem>
    </DropdownMenuGroup>
  );
}
