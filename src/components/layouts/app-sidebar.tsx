"use client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "ui/sidebar";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { AppSidebarMenus } from "./app-sidebar-menus";
import { AppSidebarAgents } from "./app-sidebar-agents";
import { AppSidebarThreads } from "./app-sidebar-threads";

import { isShortcutEvent, Shortcuts } from "lib/keyboard-shortcuts";
import { AppSidebarUser } from "./app-sidebar-user";
import { PanelLeft } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Session, User } from "better-auth";
import Image from "next/image";

export function AppSidebar({
  session,
}: { session?: { session: Session; user: User } }) {
  const { toggleSidebar, setOpenMobile } = useSidebar();
  const router = useRouter();
  const isMobile = useIsMobile();

  const currentPath = usePathname();

  // global shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isShortcutEvent(e, Shortcuts.openNewChat)) {
        e.preventDefault();
        router.push("/");
        router.refresh();
      }
      if (isShortcutEvent(e, Shortcuts.toggleSidebar)) {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router, toggleSidebar]);

  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [currentPath, isMobile]);

  return (
    <Sidebar
      collapsible="offcanvas"
      className="border-r border-sidebar-border/80"
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-0.5">
            <SidebarMenuButton asChild className="hover:bg-transparent">
              <Link
                href={`/`}
                onClick={(e) => {
                  e.preventDefault();
                  router.push("/");
                  router.refresh();
                }}
              >
                <div className="flex items-center gap-2">
                  <Image
                    src="https://bucket-prod.jecreemavitrine.fr/uploads/sites/156/2023/07/logo-sansmarge-webloom-1.svg"
                    alt="Wegen"
                    width={100}
                    height={20}
                    className="h-5 w-auto"
                    priority
                  />
                  <span className="font-bold">wegen</span>
                </div>
                <div
                  className="ml-auto block sm:hidden"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // setOpenMobile is in parent component; leaving behavior intact
                  }}
                >
                  <PanelLeft className="size-4" />
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="mt-2 overflow-hidden relative">
        <div className="flex flex-col overflow-y-auto">
          <AppSidebarAgents />
          <AppSidebarThreads />
          <AppSidebarMenus />
        </div>
      </SidebarContent>
      <SidebarFooter className="flex flex-col items-stretch space-y-2">
        <AppSidebarUser session={session} />
      </SidebarFooter>
    </Sidebar>
  );
}
