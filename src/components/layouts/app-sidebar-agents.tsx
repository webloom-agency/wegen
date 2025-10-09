"use client";

import { SidebarMenuAction } from "ui/sidebar";
import Link from "next/link";
import { SidebarMenuButton, SidebarMenuSkeleton } from "ui/sidebar";
import { SidebarGroupContent, SidebarMenu, SidebarMenuItem } from "ui/sidebar";
import { SidebarGroup } from "ui/sidebar";
import {
  ArrowUpRightIcon,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  PlusIcon,
} from "lucide-react";

import { useMounted } from "@/hooks/use-mounted";

import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";

import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { useAgents } from "@/hooks/queries/use-agents";
import { Avatar, AvatarFallback, AvatarImage } from "ui/avatar";
import { AgentDropdown } from "../agent/agent-dropdown";

import { appStore } from "@/app/store";
import { useRouter } from "next/navigation";
import { BACKGROUND_COLORS, EMOJI_DATA } from "lib/const";
import { cn, deduplicateByKey } from "lib/utils";
import { Input } from "ui/input";
import { Search, X } from "lucide-react";
import { Button } from "ui/button";

const DISPLAY_LIMIT = 5; // Number of agents to show when collapsed

export function AppSidebarAgents() {
  const mounted = useMounted();
  const t = useTranslations();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { bookmarkedAgents, myAgents, isLoading, sharedAgents } = useAgents({
    limit: 50,
  }); // Increase limit since we're not artificially limiting display

  const agents = useMemo(() => {
    const combined = [...myAgents, ...bookmarkedAgents, ...sharedAgents];
    return deduplicateByKey(combined, "id");
  }, [bookmarkedAgents, myAgents, sharedAgents]);

  // Filter agents based on search query (name only) - true filter, not fuzzy search
  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return agents;
    
    const query = searchQuery.toLowerCase();
    return agents.filter(agent => 
      agent.name.toLowerCase().includes(query)
    );
  }, [agents, searchQuery]);

  const handleAgentClick = useCallback(
    (id: string) => {
      const currentFilter = appStore.getState().threadFilter;
      if (currentFilter?.agentId === id) {
        // If same agent is clicked, clear the filter
        appStore.setState({ threadFilter: undefined } as any);
        return;
      }
      
      // Set the thread filter to show only threads using this agent
      const agent = agents.find(a => a.id === id);
      console.log("Setting thread filter for agent:", { id, name: agent?.name });
      appStore.setState({ threadFilter: { agentId: id } } as any);
    },
    [agents, router],
  );

  return (
    <SidebarGroup>
      <SidebarGroupContent className="group-data-[collapsible=icon]:hidden group/agents">
        <SidebarMenu className="group/agents" data-testid="agents-sidebar-menu">
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="font-semibold">
              <Link href="/agents" data-testid="agents-link">
                {t("Layout.agents")}
              </Link>
            </SidebarMenuButton>
            <SidebarMenuAction
              className="group-hover/agents:opacity-100 opacity-0 transition-opacity"
              onClick={() => router.push("/agent/new")}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <PlusIcon className="size-4" />
                </TooltipTrigger>
                <TooltipContent side="right" align="center">
                  {t("Agent.newAgent")}
                </TooltipContent>
              </Tooltip>
            </SidebarMenuAction>
          </SidebarMenuItem>

          {/* Search Bar */}
          <SidebarMenuItem className="px-2 mb-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder={t("Agent.searchAgents")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-8 h-8 text-sm"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-muted"
                >
                  <X className="size-3" />
                </Button>
              )}
            </div>
          </SidebarMenuItem>

          {isLoading ? (
            <SidebarMenuItem>
              {Array.from({ length: 2 }).map(
                (_, index) => mounted && <SidebarMenuSkeleton key={index} />,
              )}
            </SidebarMenuItem>
          ) : filteredAgents.length == 0 ? (
            <div className="px-2 mt-1">
              <Link
                href={"/agent/new"}
                className="bg-input/40 py-8 px-4 hover:bg-input/100 rounded-lg cursor-pointer flex justify-between items-center text-xs overflow-hidden"
              >
                <div className="gap-1 z-10">
                  <div className="flex items-center mb-4 gap-1">
                    <p className="font-semibold">{t("Layout.createAgent")}</p>
                    <ArrowUpRightIcon className="size-3" />
                  </div>
                  <p className="text-muted-foreground">
                    {searchQuery ? t("Agent.noAgentsFound") : 
                     (sharedAgents.length > 0
                      ? t("Layout.createYourOwnAgentOrSelectShared")
                      : t("Layout.createYourOwnAgent"))}
                  </p>
                </div>
              </Link>
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="relative">
                {expanded && (
                  <div className="absolute bottom-0 left-0 right-0 h-4 z-10 pointer-events-none bg-gradient-to-t from-background to-transparent" />
                )}
                <div
                  className={cn(
                    "w-full",
                    expanded && "max-h-[400px] overflow-y-auto",
                  )}
                >
                  {(expanded ? filteredAgents : filteredAgents.slice(0, DISPLAY_LIMIT))?.map(
                    (agent, i) => {
                      return (
                        <SidebarMenu
                          key={agent.id}
                          className="group/agent mr-0 w-full"
                        >
                          <SidebarMenuItem
                            className="px-2 cursor-pointer w-full"
                            onClick={() => handleAgentClick(agent.id)}
                          >
                            <SidebarMenuButton
                              asChild
                              className="data-[state=open]:bg-input! w-full"
                            >
                              <div className="flex gap-1 w-full min-w-0">
                                <div
                                  className="p-1 rounded-full ring-2 ring-border bg-background"
                                  style={{
                                    backgroundColor:
                                      agent.icon?.style?.backgroundColor ||
                                      BACKGROUND_COLORS[
                                        i % BACKGROUND_COLORS.length
                                      ],
                                  }}
                                >
                                  <Avatar className="size-3.5">
                                    <AvatarImage
                                      src={
                                        agent.icon?.value ||
                                        EMOJI_DATA[i % EMOJI_DATA.length]
                                      }
                                    />
                                    <AvatarFallback className="bg-transparent">
                                      {agent.name[0]}
                                    </AvatarFallback>
                                  </Avatar>
                                </div>

                                <div className="flex items-center min-w-0 w-full">
                                  <p
                                    className="truncate"
                                    data-testid="sidebar-agent-name"
                                  >
                                    {agent.name}
                                  </p>
                                </div>
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                  }}
                                >
                                  <AgentDropdown
                                    agent={agent}
                                    side="right"
                                    align="start"
                                  >
                                    <SidebarMenuAction className="data-[state=open]:bg-input! data-[state=open]:opacity-100  opacity-0 group-hover/agent:opacity-100 mr-2">
                                      <MoreHorizontal className="size-4" />
                                    </SidebarMenuAction>
                                  </AgentDropdown>
                                </div>
                              </div>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        </SidebarMenu>
                      );
                    },
                  )}
                </div>
              </div>

              {/* Show More/Less Button */}
              {filteredAgents.length > DISPLAY_LIMIT && (
                <SidebarMenu className="group/showmore">
                  <SidebarMenuItem className="px-2 cursor-pointer">
                    <SidebarMenuButton
                      onClick={() => setExpanded(!expanded)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <div className="flex items-center gap-1">
                        <p className="text-xs">
                          {expanded
                            ? t("Common.showLess")
                            : t("Common.showMore")}
                        </p>
                        {expanded ? (
                          <ChevronUp className="size-3.5" />
                        ) : (
                          <ChevronDown className="size-3.5" />
                        )}
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              )}
            </div>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
