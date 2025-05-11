"use client";

import { PropsWithChildren, useState } from "react";
import { Button } from "ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerTrigger,
  DrawerFooter,
  DrawerClose,
} from "ui/drawer";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";
export default function TemporaryChat({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false);
  return (
    <Drawer direction="right" open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        {children ?? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => {
                  setOpen(!open);
                }}
                size={"sm"}
                variant={open ? "secondary" : "ghost"}
              >
                temporary
              </Button>
            </TooltipTrigger>
            <TooltipContent align="end" side="bottom">
              <p>Temporary Chat</p>
            </TooltipContent>
          </Tooltip>
        )}
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto w-full max-w-sm">
          <DrawerHeader>
            <DrawerTitle>Move Goal</DrawerTitle>
            <DrawerDescription>Set your daily activity goal.</DrawerDescription>
          </DrawerHeader>
          <div className="p-4 pb-0">Hello Body</div>
          <DrawerFooter>
            <Button>Submit</Button>
            <DrawerClose asChild>
              <Button variant="outline">Cancel</Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
