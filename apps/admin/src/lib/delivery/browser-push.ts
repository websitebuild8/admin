export const pushOwnerKey = (workspace: "PARTNER" | "DRIVER") =>
  workspace === "PARTNER" ? "igo-partner-push-owner" : "igo-rider-push-owner";

// Wait for this workspace's worker, rather than another scope's global ready promise.
export async function waitForPushWorker(
  registration: ServiceWorkerRegistration,
  timeoutMs = 15000,
) {
  if (registration.active?.state === "activated") return registration;
  const worker =
    registration.installing ?? registration.waiting ?? registration.active;
  if (!worker)
    throw new Error("Browser alerts are still preparing. Please retry.");
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      worker.removeEventListener("statechange", check);
    };
    const check = () => {
      if (worker.state === "activated") {
        cleanup();
        resolve();
      } else if (worker.state === "redundant") {
        cleanup();
        reject(new Error("Could not prepare browser alerts. Please retry."));
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Browser alerts are still preparing. Please retry."));
    }, timeoutMs);
    worker.addEventListener("statechange", check);
    check();
  });
  return registration;
}
