"use client";
import { MCPCard } from "@/components/mcp-card";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { MCPOverview } from "@/components/mcp-overview";
import { selectMcpClientsAction } from "../api/mcp/actions";
import useSWR from "swr";
import { Skeleton } from "ui/skeleton";

import { handleErrorWithToast } from "ui/shared-toast";

export default function Page() {
  const { data: mcpList, isLoading } = useSWR(
    "mcp-list",
    selectMcpClientsAction,
    {
      refreshInterval: 10000,
      fallbackData: [],
      onError: handleErrorWithToast,
    },
  );

  return (
    <div className="relative flex flex-col gap-4 px-8 py-8 max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">MCP Servers</h1>
        <div className="flex gap-2">
          {/* Add MCP Server button */}
          <Link href="/mcp/create">
            <Button size="sm" className="font-semibold">
              Add MCP Server
            </Button>
          </Link>
        </div>
      </div>
      {isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-60 w-full" />
          <Skeleton className="h-60 w-full" />
          <Skeleton className="h-60 w-full" />
        </div>
      ) : mcpList?.length ? (
        <div className="flex flex-col gap-6 my-4">
          {mcpList.map((mcp) => (
            <MCPCard key={mcp.name} {...mcp} />
          ))}
        </div>
      ) : (
        // When MCP list is empty
        <MCPOverview />
      )}
    </div>
  );
}
