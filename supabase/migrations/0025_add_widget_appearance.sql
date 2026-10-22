ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS widget_appearance jsonb NOT NULL DEFAULT '{}'::jsonb;
NOTIFY pgrst, 'reload schema';
