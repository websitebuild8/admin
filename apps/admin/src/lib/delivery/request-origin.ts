function configuredOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.hostname.includes("*")
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Only server configuration may supply public origins behind a hosting proxy. */
export function isAllowedDeliveryOrigin(
  request: Request,
  siteUrls: readonly (string | undefined)[] = [],
) {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site")
    return false;
  try {
    const parsed = new URL(origin);
    // A browser Origin is a single serialized HTTP(S) origin, without a path,
    // credentials or a list of addresses. Opaque origins ("null") are denied.
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.origin !== origin
    )
      return false;
    if (origin === new URL(request.url).origin) return true;
  } catch {
    return false;
  }
  // Request.url can describe an internal HTTP address after TLS termination.
  // Never turn Host or X-Forwarded-* headers into an origin allowlist.
  return siteUrls.some((value) => configuredOrigin(value) === origin);
}
