import { ViewTransition, type ReactNode } from "react";

const navigation = {
  "igo-forward": "d-page-forward",
  "igo-back": "d-page-back",
  default: "d-page-soft",
};

/** Page-scoped boundaries preserve the authentication and portal layouts. */
export function PublicPageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={navigation} exit={navigation} default="none">
      {children}
    </ViewTransition>
  );
}
