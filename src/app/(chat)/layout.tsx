import { SidebarProvider } from "ui/sidebar";
import { AppSidebar } from "@/components/layouts/app-sidebar";
import { AppHeader } from "@/components/layouts/app-header";
import { cookies } from "next/headers";
import { ShortcutsProvider } from "@/components/shortcuts-provider";
import { getSession } from "auth/server";
import { redirect } from "next/navigation";
import { COOKIE_KEY_SIDEBAR_STATE } from "lib/const";

export default async function ChatLayout({
  children,
}: { children: React.ReactNode }) {
  const [session, cookieStore] = await Promise.all([getSession(), cookies()]);
  if (!session) {
    return redirect("/sign-in");
  }
  const isCollapsed =
    cookieStore.get(COOKIE_KEY_SIDEBAR_STATE)?.value !== "true";
  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <ShortcutsProvider />
      <AppSidebar />
      <main className="relative w-full flex flex-col h-screen">
        <AppHeader />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>
    </SidebarProvider>
  );
}
