-- Create a unique index that handles NULL color_code properly
-- (UNIQUE constraint doesn't prevent duplicate NULLs in PostgreSQL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_applicability_with_null
ON public.spare_parts_applicability (spare_part_id, vehicle_model_id)
WHERE color_code IS NULL;