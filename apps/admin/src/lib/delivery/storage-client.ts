import "server-only";
import { storageProjectOrigin, storageServerKey } from "../storage-configuration";
import { DeliveryError } from "./domain";

/** Private backend transport shared by delivery receipts and partner logos. */
export function storageSettings() {
  try {
    const origin = storageProjectOrigin(process.env);
    const key = storageServerKey(process.env);
    const headers: Record<string, string> = { apikey: key };
    if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
    return { origin, headers };
  } catch {
    throw new DeliveryError("Private file storage needs server configuration.", 503);
  }
}
