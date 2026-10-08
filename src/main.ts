import { main } from "./cli.ts";

if (import.meta.main) {
  const code = await main();
  if (code !== 0) Deno.exit(code);
}
