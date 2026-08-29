/**
 * Types for the publisher script, which is plain ESM at the repo root so that
 * CI can run it with bare `node` and no build step.
 *
 * Declared here rather than converting the script to TypeScript: a workflow
 * step that has to compile before it can fetch is a step that can fail before
 * it fetches, and this job's whole purpose is to be the boring, dependable
 * half of the mirror. The declaration is what lets the test in
 * mirrorPrices.test.ts hold it to a typed contract anyway.
 */
declare module '*/mirror-prices.mjs' {
  export interface PublishedBar {
    d: string;
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
  }
  export function readApiError(body: unknown): string | null;
  export function isFatalError(reason: string): boolean;
  export function fatalKind(reason: string): string;
  export function mergeBars(previous: PublishedBar[] | null, fresh: PublishedBar[]): PublishedBar[];
  export function readPublishedBars(path: string): PublishedBar[];
  export function mapSeries(body: unknown): PublishedBar[] | null;
  export function buildFile(
    ticker: string,
    bars: PublishedBar[],
  ): { ticker: string; as_of: string; source: string; bars: PublishedBar[] };
  export function serialise(file: {
    ticker: string;
    as_of: string;
    source: string;
    bars: PublishedBar[];
  }): string;
}
