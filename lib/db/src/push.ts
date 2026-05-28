import { pushSchema } from "drizzle-kit/api";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

const { Pool } = pg;

function patchTtyForNonInteractivePush() {
  const stdin = process.stdin as NodeJS.ReadStream & {
    setRawMode?: (mode: boolean) => NodeJS.ReadStream;
  };
  const stdout = process.stdout as NodeJS.WriteStream;

  Object.defineProperty(stdin, "isTTY", { value: true, configurable: true });
  Object.defineProperty(stdout, "isTTY", { value: true, configurable: true });

  if (typeof stdin.setRawMode !== "function") {
    stdin.setRawMode = () => stdin;
  } else {
    const orig = stdin.setRawMode.bind(stdin);
    stdin.setRawMode = (mode: boolean) => {
      try {
        return orig(mode);
      } catch {
        return stdin;
      }
    };
  }

  const origOn = stdin.on.bind(stdin);
  stdin.on = function patchedOn(event: string | symbol, cb: (...args: unknown[]) => void) {
    const result = origOn(event, cb);
    if (event === "keypress") {
      setImmediate(() => {
        try {
          cb("\r", { name: "return", ctrl: false, meta: false, shift: false });
        } catch {
          // ignore — terminal may already be torn down
        }
      });
    }
    return result;
  } as typeof stdin.on;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set");
  }

  patchTtyForNonInteractivePush();

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const { hasDataLoss, warnings, statementsToExecute, apply } =
    await pushSchema(schema, db as never);

  if (statementsToExecute.length === 0) {
    console.log("No schema changes to apply.");
    await pool.end();
    return;
  }

  console.log(`\nApplying ${statementsToExecute.length} statement(s):`);
  for (const s of statementsToExecute) {
    console.log(`  - ${s}`);
  }

  if (warnings.length) {
    console.log("\nWarnings:");
    for (const w of warnings) console.log(`  ! ${w}`);
  }

  const allowDataLoss = process.argv.includes("--force");
  const truncates = statementsToExecute.filter((s) =>
    /^\s*truncate\b/i.test(s),
  );
  if ((hasDataLoss || truncates.length > 0) && !allowDataLoss) {
    console.error(
      "\nRefusing to apply: schema push would cause data loss " +
        "(drop column / truncate / etc). Re-run with --force to proceed.",
    );
    await pool.end();
    process.exit(1);
  }

  await apply();
  console.log("\nSchema push complete.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
