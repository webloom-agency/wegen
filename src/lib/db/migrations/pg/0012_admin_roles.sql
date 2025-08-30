-- Add role column to user table
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" varchar NOT NULL DEFAULT 'user';

-- Optional: add a simple CHECK constraint to restrict values
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

-- Make current users admin so the first admin can assign roles
UPDATE "user" SET role = 'admin' WHERE role IS NULL OR role = 'user'; 