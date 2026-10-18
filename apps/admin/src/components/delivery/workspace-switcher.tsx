"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { type Actor } from "@/lib/delivery/domain";
import {
  workspaceLabels,
  workspacePaths,
  type DeliveryWorkspace,
} from "@/lib/delivery/workspace-contract";

export function WorkspaceSwitcher({ actor }: { actor: Actor }) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState(actor.workspaces ?? []);
  useEffect(() => {
    const abort = new AbortController();
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/delivery/workspaces", {
          cache: "no-store",
          signal: abort.signal,
        });
        if (!response.ok) return;
        const data = (await response.json()) as {
          workspaces: DeliveryWorkspace[];
        };
        if (!abort.signal.aborted)
          setWorkspaces((previous) =>
            JSON.stringify(previous) === JSON.stringify(data.workspaces)
              ? previous
              : data.workspaces,
          );
      } catch {
        /* Keep the last known choices during a connection interruption. */
      }
    };
    // The server already supplied current choices with the page. Recheck on
    // focus/poll without repeating authorization immediately after hydration.
    if (!actor.workspaces) void refresh();
    const interval = setInterval(() => void refresh(), 30000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      abort.abort();
      clearInterval(interval);
      window.removeEventListener("focus", focus);
    };
  }, [actor.workspaces]);
  if (
    !workspaces.length ||
    (workspaces.length === 1 && workspaces[0] === actor.role)
  )
    return null;
  const current = workspaces.includes(actor.role as DeliveryWorkspace)
    ? (actor.role as DeliveryWorkspace)
    : null;
  return (
    <div className="d-workspace-switch">
      <Label htmlFor="workspace-picker" className="sr-only">
        Switch workspace
      </Label>
      <Select
        items={workspaces.map((value) => ({
          value,
          label: workspaceLabels[value],
        }))}
        value={current}
        onValueChange={(value) => {
          if (value && workspaces.includes(value as DeliveryWorkspace))
            router.push(workspacePaths[value as DeliveryWorkspace]);
        }}
      >
        <SelectTrigger id="workspace-picker" aria-label="Switch workspace">
          <SelectValue placeholder="Switch workspace" />
        </SelectTrigger>
        <SelectContent>
          {workspaces.map((role) => (
            <SelectItem key={role} value={role}>
              {workspaceLabels[role]} workspace
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
