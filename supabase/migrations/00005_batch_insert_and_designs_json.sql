-- Batch insert helper for bulk operations
CREATE OR REPLACE FUNCTION public.batch_insert(
  p_table text,
  p_rows  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM assert_allowed_table(p_table);

  EXECUTE format(
    'INSERT INTO %I SELECT * FROM jsonb_populate_recordset(null::%I, $1)',
    p_table, p_table
  ) USING p_rows;

  SELECT jsonb_build_object('count', jsonb_array_length(p_rows)) INTO v_result;
  RETURN v_result;
END;
$$;

-- Extend designs table with JSONB columns for flexible design data
ALTER TABLE public.designs
  ADD COLUMN IF NOT EXISTS image              text,
  ADD COLUMN IF NOT EXISTS images             jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS total_cost         numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS materials          jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS processes          jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS created_by         text,
  ADD COLUMN IF NOT EXISTS updated_by         text,
  ADD COLUMN IF NOT EXISTS tags               jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS notes              text,
  ADD COLUMN IF NOT EXISTS variants           jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS size_costs         jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS size_configurations jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS size_ranges        jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS product_id         text,
  ADD COLUMN IF NOT EXISTS name_lower         text,
  ADD COLUMN IF NOT EXISTS category_lower     text,
  ADD COLUMN IF NOT EXISTS default_size_multipliers jsonb DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_designs_product_id ON public.designs (product_id);

-- Extend vendors table with tracking fields
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS rating          numeric(3,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_orders    integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount    numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_order_date timestamptz;

-- Extend BOM table with cost tracking fields
ALTER TABLE public.bom
  ADD COLUMN IF NOT EXISTS design_name          text,
  ADD COLUMN IF NOT EXISTS labor_rate           numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_cost           numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overhead_percentage  numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_material_cost  numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_labor_cost     numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_overhead_cost  numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost           numeric(15,2) DEFAULT 0;
