import { mkdir, open, readFile, readdir } from "node:fs/promises";
import { platform } from "node:os";
import { hasErrorCode } from "./fs.ts";
export async function saveDigest(
  directory: string,
  content: string,
  now = new Date(),
): Promise<string> {
  const expanded = expandHome(directory);
  await mkdir(expanded, { recursive: true });
  const timestamp = now
    .toISOString()
    .replace("T", "_")
    .replace(/\.\d{3}Z$/, "Z")
    .replaceAll(":", "");
  const stem = `distil-${timestamp}`;
  const encoded = new TextEncoder().encode(content);

  for (let suffix = 1; suffix <= 1_000; suffix++) {
    const filename = `${stem}${suffix === 1 ? "" : `-${suffix}`}.md`;
    const path = joinPath(expanded, filename);
    try {
      const file = await open(path, "wx");
      try {
        await file.writeFile(encoded);
        await file.sync();
      } finally {
        await file.close();
      }
      return path;
    } catch (error) {
      if (hasErrorCode(error, "EEXIST")) continue;
      throw error;
    }
  }
  throw new Error("Could not allocate a unique digest filename");
}

export async function listDigests(directory: string): Promise<string[]> {
  const expanded = expandHome(directory);
  try {
    const names: string[] = [];
    for (const entry of await readdir(expanded, { withFileTypes: true })) {
      if (entry.isFile() && isDigestFilename(entry.name)) names.push(entry.name);
    }
    return names.sort().reverse();
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return [];
    throw error;
  }
}

export async function readDigest(directory: string, filename: string): Promise<string> {
  if (!isDigestFilename(filename)) throw new Error("Invalid digest filename");
  return await readFile(joinPath(expandHome(directory), filename), "utf8");
}

export function expandHome(path: string): string {
  if (path === "~" || path.startsWith("~/") || path.startsWith("~\\")) {
    const home = process.env[platform() === "win32" ? "USERPROFILE" : "HOME"];
    if (!home) throw new Error("Cannot expand ~ because the home directory is unknown");
    return path === "~" ? home : joinPath(home, path.slice(2));
  }
  if (path.startsWith("~")) {
    throw new Error("Named home-directory expansion is not supported");
  }
  return path;
}

export function isDigestFilename(filename: string): boolean {
  return /^distil-[A-Za-z0-9_-]+\.md$/.test(filename) && !filename.includes("..");
}

function joinPath(directory: string, filename: string): string {
  return `${directory.replace(/[\\/]+$/, "")}/${filename}`;
}
