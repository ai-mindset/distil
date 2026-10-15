// Only the built-in runtime APIs used by Distil are declared here.
// Runtime behavior is verified by Bun tests and compiled executable smoke tests.
interface ImportMeta {
  readonly main: boolean;
}

declare const process: {
  readonly argv: string[];
  readonly env: Record<string, string | undefined>;
  exitCode: number | undefined;
};

declare namespace Bun {
  interface Server {
    readonly hostname: string | undefined;
    readonly port: number | undefined;
    stop(closeActiveConnections?: boolean): Promise<void>;
    timeout(request: Request, seconds: number): void;
  }
}

declare const Bun: {
  spawn(
    command: string[],
    options?: {
      stdin?: "ignore" | "inherit";
      stdout?: "ignore" | "inherit" | "pipe";
      stderr?: "ignore" | "inherit" | "pipe";
      signal?: AbortSignal;
    },
  ): {
    readonly stdout: ReadableStream<Uint8Array>;
    readonly stderr: ReadableStream<Uint8Array>;
    readonly exited: Promise<number>;
    unref(): void;
  };
  serve(options: {
    hostname: string;
    port: number;
    development: boolean;
    fetch: (request: Request, server: Bun.Server) => Response | Promise<Response>;
  }): Bun.Server;
};

declare module "bun:test" {
  export function test(
    name: string,
    action: () => void | Promise<void>,
    timeout?: number,
  ): void;
}

declare module "*.png" {
  const path: string;
  export default path;
}

declare module "node:fs" {
  export function readFileSync(path: string | URL): Uint8Array;
}

declare module "node:fs/promises" {
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  export function mkdtemp(prefix: string): Promise<string>;
  export function open(
    path: string,
    flags: string,
  ): Promise<{
    writeFile(data: string | Uint8Array): Promise<void>;
    sync(): Promise<void>;
    close(): Promise<void>;
  }>;
  export function readFile(path: string | URL, encoding: "utf8"): Promise<string>;
  export function readdir(
    path: string,
    options: { withFileTypes: true },
  ): Promise<
    Array<{
      name: string;
      isFile(): boolean;
    }>
  >;
  export function rename(oldPath: string, newPath: string): Promise<void>;
  export function rm(
    path: string,
    options?: { recursive?: boolean; force?: boolean },
  ): Promise<void>;
  export function stat(path: string): Promise<{ size: number }>;
  export function writeFile(
    path: string,
    data: string | Uint8Array,
    options?: { flag?: string; mode?: number },
  ): Promise<void>;
}

declare module "node:os" {
  export function platform(): "win32" | "darwin" | "linux" | string;
  export function tmpdir(): string;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
}
