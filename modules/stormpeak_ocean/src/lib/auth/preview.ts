/**
 * Public broker metadata for the optional live-preview OAuth route.
 * The client ID and secret must come from server-only GROK_AUTH_* environment
 * variables. A shared preview credential must never be baked into source.
 */
export const GROK_ISSUER_DEFAULT = "https://auth.grok.me";

/**
 * Better Auth derives a preview callback from the request host only when it
 * matches this list. Deployed apps should set BETTER_AUTH_URL explicitly.
 */
export const PREVIEW_ALLOWED_HOSTS = ["*.grok-sandbox.com"] as const;
