import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "distil-test-"));
}

export function removeTempDir(directory: string): Promise<void> {
  return rm(directory, { recursive: true, force: true });
}
