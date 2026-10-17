import { workspaceFromPath } from "./workspace-contract";
/** Select a workspace per tab; no shared role cookie or mutable local storage. */
export function deliveryFetch(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (input.startsWith("/api/delivery/") && typeof window !== "undefined") {
    const workspace = workspaceFromPath(window.location.pathname);
    if (workspace) headers.set("x-igo-workspace", workspace);
  }
  return fetch(input, { ...init, headers });
}
