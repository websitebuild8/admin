import { redirect } from "next/navigation";

// Preserve identity-provider bookmarks using the current sign-in flow.
export default function Page() {
  redirect("/delivery/sign-in");
}
