"use client";

import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenu,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
} from "ui/dropdown-menu";
import { AvatarFallback, AvatarImage, Avatar } from "ui/avatar";
import { SidebarMenuButton, SidebarMenuItem, SidebarMenu } from "ui/sidebar";
import {
  ChevronsUpDown,
  Command,
  LogOutIcon,
  Settings2,
  Palette,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { useMounted } from "@/hooks/use-mounted";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "ui/select";
import { appStore } from "@/app/store";

// list only your base themes here
const BASE_THEMES = [
  "zinc",
  "slate",
  "stone",
  "gray",
  "blue",
  "orange",
  "pink",
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

export function AppSidebarUser() {
  const { data: session } = useSession();
  const user = session?.user;
  const appStoreMutate = appStore((state) => state.mutate);

  const isMounted = useMounted();
  const { theme = "slate", resolvedTheme, setTheme } = useTheme();
  const base = theme.replace(/-dark$/, "");
  const isDark = theme.endsWith("-dark") || resolvedTheme === "dark";

  const onThemeSelect = (value: string) => {
    setTheme(isDark ? `${value}-dark` : value);
  };

  const logout = () => {
    signOut({
      redirectTo: "/login",
    });
  };

  if (!user) {
    return null;
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              size={"lg"}
            >
              <Avatar className="rounded-full size-7 grayscale">
                <AvatarImage
                  className="object-cover"
                  src={user.image || "/pf.png"}
                  alt={user.name || ""}
                />
                <AvatarFallback>{user.name?.slice(0, 1) || ""}</AvatarFallback>
              </Avatar>
              {user.email}
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            className="bg-background w-[--radix-dropdown-menu-trigger-width] min-w-60 rounded-lg"
            align="center"
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-full">
                  <AvatarImage
                    src={user.image || "/pf.png"}
                    alt={user.name || ""}
                  />
                  <AvatarFallback className="rounded-lg">CN</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => appStoreMutate({ openChatPreferences: true })}
            >
              <Settings2 className="size-4 text-foreground" />
              <span>Chat Preferences </span>
            </DropdownMenuItem>

            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => appStoreMutate({ openShortcutsPopup: true })}
            >
              <Command className="size-4 text-foreground" />
              <span>Keyboard Shortcuts</span>
            </DropdownMenuItem>

            {isMounted && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Palette className="mr-2 size-4" />
                  <span>Theme</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="w-48">
                    <Select value={base} onValueChange={onThemeSelect}>
                      <SelectTrigger className="w-full border-0 focus:ring-0">
                        <SelectValue placeholder="Select theme…" />
                      </SelectTrigger>
                      <SelectContent>
                        {BASE_THEMES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="cursor-pointer">
              <LogOutIcon className="size-4 text-foreground" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
