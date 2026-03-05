ALTER TABLE docs
  ALTER COLUMN restricted_department TYPE text[]
  USING CASE
    WHEN restricted_department IS NULL THEN NULL
    ELSE ARRAY[restricted_department]
  END;
