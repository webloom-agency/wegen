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
  DropdownMenuCheckboxItem,
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
import { useTheme } from "next-themes";
import { useMounted } from "@/hooks/use-mounted";
import { appStore } from "@/app/store";
import { BASE_THEMES } from "lib/const";
import { capitalizeFirstLetter } from "lib/utils";
import { authClient } from "auth/client";
import { SelectLanguage } from "../select-language";

export function AppSidebarUser() {
  const appStoreMutate = appStore((state) => state.mutate);
  const { data } = authClient.useSession();

  const user = data?.user;

  const isMounted = useMounted();
  const { theme = "slate", resolvedTheme, setTheme } = useTheme();
  const base = theme.replace(/-dark$/, "");
  const isDark = theme.endsWith("-dark") || resolvedTheme === "dark";

  const onThemeSelect = (value: string) => {
    setTheme(isDark ? `${value}-dark` : value);
  };

  const logout = () => {
    authClient.signOut().finally(() => {
      window.location.reload();
    });
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              size={"lg"}
            >
              <Avatar className="rounded-full size-7 border">
                <AvatarImage
                  className="object-cover"
                  src={user?.image || "/pf.png"}
                  alt={user?.name || ""}
                />
                <AvatarFallback>{user?.name?.slice(0, 1) || ""}</AvatarFallback>
              </Avatar>
              <span className="truncate">{user?.email}</span>
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
                    src={user?.image || "/pf.png"}
                    alt={user?.name || ""}
                  />
                  <AvatarFallback className="rounded-lg">CN</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user?.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user?.email}
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
                    {BASE_THEMES.map((t) => (
                      <DropdownMenuCheckboxItem
                        key={t}
                        checked={base === t}
                        onCheckedChange={() => onThemeSelect(t)}
                        className="text-sm"
                      >
                        {capitalizeFirstLetter(t)}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            )}
            <SelectLanguage />
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
