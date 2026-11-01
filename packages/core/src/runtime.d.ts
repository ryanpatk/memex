/*
 * The platform globals core relies on, declared here because core is checked
 * without the DOM or Node libs (see tsconfig.json). Browsers, Workers, Node
 * and React Native (Expo SDK 50+ ships a WHATWG URL) all provide them.
 * This file is only part of core's own typecheck; apps use their own libs.
 */
declare class URL {
  constructor(url: string, base?: string | URL);
  hash: string;
  host: string;
  hostname: string;
  href: string;
  readonly origin: string;
  pathname: string;
  port: string;
  protocol: string;
  search: string;
  readonly searchParams: URLSearchParams;
  toString(): string;
}

declare class URLSearchParams {
  constructor(init?: string | Record<string, string> | [string, string][]);
  get(name: string): string | null;
  set(name: string, value: string): void;
  has(name: string): boolean;
  toString(): string;
}
