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
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getStorageManager } from "lib/browser-stroage";
import { AppSidebarMenus } from "./app-sidebar-menus";
import { AppSidebarProjects } from "./app-sidebar-projects";
import { AppSidebarThreads } from "./app-sidebar-threads";
import { AppSidebarUser } from "./app-sidebar-user";
import { MCPIcon } from "ui/mcp-icon";
import { isShortcutEvent, Shortcuts } from "lib/keyboard-shortcuts";

import { useMounted } from "@/hooks/use-mounted";
import { useTheme } from "next-themes";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "ui/select";


const browserSidebarStorage = getStorageManager<boolean>("sidebar_state");

// list only your base themes here
const BASE_THEMES = [
  "zinc",
  "slate",
  "stone",
  "gray",
  "blue",
  "orange",
  "bubblegum-pop",
  "cyberpunk-neon",
  "retro-arcade",
  "tropical-paradise",
  "steampunk-cogs",
  "neon-synthwave",
  "pastel-kawaii",
  "space-odyssey",
  "vintage-vinyl",
  "misty-harbor",
  "zen-garden",
];

export function AppSidebar() {
  const { open, toggleSidebar } = useSidebar();
  const router = useRouter();

  // persist sidebar state
  useEffect(() => {
    browserSidebarStorage.set(open);
  }, [open]);

  // global shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isShortcutEvent(e, Shortcuts.openNewChat)) {
        e.preventDefault();
        router.push("/");
      }
      if (isShortcutEvent(e, Shortcuts.toggleSidebar)) {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router, toggleSidebar]);

  // theme logic
  const isMounted = useMounted();
  const { theme = "slate", resolvedTheme, setTheme } = useTheme();
  const base = theme.replace(/-dark$/, "");
  const isDark = theme.endsWith("-dark") || resolvedTheme === "dark";

  const onThemeSelect = (value: string) => {
    setTheme(isDark ? `${value}-dark` : value);
  };

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-0.5">
            <SidebarMenuButton asChild>
              <Link href="/">
                <MCPIcon className="size-4 fill-foreground" />
                <h4 className="font-bold">mcp/chat-bot</h4>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="mt-6">
        <AppSidebarMenus isOpen={open} />
        <AppSidebarProjects />
        <AppSidebarThreads />
      </SidebarContent>

      <SidebarFooter className="flex flex-col items-stretch space-y-2">
        {isMounted && (
          <div className="px-4">
            <div className="flex items-center space-x-2">
              <Select value={base} onValueChange={onThemeSelect}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Theme…" />
                </SelectTrigger>
                <SelectContent>
                  {BASE_THEMES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
           
            </div>
          </div>
        )}

        <AppSidebarUser />
      </SidebarFooter>
    </Sidebar>
  );
}
