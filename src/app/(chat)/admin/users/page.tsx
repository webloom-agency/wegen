"use client";

import useSWR from "swr";
import { fetcher } from "lib/utils";
import { Button } from "ui/button";
import { useState } from "react";

export default function AdminUsersPage() {
  const { data, mutate } = useSWR<{ id: string; name: string; email: string; role?: "user" | "admin" }[]>(
    "/api/admin/users",
    fetcher,
  );
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const toggleRole = async (id: string, role?: "user" | "admin") => {
    try {
      setLoadingId(id);
      const next = role === "admin" ? "user" : "admin";
      const res = await fetch(`/api/admin/users/${id}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: next }),
      });
      if (!res.ok) throw new Error(await res.text());
      mutate();
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Users</h1>
      <div className="space-y-2">
        {data?.map((u) => (
          <div key={u.id} className="flex items-center justify-between border rounded p-3">
            <div className="flex flex-col">
              <span className="font-medium">{u.name}</span>
              <span className="text-xs text-muted-foreground">{u.email}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm">{u.role || "user"}</span>
              <Button size="sm" variant="secondary" disabled={loadingId === u.id} onClick={() => toggleRole(u.id, u.role)}>
                {loadingId === u.id ? "Saving..." : u.role === "admin" ? "Make user" : "Make admin"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 