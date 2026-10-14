import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const env = { ...process.env };
if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for Prisma commands");
}
if (env.DATABASE_URL) {
  let url;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    throw new Error("DATABASE_URL must be a PostgreSQL connection URL");
  }
  if (!["postgresql:", "postgres:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2) {
    throw new Error("DATABASE_URL must name a PostgreSQL host and database");
  }
  // Prisma's migration table must live with its owned application tables.
  // Change only the CLI child environment; Python retains the plain shared URL.
  url.searchParams.set("schema", "support_app");
  env.DATABASE_URL = url.toString();
}
const schema = fileURLToPath(new URL("../prisma/app/schema.prisma", import.meta.url));
const result = spawnSync(process.execPath, [
  require.resolve("prisma/build/index.js"), ...process.argv.slice(2), "--schema", schema,
], { env, stdio: "inherit", shell: false });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
