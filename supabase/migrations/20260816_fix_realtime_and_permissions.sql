-- ==============================================================================
-- FOTOGRID LIVE: LIMPIEZA TOTAL DE POLÍTICAS Y HABILITACIÓN DE ACCESO EN VIVO
-- Ejecuta este script en el SQL Editor de Supabase
-- ==============================================================================

-- 1. Eliminar automáticamente TODAS las políticas antiguas restrictivas
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    -- Eliminar políticas antiguas en projects y project_items
    FOR pol IN (
        SELECT policyname, tablename, schemaname 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename IN ('projects', 'project_items')
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;

    -- Eliminar políticas antiguas en storage.objects
    FOR pol IN (
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
    END LOOP;
END $$;

-- 2. Otorgar permisos globales al rol 'anon', 'authenticated' y 'service_role'
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- 3. Quitar restricción obligatoria de owner_id para permitir sesiones públicas
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'projects_owner_id_fkey' AND table_name = 'projects'
  ) THEN
    ALTER TABLE public.projects DROP CONSTRAINT projects_owner_id_fkey;
  END IF;
END $$;

ALTER TABLE public.projects ALTER COLUMN owner_id DROP NOT NULL;

-- 4. Habilitar RLS con Políticas Universales (Permitir lectura y escritura en vivo)
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total a projects"
  ON public.projects FOR ALL
  TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.project_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total a project_items"
  ON public.project_items FOR ALL
  TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- 5. Bucket de almacenamiento 'project-photos' Público y Accesible
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-photos',
  'project-photos',
  true,
  20971520,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif'];

CREATE POLICY "Acceso total a storage project-photos"
  ON storage.objects FOR ALL
  TO anon, authenticated, service_role
  USING (bucket_id = 'project-photos')
  WITH CHECK (bucket_id = 'project-photos');

-- 6. Activar Supabase Realtime
ALTER TABLE public.project_items REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'project_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_items;
  END IF;
END $$;

-- 7. Insertar / Asegurar el Proyecto por Defecto
INSERT INTO public.projects (
  id,
  name,
  pairing_code,
  next_position,
  preferred_density,
  status,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Mi Sesión FotoGrid en Vivo',
  'FG-8888',
  1,
  12,
  'active',
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  pairing_code = EXCLUDED.pairing_code,
  status = 'active';
