type Environment = Readonly<Record<string, string | undefined>>;

class StorageConfigurationError extends Error {
  constructor(
    public variable: string,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function hasQuotes(value: string) {
  return /^["']|["']$/.test(value);
}

export function storageProjectOrigin(env: Environment) {
  const value = env.SUPABASE_URL?.trim();
  if (!value)
    throw new StorageConfigurationError(
      "SUPABASE_URL",
      "missing",
      "SUPABASE_URL is missing from this running server. Check its Production value and Functions scope, then redeploy.",
    );
  if (hasQuotes(value))
    throw new StorageConfigurationError(
      "SUPABASE_URL",
      "quoted-value",
      "Remove surrounding quotes from the saved SUPABASE_URL value.",
    );
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new StorageConfigurationError(
      "SUPABASE_URL",
      "invalid-url",
      "SUPABASE_URL must be the project's HTTPS API URL.",
    );
  }
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new StorageConfigurationError(
      "SUPABASE_URL",
      "project-api-origin-required",
      "Use https://YOUR_PROJECT.supabase.co, without a dashboard path, /rest/v1, database connection string or credentials.",
    );
  return url.origin;
}

function serverKeyVariable(env: Environment) {
  return env.SUPABASE_SECRET_KEY?.trim()
    ? "SUPABASE_SECRET_KEY"
    : env.SUPABASE_SERVICE_ROLE_KEY?.trim()
      ? "SUPABASE_SERVICE_ROLE_KEY"
      : "SUPABASE_SECRET_KEY";
}

export function storageServerKey(env: Environment) {
  const variable = serverKeyVariable(env);
  const value = env[variable]?.trim();
  if (!value)
    throw new StorageConfigurationError(
      variable,
      "missing",
      "A private SUPABASE_SECRET_KEY or legacy SUPABASE_SERVICE_ROLE_KEY is missing from this running server. Check Production and Functions, then redeploy.",
    );
  if (hasQuotes(value))
    throw new StorageConfigurationError(
      variable,
      "quoted-value",
      "Remove surrounding quotes from the saved server key value.",
    );
  if (value.startsWith("sb_publishable_"))
    throw new StorageConfigurationError(
      variable,
      "publishable-key",
      "A publishable key cannot upload private logos. Use the existing private server key in Netlify's server settings.",
    );
  if (!value.startsWith("sb_secret_") && !value.startsWith("eyJ"))
    throw new StorageConfigurationError(
      variable,
      "unrecognized-key-format",
      "Use the private sb_secret_ key or legacy service-role JWT, without a Bearer prefix or placeholder text.",
    );
  return value;
}

/** Safe to return to an administrator: never includes values, fragments or hashes. */
export function storageConfigurationStatus(env: Environment) {
  function check(variable: string, read: () => string) {
    try {
      read();
      return { variable, status: "valid-format", code: null, message: null };
    } catch (error) {
      if (!(error instanceof StorageConfigurationError)) throw error;
      return {
        variable: error.variable,
        status: error.code === "missing" ? "missing" : "invalid",
        code: error.code,
        message: error.message,
      };
    }
  }
  const projectUrl = check("SUPABASE_URL", () => storageProjectOrigin(env));
  const serverKey = check(serverKeyVariable(env), () => storageServerKey(env));
  return {
    configurationValid:
      projectUrl.status === "valid-format" &&
      serverKey.status === "valid-format",
    projectUrl,
    serverKey,
    verification:
      "Format checks only; Storage connectivity and permissions have not been tested by this check.",
  };
}
