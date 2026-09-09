import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as coreSchema from "./schema";
import * as authSchema from "./auth-schema";

const schema = { ...coreSchema, ...authSchema };

// Lazily initialize the DB client so the module can be imported at build time
// (e.g. on Vercel) without a DATABASE_URL present. The client is only
// constructed when an actual query is made at runtime.
let _db: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (_db) return _db;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to your Vercel environment variables."
    );
  }

  const sql = neon(url);
  _db = drizzle({ client: sql, schema });
  return _db;
}

// Proxy that defers connection until first property access (first query).
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  },
});
