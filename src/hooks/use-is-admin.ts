"use client";

import useSWR from "swr";
import { fetcher } from "lib/utils";

export function useIsAdmin() {
  const { data, isLoading, error, mutate } = useSWR<{ role?: string }>(
    "/api/user/me",
    fetcher,
  );
  const isAdmin = (data as any)?.role === "admin";
  return { isAdmin, isLoading, error, mutate };
}


