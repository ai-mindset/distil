import { main } from "./cli.ts";

if (import.meta.main) {
  const code = await main();
  process.exitCode = code;
}
