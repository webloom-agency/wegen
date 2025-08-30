import "load-env";
import { Client } from "pg";

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error("POSTGRES_URL is not set");

  const client = new Client({ connectionString: url });
  await client.connect();

  const sql = `
  ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" varchar NOT NULL DEFAULT 'user';
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE constraint_name = 'user_role_check'
        AND table_name = 'user'
    ) THEN
      ALTER TABLE "user" ADD CONSTRAINT user_role_check CHECK (role IN ('user','admin'));
    END IF;
  END $$;
  UPDATE "user" SET role = 'admin' WHERE role IS NULL OR role = 'user';
  `;

  await client.query(sql);
  await client.end();
  console.log("✅ Applied role migration");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}); 