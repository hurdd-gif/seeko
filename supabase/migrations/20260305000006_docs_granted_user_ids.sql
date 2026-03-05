-- Add granted_user_ids: users who get access even when their department is not in restricted_department
ALTER TABLE public.docs
  ADD COLUMN IF NOT EXISTS granted_user_ids uuid[] DEFAULT NULL;
