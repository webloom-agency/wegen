import { useEffect, useMemo, useState, type PropsWithChildren } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "ui/dialog";
import { useObjectState } from "@/hooks/use-object-state";
import { UserPreferences } from "app-types/user";
import { safe } from "ts-safe";
import { toast } from "sonner";
import useSWR from "swr";
import { fetcher } from "lib/utils";
import { Label } from "ui/label";
import { Input } from "ui/input";
import { ExamplePlaceholder } from "ui/example-placeholder";
import { Textarea } from "ui/textarea";
import { Button } from "ui/button";
import { Loader } from "lucide-react";
import { authClient } from "auth/client";
import { useTranslations } from "next-intl";

interface ChatPreferencesPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChatPreferencesPopup({
  open,
  onOpenChange,
  children,
}: PropsWithChildren<ChatPreferencesPopupProps>) {
  const t = useTranslations();

  const responseStyleExamples = useMemo(
    () => [
      t("Chat.ChatPreferences.responseStyleExample1"),
      t("Chat.ChatPreferences.responseStyleExample2"),
      t("Chat.ChatPreferences.responseStyleExample3"),
      t("Chat.ChatPreferences.responseStyleExample4"),
    ],
    [],
  );

  const professionExamples = useMemo(
    () => [
      t("Chat.ChatPreferences.professionExample1"),
      t("Chat.ChatPreferences.professionExample2"),
      t("Chat.ChatPreferences.professionExample3"),
      t("Chat.ChatPreferences.professionExample4"),
      t("Chat.ChatPreferences.professionExample5"),
    ],
    [],
  );

  const { data: session } = authClient.useSession();
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
        if (result.isOk)
          toast.success(t("Chat.ChatPreferences.preferencesSaved"));
        else toast.error(t("Chat.ChatPreferences.failedToSavePreferences"));
      })
      .watch(() => setIsSaving(false))
      .ifOk(() => onOpenChange(false));
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent hideClose className="md:max-w-2xl">
        <DialogTitle>{t("Chat.ChatPreferences.title")}</DialogTitle>
        <DialogDescription>
          {/* Introduce yourself to receive more personalized responses. */}
        </DialogDescription>
        <div className="flex flex-col gap-6 w-full">
          <div className="flex flex-col gap-2">
            <Label>{t("Chat.ChatPreferences.whatShouldWeCallYou")}</Label>
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
            <Label>{t("Chat.ChatPreferences.whatBestDescribesYourWork")}</Label>
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
              {t(
                "Chat.ChatPreferences.whatPersonalPreferencesShouldBeTakenIntoAccountInResponses",
              )}
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
            <Button variant="ghost">{t("Common.cancel")}</Button>
          </DialogClose>
          <Button disabled={isSaving} onClick={savePreferences}>
            {t("Common.save")}
            {isSaving && <Loader className="size-4 ml-2 animate-spin" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
