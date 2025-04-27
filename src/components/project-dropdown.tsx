"use client";
import { deleteProjectAction } from "@/app/api/chat/actions";
import { appStore } from "@/app/store";
import { Loader, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import { type PropsWithChildren, useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import { safe } from "ts-safe";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "ui/dropdown-menu";

type Props = PropsWithChildren<{
  projectId: string;
}>;

export function ProjectDropdown({ projectId, children }: Props) {
  const router = useRouter();

  const currentProjectId = appStore((state) => state.currentProjectId);

  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    safe()
      .watch(() => setIsDeleting(true))
      .ifOk(() => deleteProjectAction(projectId))
      .watch(() => setIsDeleting(false))
      .watch(({ isOk, error }) => {
        if (isOk) {
          toast.success("Project deleted");
        } else {
          toast.error(error.message || "Failed to delete project");
        }
      })
      .ifOk(() => {
        if (currentProjectId === projectId) {
          router.push("/");
        }
        mutate("threads");
        mutate("projects");
      })
      .unwrap();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          variant="destructive"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          <Trash />
          Delete Project
          {isDeleting && <Loader className="ml-auto h-4 w-4 animate-spin" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
