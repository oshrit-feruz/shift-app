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
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}
