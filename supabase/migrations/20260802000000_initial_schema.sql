-- ==========================================
-- 1. TABLA: projects
-- ==========================================
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pairing_code TEXT UNIQUE NOT NULL,
  next_position INTEGER NOT NULL DEFAULT 1,
  preferred_density INTEGER DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ NULL
);

-- Habilitar RLS en projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para projects
CREATE POLICY "Los usuarios pueden ver sus propios proyectos"
  ON public.projects FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Los usuarios pueden crear sus propios proyectos"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Los usuarios pueden actualizar sus propios proyectos"
  ON public.projects FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Los usuarios pueden eliminar sus propios proyectos"
  ON public.projects FOR DELETE
  USING (auth.uid() = owner_id);


-- ==========================================
-- 2. TABLA: project_items
-- ==========================================
CREATE TABLE IF NOT EXISTS public.project_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position > 0),
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'active', 'empty', 'failed')),
  storage_path TEXT NULL,
  original_filename TEXT NULL,
  mime_type TEXT NULL,
  file_size INTEGER NULL,
  width INTEGER NULL,
  height INTEGER NULL,
  captured_at TIMESTAMPTZ NULL,
  uploaded_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1,
  error_message TEXT NULL,
  CONSTRAINT unique_project_position UNIQUE (project_id, position)
);

-- Índices obligatorios
CREATE INDEX IF NOT EXISTS idx_project_items_project_id ON public.project_items(project_id);
CREATE INDEX IF NOT EXISTS idx_project_items_project_position ON public.project_items(project_id, position);

-- Habilitar RLS en project_items
ALTER TABLE public.project_items ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para project_items
CREATE POLICY "Los usuarios pueden ver los items de sus proyectos"
  ON public.project_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_items.project_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Los usuarios pueden insertar items en sus proyectos"
  ON public.project_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_items.project_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Los usuarios pueden actualizar items en sus proyectos"
  ON public.project_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_items.project_id AND p.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_items.project_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Los usuarios pueden eliminar items de sus proyectos"
  ON public.project_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_items.project_id AND p.owner_id = auth.uid()
    )
  );


-- ==========================================
-- 3. FUNCIONES RPC TRANSACCIONALES
-- ==========================================

-- Función 1: Reserva Atómica de Posición
CREATE OR REPLACE FUNCTION public.reserve_next_project_position(p_project_id UUID)
RETURNS TABLE (
  item_id UUID,
  reserved_position INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id UUID;
  v_next_pos INTEGER;
  v_item_id UUID;
BEGIN
  -- Verificar propiedad del proyecto
  SELECT owner_id, next_position INTO v_owner_id, v_next_pos
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proyecto no encontrado.';
  END IF;

  IF v_owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'No tiene permisos para modificar este proyecto.';
  END IF;

  -- Insertar casilla en estado 'uploading'
  INSERT INTO public.project_items (
    project_id,
    position,
    status,
    captured_at
  ) VALUES (
    p_project_id,
    v_next_pos,
    'uploading',
    now()
  ) RETURNING id INTO v_item_id;

  -- Incrementar contador next_position en proyectos
  UPDATE public.projects
  SET next_position = v_next_pos + 1,
      updated_at = now()
  WHERE id = p_project_id;

  RETURN QUERY SELECT v_item_id, v_next_pos;
END;
$$;


-- Función 2: Compactación Transaccional de Posiciones
CREATE OR REPLACE FUNCTION public.compact_project_positions(p_project_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id UUID;
  r RECORD;
  v_new_position INTEGER := 1;
BEGIN
  -- Verificar propiedad
  SELECT owner_id INTO v_owner_id
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proyecto no encontrado.';
  END IF;

  IF v_owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'No tiene permisos para modificar este proyecto.';
  END IF;

  -- Eliminar casillas vacías (status = 'empty')
  DELETE FROM public.project_items
  WHERE project_id = p_project_id AND status = 'empty';

  -- Desactivar temporalmente la restricción única o reordenar de forma segura
  -- Para evitar violaciones temporales de (project_id, position), actualizamos primero a valores negativos temporales
  UPDATE public.project_items
  SET position = -position
  WHERE project_id = p_project_id;

  -- Reordenar de 1 a N
  FOR r IN 
    SELECT id FROM public.project_items
    WHERE project_id = p_project_id
    ORDER BY (-position) ASC
  LOOP
    UPDATE public.project_items
    SET position = v_new_position,
        updated_at = now()
    WHERE id = r.id;

    v_new_position := v_new_position + 1;
  END LOOP;

  -- Actualizar next_position en la tabla de proyectos
  UPDATE public.projects
  SET next_position = v_new_position,
      updated_at = now()
  WHERE id = p_project_id;

  RETURN v_new_position;
END;
$$;


-- ==========================================
-- 4. STORAGE BUCKET & POLITICAS RLS
-- ==========================================
-- Inserción del bucket privado de fotos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-photos',
  'project-photos',
  false,
  20971520, -- 20MB max
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 20971520;

-- Políticas de Storage: solo el propietario del proyecto puede leer/subir/eliminar
CREATE POLICY "Acceso a Storage por propietario"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'project-photos' AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'project-photos' AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] = auth.uid()::text
  );


-- ==========================================
-- 5. CONFIGURACIÓN SUPABASE REALTIME
-- ==========================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'project_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_items;
  END IF;
END $$;
