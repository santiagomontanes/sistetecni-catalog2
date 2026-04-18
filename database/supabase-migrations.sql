-- ═══════════════════════════════════════════════════════════════
-- Sistetecni Catalog — Migraciones Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ── 1. BUSINESS PROFILE: campos de media del hero y logo ────────

ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS hero_video_url  TEXT,
  ADD COLUMN IF NOT EXISTS hero_media_type VARCHAR(10) DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS logo_url        TEXT;

-- ── 2. PRODUCTS: campo visible_web (si no existe) ───────────────

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS visible_web BOOLEAN DEFAULT true;

-- Asegurarse de que todos los productos existentes sean visibles
UPDATE products SET visible_web = true WHERE visible_web IS NULL;

-- ── 3. TESTIMONIALS: campo active ──────────────────────────────

ALTER TABLE testimonials
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- Activar todos los testimonios existentes
UPDATE testimonials SET active = true WHERE active IS NULL;

-- ── 4. GALLERY IMAGES: nueva tabla ─────────────────────────────

CREATE TABLE IF NOT EXISTS gallery_images (
  id         SERIAL PRIMARY KEY,
  url        TEXT         NOT NULL,
  caption    VARCHAR(200),
  orden      INTEGER      DEFAULT 0,
  activa     BOOLEAN      DEFAULT true,
  created_at TIMESTAMPTZ  DEFAULT now()
);

-- Insertar las 6 fotos estáticas actuales como datos iniciales
-- (Solo se insertan si la tabla está vacía)
INSERT INTO gallery_images (url, caption, orden, activa)
SELECT url, caption, orden, true
FROM (VALUES
  ('/gallery/1.jpg', 'Laptop corporativa reacondicionada',         0),
  ('/gallery/2.jpg', 'Equipo empresarial listo para entrega',      1),
  ('/gallery/3.jpg', 'Portátil para estudio y trabajo',            2),
  ('/gallery/4.jpg', 'Revisión y mantenimiento profesional',       3),
  ('/gallery/5.jpg', 'Equipos alineados en inventario',            4),
  ('/gallery/6.jpg', 'Computadores corporativos en excelente estado', 5)
) AS v(url, caption, orden)
WHERE NOT EXISTS (SELECT 1 FROM gallery_images LIMIT 1);

-- ── 5. SUPABASE STORAGE: buckets necesarios ────────────────────
-- Crear manualmente en Storage > New bucket:
--   • gallery  (public: true)
--   • assets   (public: true)
--
-- O con SQL si tienes acceso a storage schema:
-- INSERT INTO storage.buckets (id, name, public)
--   VALUES ('gallery', 'gallery', true)
--   ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public)
--   VALUES ('assets', 'assets', true)
--   ON CONFLICT DO NOTHING;

-- ── 6. RLS POLICIES para gallery_images ────────────────────────

-- Lectura pública
CREATE POLICY IF NOT EXISTS "gallery_images_public_read"
  ON gallery_images FOR SELECT
  USING (true);

-- Solo admins autenticados pueden insertar/actualizar/eliminar
CREATE POLICY IF NOT EXISTS "gallery_images_admin_write"
  ON gallery_images FOR ALL
  USING (auth.role() = 'authenticated');

-- Habilitar RLS en la tabla
ALTER TABLE gallery_images ENABLE ROW LEVEL SECURITY;

-- ── FIN DE MIGRACIONES ─────────────────────────────────────────
