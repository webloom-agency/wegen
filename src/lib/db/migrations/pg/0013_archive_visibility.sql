-- Add visibility to archive and index to archive_item
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'archive' AND column_name = 'visibility'
  ) THEN
    ALTER TABLE "archive" ADD COLUMN "visibility" varchar NOT NULL DEFAULT 'private';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS archive_item_item_id_idx ON "archive_item" ("item_id"); 