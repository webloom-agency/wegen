"use client";

import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "ui/dropdown-menu";
import { DropdownMenuContent } from "ui/dropdown-menu";
import { AvatarFallback } from "ui/avatar";
import { AvatarImage } from "ui/avatar";
import { SidebarMenuButton } from "ui/sidebar";
import { DropdownMenuTrigger } from "ui/dropdown-menu";
import { DropdownMenu } from "ui/dropdown-menu";
import { SidebarMenuItem } from "ui/sidebar";
import { SidebarMenu } from "ui/sidebar";
import { Avatar } from "ui/avatar";
import { ChevronsUpDown, Loader, LogOutIcon, Settings2 } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "ui/dialog";
import { Label } from "ui/label";
import { Input } from "ui/input";
import { Textarea } from "ui/textarea";
import { Button } from "ui/button";
import useSWR from "swr";
import { UserPreferences } from "app-types/user";
import { fetcher } from "lib/utils";
import { useObjectState } from "@/hooks/use-object-state";
import { motion, AnimatePresence } from "framer-motion";
import { safe } from "ts-safe";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function AppSidebarUser() {
  const { data: session } = useSession();

  const user = session?.user;

  const [isChatPreferencesDialogOpen, setIsChatPreferencesDialogOpen] =
    useState(false);

  const logout = () => {
    signOut({
      redirectTo: "/login",
    });
  };

  if (!user) {
    return null;
  }

  return (
    <Dialog
      open={isChatPreferencesDialogOpen}
      onOpenChange={setIsChatPreferencesDialogOpen}
    >
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
                  <AvatarFallback>
                    {user.name?.slice(0, 1) || ""}
                  </AvatarFallback>
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

              <DialogTrigger asChild>
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Settings2 className="size-4 text-foreground" />
                  <span>Chat Preferences</span>
                </DropdownMenuItem>
              </DialogTrigger>

              <DropdownMenuItem onClick={logout} className="cursor-pointer">
                <LogOutIcon className="size-4 text-foreground" />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <ChatPreferencesDialogContent
        onClose={() => setIsChatPreferencesDialogOpen(false)}
        open={isChatPreferencesDialogOpen}
      />
    </Dialog>
  );
}

const responseStyleExamples = [
  "eg. keep explanations brief and to the point",
  "eg. when learning new concepts, I find analogies particularly helpful",
  "eg. ask clarifying questions before giving detailed answers",
  "eg. remember I primarily code in Python (not a coding beginner)",
];

const professionExamples = [
  "eg. software engineer",
  "eg. product manager",
  "eg. marketing manager",
  "eg. sales manager",
  "eg. business analyst",
];

function ChatPreferencesDialogContent({
  onClose,
  open,
}: {
  onClose: () => void;
  open: boolean;
}) {
  const { data: session } = useSession();
  const [preferences, setPreferences] = useObjectState<UserPreferences>({
    displayName: session?.user.name || "",
    responseStyleExample: "",
    profession: "",
  });

  const [isSaving, setIsSaving] = useState(false);

  const savePreferences = async () => {
    safe(() => setIsSaving(true))
      .ifOk(() =>
        fetch("/api/user/preferences", {
          method: "PUT",
          body: JSON.stringify(preferences),
        }),
      )
      .watch((result) => {
        if (result.isOk) toast.success("Preferences saved");
        else toast.error("Failed to save preferences");
      })
      .watch(() => setIsSaving(false))
      .ifOk(() => onClose());
  };
  const { mutate: fetchPreferences } = useSWR<UserPreferences>(
    "/api/user/preferences",
    fetcher,
    {
      fallback: {},
      onSuccess: (data) => {
        setPreferences(data);
      },
    },
  );

  useEffect(() => {
    if (open) {
      setPreferences({
        displayName: session?.user.name || "",
        responseStyleExample: "",
        profession: "",
      });
      fetchPreferences();
    }
  }, [open]);

  return (
    <DialogContent hideClose className="md:max-w-2xl">
      <DialogTitle>Chat Preferences</DialogTitle>
      <DialogDescription>
        {/* Introduce yourself to receive more personalized responses. */}
      </DialogDescription>
      <div className="flex flex-col gap-6 w-full">
        <div className="flex flex-col gap-2">
          <Label>What should we call you?</Label>
          <Input
            value={preferences.displayName}
            onChange={(e) => {
              setPreferences({
                displayName: e.target.value,
              });
            }}
          />
        </div>

        <div className="flex flex-col gap-2 text-foreground flex-1">
          <Label>What best describes your work?</Label>
          <div className="relative w-full">
            <Input
              value={preferences.profession}
              onChange={(e) => {
                setPreferences({
                  profession: e.target.value,
                });
              }}
            />
            {(preferences.profession?.length ?? 0) === 0 && (
              <div className="absolute left-0 top-0 w-full h-full py-2 px-4 pointer-events-none">
                <ExamplePlaceholder placeholder={professionExamples} />
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 text-foreground">
          <Label>
            What personal preferences should be taken into account in responses?
          </Label>
          <span className="text-xs text-muted-foreground"></span>
          <div className="relative w-full">
            <Textarea
              className="min-h-24 max-h-44 resize-none"
              value={preferences.responseStyleExample}
              onChange={(e) => {
                setPreferences({
                  responseStyleExample: e.target.value,
                });
              }}
            />
            {(preferences.responseStyleExample?.length ?? 0) === 0 && (
              <div className="absolute left-0 top-0 w-full h-full py-2 px-4 pointer-events-none">
                <ExamplePlaceholder placeholder={responseStyleExamples} />
              </div>
            )}
          </div>
        </div>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost">Cancel</Button>
        </DialogClose>
        <Button disabled={isSaving} onClick={savePreferences}>
          Save
          {isSaving && <Loader className="size-4 ml-2 animate-spin" />}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function ExamplePlaceholder({ placeholder }: { placeholder: string[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIndex((prev) => (prev + 1) % placeholder.length);
    }, 5000);
    return () => clearTimeout(timer);
  }, [index, placeholder.length]);

  return (
    <div
      className="text-sm text-muted-foreground w-full"
      style={{ position: "relative", minHeight: 20, display: "inline-block" }}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={index}
          initial={{
            opacity: 0,
            clipPath: "inset(0 100% 0 0)",
          }}
          animate={{
            opacity: 1,
            clipPath: "inset(0 0% 0 0)",
          }}
          exit={{
            opacity: 0,
            clipPath: "inset(0 0% 0 0)",
          }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          style={{ display: "inline-block", position: "absolute" }}
        >
          {placeholder[index]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
