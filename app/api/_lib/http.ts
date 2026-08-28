/**
 * The minimal shape of what Vercel's Node runtime actually hands a function:
 * a parsed query object on the request, and status/json/setHeader on the
 * response. Declared here rather than depending on @vercel/node purely for
 * these two names — the runtime augments a plain Node req/res with exactly
 * this API whether or not the package is installed.
 *
 * Shared by both routes so the contract they are written against is one
 * declaration, not two that can drift.
 */

export interface ApiRequest {
  method?: string;
  query: Partial<Record<string, string | string[]>>;
  /**
   * Incoming request headers. Node lowercases header names, but the type
   * allows either case so a caller (or a test) that spells it
   * `Authorization` is not silently ignored — see readBearerToken.
   */
  headers?: Partial<Record<string, string | string[]>>;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

/**
 * Extracts the token from an `Authorization: Bearer <token>` header, or null
 * when absent/malformed. Case-insensitive on both the header name and the
 * scheme, because neither is case-sensitive per RFC 7235 and the runtime's
 * normalisation is not something a route should have to depend on.
 */
export function readBearerToken(req: ApiRequest): string | null {
  const raw = req.headers?.authorization ?? req.headers?.Authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match ? match[1].trim() || null : null;
}
