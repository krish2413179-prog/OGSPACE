import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

export async function runMigration() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
  });

  const db = drizzle(pool);

  console.log("Running migrations...");

  try {
    await migrate(db, {
      migrationsFolder: path.join(__dirname, "../../drizzle"),
    });
    console.log("Migrations completed successfully");
  } catch (err) {
    console.error("Migrations failed:", err);
    throw err; // Let the caller handle it or crash the server
  } finally {
    await pool.end();
  }
}

// Only run automatically if executed directly via node
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigration().catch(() => process.exit(1));
}
