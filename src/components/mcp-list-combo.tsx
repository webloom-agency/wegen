"use client";
import {
  connectMcpClientAction,
  disconnectMcpClientAction,
  refreshMcpClientAction,
  selectMcpClientsAction,
} from "@/app/api/mcp/actions";
import { appStore } from "@/app/store";
import { MCPServerInfo } from "app-types/mcp";
import { ChevronRight, RotateCw, Loader2, ArrowUpRight } from "lucide-react";
import { PropsWithChildren, useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { Card, CardContent } from "ui/card";

import { Popover, PopoverContent, PopoverTrigger } from "ui/popover";
import { Switch } from "ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";
import { handleErrorWithToast } from "ui/shared-toast";
import { useShallow } from "zustand/shallow";
import { Button } from "ui/button";
import { safe } from "ts-safe";
import { ToolDetailPopup } from "./tool-detail-popup";
import Link from "next/link";
import { Separator } from "ui/separator";

import { cn } from "lib/utils";
import { MCPIcon } from "ui/mcp-icon";

type McpListComboProps = {
  align?: "start" | "end";
};

const MCP_SERVER_REGISTRY_URL =
  "https://glama.ai/mcp/servers?attributes=author%3Aofficial&sort=npm-downloads%3Adesc";

export const McpListCombo = ({
  children,
  align = "end",
}: PropsWithChildren<McpListComboProps>) => {
  const [appStoreMutate, activeTool] = appStore(
    useShallow((state) => [state.mutate, state.activeTool]),
  );

  const [open, setOpen] = useState(false);
  const [expandedServers, setExpandedServers] = useState<string[]>([]);

  const [processingItems, setProcessingItems] = useState<string[]>([]);

  const { data: mcpList, mutate: refreshMcpList } = useSWR(
    "mcp-list",
    selectMcpClientsAction,
    {
      refreshInterval: 1000 * 60 * 1,
      fallbackData: [],
      onError: handleErrorWithToast,
      onSuccess: (data) => appStoreMutate({ mcpList: data }),
    },
  );

  useEffect(() => {
    if (open) {
      refreshMcpList();
    }
  }, [open]);

  const pipeProcessing = useCallback(
    async (name: string, fn: () => Promise<any>) =>
      safe(() => setProcessingItems((prev) => [...prev, name]))
        .ifOk(fn)
        .ifOk(() => refreshMcpList())
        .ifFail(handleErrorWithToast)
        .watch(() =>
          setProcessingItems((prev) => prev.filter((n) => n !== name)),
        ),
    [],
  );

  const handleToggleConnection = useCallback(
    async (server: MCPServerInfo) => {
      await pipeProcessing(server.name, () =>
        server.status === "connected"
          ? disconnectMcpClientAction(server.name)
          : connectMcpClientAction(server.name),
      );
    },
    [pipeProcessing],
  );

  const handleRefresh = useCallback(
    (server: MCPServerInfo) =>
      pipeProcessing(server.name, () => refreshMcpClientAction(server.name)),
    [pipeProcessing],
  );

  const toggleServerExpansion = (serverName: string) => {
    setExpandedServers((prev) =>
      prev.includes(serverName)
        ? prev.filter((name) => name !== serverName)
        : [...prev, serverName],
    );
  };

  const toggleActiveTool = () => {
    appStoreMutate({ activeTool: !activeTool });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="p-0 border-none bg-transparent w-full md:w-[700px] overflow-hidden"
        align={align}
        side="top"
      >
        <Card
          className="relative bg-background w-full py-0"
          onClick={(e) => e.stopPropagation()}
        >
          <CardContent className="p-0 flex">
            {/* Left Sidebar - Registry Only */}
            <div className="w-[240px] sticky top-0 flex flex-col px-6 py-4">
              <div className="rounded-md p-4 hover:bg-secondary/40">
                <Link
                  href={MCP_SERVER_REGISTRY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 flex flex-col gap-2"
                >
                  <span className="flex items-center gap-1 text-xl font-semibold">
                    Discover more MCP servers in the registry
                  </span>
                  <div className="flex items-center gap-1 mt-2 text-muted-foreground">
                    <span className="mr-auto">glama.ai</span>
                    <ArrowUpRight />
                  </div>
                </Link>
              </div>
            </div>

            <div>
              <Separator orientation="vertical" />
            </div>

            <div className="flex-1 h-[50vh] overflow-y-auto w-full ">
              <div className="p-6 sticky top-0 bg-background z-10 w-full pt-10">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-bold flex items-center gap-2">
                    <div className="bg-accent-foreground p-1.5 rounded-lg">
                      <MCPIcon className="size-4 fill-accent" />
                    </div>
                    MCP Servers
                  </h4>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-xs",
                        activeTool
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {activeTool ? "Active" : "Inactive"}
                    </span>
                    <Switch
                      checked={activeTool}
                      onCheckedChange={toggleActiveTool}
                    />
                  </div>
                </div>
              </div>

              <div className="p-6 w-full">
                {mcpList && mcpList.length > 0 ? (
                  <div className={cn("space-y-2 w-full")}>
                    {mcpList.map((server) => (
                      <div
                        key={server.name}
                        className={cn(
                          processingItems.includes(server.name)
                            ? "opacity-50 pointer-events-none"
                            : "",
                          expandedServers.includes(server.name)
                            ? "bg-secondary"
                            : "bg-background",
                          "rounded-md border shadow-sm text-xs hover:bg-secondary",
                        )}
                      >
                        <div
                          className="flex items-center py-2 px-4 cursor-pointer"
                          onClick={() => toggleServerExpansion(server.name)}
                        >
                          <span className="font-medium">{server.name}</span>
                          <div className="mx-2">
                            {processingItems.includes(server.name) ? (
                              <div className="flex items-center gap-2">
                                <Loader2 className="size-3.5 animate-spin" />
                              </div>
                            ) : server.error ? (
                              <div className="flex items-center gap-1 text-destructive bg-card rounded-md px-2 py-1">
                                error
                              </div>
                            ) : null}
                          </div>
                          <div className="flex-1" />
                          <div className="flex items-center gap-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Switch
                                  className={
                                    server.status == "connected"
                                      ? "bg-accent-foreground"
                                      : "bg-card"
                                  }
                                  id={`mcp-server-${server.name}`}
                                  checked={server.status === "connected"}
                                  onCheckedChange={() => {
                                    handleToggleConnection(server);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Toggle Connection</p>
                              </TooltipContent>
                            </Tooltip>
                            <div className="h-4 pl-2">
                              <Separator orientation="vertical" />
                            </div>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRefresh(server);
                                  }}
                                >
                                  <RotateCw className="size-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Refresh</p>
                              </TooltipContent>
                            </Tooltip>

                            {/* <div className="h-4">
                              <Separator orientation="vertical" />
                            </div>
                            <Button variant="ghost" size="icon">
                              <ChevronDown
                                className={`size-3.5 transition-transform ${expandedServers.includes(server.name) ? "rotate-90" : ""}`}
                              />
                            </Button> */}
                          </div>
                        </div>

                        {expandedServers.includes(server.name) && (
                          <div className="p-2 pt-0 border-t mt-1 w-full">
                            <div className="space-y-1">
                              {server.toolInfo && server.toolInfo.length > 0 ? (
                                server.toolInfo.map((tool) => (
                                  <ToolDetailPopup key={tool.name} tool={tool}>
                                    <div className="flex cursor-pointer bg-secondary/50 rounded-md p-2 hover:bg-background/80 transition-colors">
                                      <div className="flex-1 w-full">
                                        <p className="font-medium text-xs mb-1">
                                          {tool.name}
                                        </p>
                                        <p className="text-xs text-muted-foreground line-clamp-1">
                                          {tool.description}
                                        </p>
                                      </div>
                                      <div className="flex items-center px-1 justify-center self-stretch">
                                        <ChevronRight size={14} />
                                      </div>
                                    </div>
                                  </ToolDetailPopup>
                                ))
                              ) : (
                                <div className="text-center py-2 text-muted-foreground">
                                  No tools available for this server
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    Connect to MCP servers and use their tools
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  );
};
