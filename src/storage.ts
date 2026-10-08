export async function saveDigest(
  directory: string,
  content: string,
  now = new Date(),
): Promise<string> {
  const expanded = expandHome(directory);
  await Deno.mkdir(expanded, { recursive: true });
  const timestamp = now.toISOString()
    .replace("T", "_")
    .replace(/\.\d{3}Z$/, "Z")
    .replaceAll(":", "");
  const stem = `distil-${timestamp}`;
  const encoded = new TextEncoder().encode(content);

  for (let suffix = 1; suffix <= 1_000; suffix++) {
    const filename = `${stem}${suffix === 1 ? "" : `-${suffix}`}.md`;
    const path = joinPath(expanded, filename);
    try {
      const file = await Deno.open(path, { createNew: true, write: true });
      try {
        await file.write(encoded);
        await file.sync();
      } finally {
        file.close();
      }
      return path;
    } catch (error) {
      if (error instanceof Deno.errors.AlreadyExists) continue;
      throw error;
    }
  }
  throw new Error("Could not allocate a unique digest filename");
}

export async function listDigests(directory: string): Promise<string[]> {
  const expanded = expandHome(directory);
  try {
    const names: string[] = [];
    for await (const entry of Deno.readDir(expanded)) {
      if (entry.isFile && isDigestFilename(entry.name)) names.push(entry.name);
    }
    return names.sort().reverse();
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return [];
    throw error;
  }
}

export async function readDigest(directory: string, filename: string): Promise<string> {
  if (!isDigestFilename(filename)) throw new Error("Invalid digest filename");
  return await Deno.readTextFile(joinPath(expandHome(directory), filename));
}

export function expandHome(path: string): string {
  if (path === "~" || path.startsWith("~/") || path.startsWith("~\\")) {
    const home = Deno.env.get(Deno.build.os === "windows" ? "USERPROFILE" : "HOME");
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
