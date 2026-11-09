import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import path from "node:path";

// Reproducible regression checks must not depend on today's loans or stock.
const directory = fileURLToPath(new URL(".", import.meta.url));
const files = readdirSync(directory).filter((file) => file.endsWith(".test.mjs")).sort().map((file) => path.join(directory, file));
const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
