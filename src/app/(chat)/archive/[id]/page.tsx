import { archiveRepository, chatRepository, agentRepository } from "lib/db/repository";
import { getSession } from "auth/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "ui/card";
import { MessageCircleXIcon } from "lucide-react";
import { ArchiveActionsClient } from "@/app/(chat)/archive/[id]/archive-actions-client";
import { Separator } from "ui/separator";

import LightRays from "ui/light-rays";
import Particles from "ui/particles";

// Simple date formatting function
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays === 0) return "Today";
  if (diffInDays === 1) return "Yesterday";
  if (diffInDays < 7) return `${diffInDays} days ago`;
  if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
  if (diffInDays < 365) return `${Math.floor(diffInDays / 30)} months ago`;
  return `${Math.floor(diffInDays / 365)} years ago`;
}

interface ArchiveWithThreads {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  threads: Array<{
    id: string;
    title: string;
    createdAt: Date;
    lastMessageAt: number;
  }>;
}

async function getArchiveWithThreads(
  archiveId: string,
): Promise<ArchiveWithThreads | null> {
  const session = await getSession();
  if (!session?.user?.id) return null;

  const [archive, archiveItems] = await Promise.all([
    archiveRepository.getArchiveById(archiveId),
    archiveRepository.getArchiveItems(archiveId),
  ]);

  if (!archive) return null;

  const threadIds = archiveItems.map((item) => item.itemId);

  if (threadIds.length === 0) {
    return { ...archive, threads: [] } as ArchiveWithThreads;
  }

  const visibleThreads: Array<{
    id: string;
    title: string;
    createdAt: Date;
    lastMessageAt: number;
    userId: string;
  }> = [];

  // Evaluate visibility per thread using existing rules
  for (const threadId of threadIds) {
    const thread = await chatRepository.selectThread(threadId);
    if (!thread) continue;

    // Owner can always view
    if (thread.userId === session.user.id) {
      const msgs = await chatRepository.selectMessagesByThreadId(threadId);
      const lastAt = msgs.length
        ? new Date(msgs[msgs.length - 1].createdAt as any).getTime()
        : 0;
      visibleThreads.push({
        id: thread.id,
        title: thread.title,
        createdAt: thread.createdAt,
        lastMessageAt: lastAt,
        userId: thread.userId,
      });
      continue;
    }

    // Non-owner: only allow if thread references an agent visible to current user
    const messages = await chatRepository.selectMessagesByThreadId(threadId);
    const agentIds = new Set<string>();
    for (const m of messages) {
      const anns = (m as any).annotations as any[] | undefined;
      if (!anns || !Array.isArray(anns)) continue;
      for (const ann of anns) {
        const a = ann as any;
        if (a && typeof a === "object" && typeof a.agentId === "string") {
          agentIds.add(a.agentId);
        }
      }
    }

    let allowed = false;
    for (const agentId of agentIds) {
      const agent = await agentRepository.selectAgentById(
        agentId,
        session.user.id,
      );
      if (agent) {
        allowed = true;
        break;
      }
    }

    if (allowed) {
      const lastAt = messages.length
        ? new Date(messages[messages.length - 1].createdAt as any).getTime()
        : 0;
      visibleThreads.push({
        id: thread.id,
        title: thread.title,
        createdAt: thread.createdAt,
        lastMessageAt: lastAt,
        userId: thread.userId,
      });
    }
  }

  const threads = visibleThreads.sort(
    (a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0),
  );

  return { ...(archive as any), threads } as ArchiveWithThreads;
}

export default async function ArchivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();

  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const archive = await getArchiveWithThreads(id);

  if (!archive) {
    redirect("/");
  }

  return (
    <>
      <>
        <div className="absolute opacity-30 pointer-events-none top-0 left-0 w-full h-full z-10 fade-in animate-in duration-5000">
          <LightRays className="bg-transparent" />
        </div>
        <div className="absolute pointer-events-none top-0 left-0 w-full h-full z-10 fade-in animate-in duration-5000">
          <Particles
            className="bg-transparent"
            particleCount={400}
            particleBaseSize={10}
          />
        </div>
        <div className="absolute pointer-events-none top-0 left-0 w-full h-full z-10 fade-in animate-in duration-5000">
          <div className="w-full h-full bg-gradient-to-t from-background to-50% to-transparent z-20" />
        </div>
        <div className="absolute pointer-events-none top-0 left-0 w-full h-full z-10 fade-in animate-in duration-5000">
          <div className="w-full h-full bg-gradient-to-l from-background to-20% to-transparent z-20" />
        </div>
        <div className="absolute pointer-events-none top-0 left-0 w-full h-full z-10 fade-in animate-in duration-5000">
          <div className="w-full h-full bg-gradient-to-r from-background to-20% to-transparent z-20" />
        </div>
      </>
      <div className="container mx-auto p-6 max-w-4xl z-40">
        {/* Category Header */}
        <div className="mb-8 z-50">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold">{archive.name}</h1>
            <div className="flex-1" />
            <p className="text-xs text-muted-foreground mr-2">
              Created {formatTimeAgo(archive.createdAt)}
            </p>
            <div className="h-4">
              <Separator orientation="vertical" />
            </div>
            <ArchiveActionsClient
              archive={{
                id: archive.id,
                name: archive.name,
                description: archive.description,
                userId: session.user.id,
                createdAt: archive.createdAt,
                updatedAt: archive.updatedAt,
              }}
            />
          </div>
          {archive.description && (
            <p className="text-muted-foreground text-sm mt-4">
              {archive.description}
            </p>
          )}
        </div>

        {/* Threads List */}
        <div className="space-y-3">
          {archive.threads.length === 0 ? (
            <Card className="bg-transparent  border-none">
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-center">
                  <MessageCircleXIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">
                    No threads in this category
                  </h3>
                  <p className="text-muted-foreground">
                    Add some chat threads to this category to see them here.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            archive.threads.map((thread) => (
              <Link key={thread.id} href={`/chat/${thread.id}`}>
                <Card className="hover:bg-accent/30 transition-all duration-200 cursor-pointer">
                  <CardHeader className="py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-base truncate mb-1">
                          {thread.title || "Untitled Chat"}
                        </h3>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatTimeAgo(
                          new Date(thread.lastMessageAt || thread.createdAt),
                        )}
                      </span>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  );
}
