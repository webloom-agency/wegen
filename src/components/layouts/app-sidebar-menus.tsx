"use client";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";
import { SidebarMenu, SidebarMenuItem } from "ui/sidebar";
import { SidebarGroupContent } from "ui/sidebar";

import { SidebarGroup } from "ui/sidebar";
import Link from "next/link";
import { getShortcutKeyList, Shortcuts } from "lib/keyboard-shortcuts";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MCPIcon } from "ui/mcp-icon";
import { WriteIcon } from "ui/write-icon";
import {
  FolderOpenIcon,
  FolderSearchIcon,
  PlusIcon,
  Waypoints,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useState } from "react";
import { Skeleton } from "ui/skeleton";
import { useArchives } from "@/hooks/queries/use-archives";
import { ArchiveDialog } from "../archive-dialog";
import useSWR from "swr";
import { authClient } from "auth/client";

export function AppSidebarMenus() {
  const router = useRouter();
  const t = useTranslations("");
  const { setOpenMobile } = useSidebar();
  const [expandedArchive, setExpandedArchive] = useState(false);
  const [addArchiveDialogOpen, setAddArchiveDialogOpen] = useState(false);

  const { data: archives, isLoading: isLoadingArchives } = useArchives();
  const toggleArchive = useCallback(() => {
    setExpandedArchive((prev) => !prev);
  }, []);

  const { data: me } = useSWR("/api/user/me", (url) => fetch(url).then((r) => r.json()), {
    revalidateOnFocus: false,
  });
  const isAdmin = (me?.role || "user") === "admin";

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem className="mb-1">
              <Link
                href="/"
                onClick={(e) => {
                  e.preventDefault();
                  setOpenMobile(false);
                  router.push(`/`);
                  router.refresh();
                }}
              >
                <SidebarMenuButton className="flex font-semibold group/new-chat bg-input/20 border border-border/40">
                  <WriteIcon className="size-4" />
                  {t("Layout.newChat")}
                  <div className="flex items-center gap-1 text-xs font-medium ml-auto opacity-0 group-hover/new-chat:opacity-100 transition-opacity">
                    {getShortcutKeyList(Shortcuts.openNewChat).map((key) => (
                      <span
                        key={key}
                        className="border w-5 h-5 flex items-center justify-center bg-accent rounded"
                      >
                        {key}
                      </span>
                    ))}
                  </div>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <Link href="/workflow">
                <SidebarMenuButton className="font-semibold">
                  <Waypoints className="size-4" />
                  {t("Layout.workflow")}
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        <SidebarMenu>
          <Tooltip>
            <SidebarMenuItem>
              <Link href="/mcp">
                <SidebarMenuButton className="font-semibold">
                  <MCPIcon className="size-4 fill-accent-foreground" />
                  {t("Layout.mcpConfiguration")}
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </Tooltip>
        </SidebarMenu>
        {isAdmin && (
          <SidebarMenu>
            <Tooltip>
              <SidebarMenuItem>
                <Link href="/admin/users">
                  <SidebarMenuButton className="font-semibold">
                    <ShieldCheck className="size-4" />
                    Admin
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            </Tooltip>
          </SidebarMenu>
        )}
        <SidebarMenu className="group/archive">
          <Tooltip>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={toggleArchive}
                className="font-semibold"
              >
                {expandedArchive ? (
                  <FolderOpenIcon className="size-4" />
                ) : (
                  <FolderSearchIcon className="size-4" />
                )}
                {t("Archive.title")}
              </SidebarMenuButton>
              <SidebarMenuAction
                className="group-hover/archive:opacity-100 opacity-0 transition-opacity"
                onClick={() => setAddArchiveDialogOpen(true)}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PlusIcon className="size-4" />
                  </TooltipTrigger>
                  <TooltipContent side="right" align="center">
                    {t("Archive.addArchive")}
                  </TooltipContent>
                </Tooltip>
              </SidebarMenuAction>
            </SidebarMenuItem>
          </Tooltip>
          {expandedArchive && (
            <>
              <SidebarMenuSub>
                {isLoadingArchives ? (
                  <div className="gap-2 flex flex-col">
                    {Array.from({ length: 2 }).map((_, index) => (
                      <Skeleton key={index} className="h-6 w-full" />
                    ))}
                  </div>
                ) : archives!.length === 0 ? (
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton className="text-muted-foreground">
                      {t("Archive.noArchives")}
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ) : (
                  archives!.map((archive) => (
                    <SidebarMenuSubItem
                      onClick={() => {
                        router.push(`/archive/${archive.id}`);
                      }}
                      key={archive.id}
                      className="cursor-pointer"
                    >
                      <SidebarMenuSubButton>
                        {archive.name}
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))
                )}
              </SidebarMenuSub>
            </>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
      <ArchiveDialog
        open={addArchiveDialogOpen}
        onOpenChange={setAddArchiveDialogOpen}
      />
    </SidebarGroup>
  );
}
