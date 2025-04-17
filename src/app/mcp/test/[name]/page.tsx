"use client";

import { selectMcpClientAction } from "@/app/api/mcp/actions";
import { ArrowLeft, ChevronDown, ChevronUp, Search } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { useMemo, useState } from "react";
import { Input } from "ui/input";
import { Separator } from "ui/separator";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "ui/resizable";
import { Skeleton } from "ui/skeleton";
import { Button } from "ui/button";

export default function Page() {
  const { name } = useParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedToolIndex, setSelectedToolIndex] = useState<number>(0);
  const [showFullDescription, setShowFullDescription] = useState(false);

  const { data: client, isLoading } = useSWR(`/mcp/${name}`, () =>
    selectMcpClientAction(name as string),
  );

  const selectedTool = useMemo(() => {
    return client?.toolInfo[selectedToolIndex];
  }, [client, selectedToolIndex]);

  const filteredTools =
    client?.toolInfo.filter(
      (tool) =>
        tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tool.description.toLowerCase().includes(searchQuery.toLowerCase()),
    ) || [];

  return (
    <div className="flex flex-col max-w-5xl px-4 mx-4 md:mx-auto w-full h-full py-8">
      <div className="bg-background pb-4">
        <Link
          href="/mcp"
          className="flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground transition-colors pb-8"
        >
          <ArrowLeft className="size-3" />
          Back
        </Link>
        <header>
          <h2 className="text-3xl font-semibold my-2">
            {decodeURIComponent(name as string)}
          </h2>
        </header>
      </div>

      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={30}>
          <div className="w-full flex flex-col h-full relative pr-8">
            <div className="h-8" />
            <div className="top-0 pb-2 z-1">
              <div className="w-full relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search tools..."
                  className="pl-8 bg-background"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 h-full overflow-y-auto no-scrollbar">
              {isLoading ? (
                Array.from({
                  length: 10,
                }).map((_, index) => (
                  <Skeleton key={index} className="w-full h-14" />
                ))
              ) : filteredTools.length > 0 ? (
                filteredTools.map((tool, index) => (
                  <div
                    key={tool.name}
                    className={`flex border-secondary border cursor-pointer rounded-md p-2 transition-colors ${
                      selectedToolIndex === index
                        ? "bg-secondary"
                        : "hover:bg-secondary"
                    }`}
                    onClick={() => setSelectedToolIndex(index)}
                  >
                    <div className="flex-1 w-full">
                      <p className="font-medium text-sm mb-1">{tool.name}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {tool.description}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {client?.toolInfo?.length
                    ? "No search results"
                    : "No tools available"}
                </p>
              )}
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={70}>
          <div className="w-full h-full">
            <div className="h-full px-8">
              {selectedTool ? (
                <div>
                  <h3 className="text-xl font-medium mb-4">
                    {selectedTool.name}
                  </h3>
                  {selectedTool.description && (
                    <div className="mb-6">
                      <p className={`text-sm text-muted-foreground`}>
                        {selectedTool.description.slice(0, 300)}
                        {selectedTool.description.length > 300 && "..."}
                      </p>
                      {selectedTool.description.length > 300 && (
                        <Button
                          variant="ghost"
                          className="ml-auto p-0 h-6 mt-1 text-xs text-muted-foreground hover:text-foreground flex items-center"
                          onClick={() =>
                            setShowFullDescription(!showFullDescription)
                          }
                        >
                          {showFullDescription ? (
                            <>
                              Show less
                              <ChevronUp className="ml-1 h-3 w-3" />
                            </>
                          ) : (
                            <>
                              Show more
                              <ChevronDown className="ml-1 h-3 w-3" />
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                  <Separator className="my-4" />
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Tool Testing</h4>
                    <div className="bg-secondary/30 p-4 rounded-md">
                      <p className="text-sm text-center text-muted-foreground">
                        Tool testing area is under development
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[300px]">
                  <p className="text-muted-foreground">
                    Select a tool from the left to test
                  </p>
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
