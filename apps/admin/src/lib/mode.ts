export function isDemoMode() { return process.env.IGO_DEMO_MODE === 'true'; }
export function hasClerkKeys() { return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY); }
