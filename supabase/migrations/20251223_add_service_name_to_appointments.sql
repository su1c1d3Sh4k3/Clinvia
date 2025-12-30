-- Migration: Add service_name and professional_name columns to appointments table
-- These columns are automatically populated via trigger from their respective tables

-- =============================================
-- PART 1: SERVICE_NAME
-- =============================================

-- 1.1 Adicionar coluna service_name à tabela appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_name TEXT;

-- =============================================
-- PART 2: PROFESSIONAL_NAME
-- =============================================

-- 2.1 Adicionar coluna professional_name à tabela appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS professional_name TEXT;

-- =============================================
-- PART 3: TRIGGER FUNCTION (handles both fields)
-- =============================================

-- 3.1 Criar trigger function para preencher automaticamente ambos os campos
CREATE OR REPLACE FUNCTION set_appointment_names()
RETURNS TRIGGER AS $$
BEGIN
    -- Se service_id não for NULL, buscar o nome do serviço
    IF NEW.service_id IS NOT NULL THEN
        SELECT name INTO NEW.service_name
        FROM products_services
        WHERE id = NEW.service_id;
    ELSE
        NEW.service_name := NULL;
    END IF;
    
    -- Se professional_id não for NULL, buscar o nome do profissional
    IF NEW.professional_id IS NOT NULL THEN
        SELECT name INTO NEW.professional_name
        FROM professionals
        WHERE id = NEW.professional_id;
    ELSE
        NEW.professional_name := NULL;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3.2 Remover trigger antigo (se existir)
DROP TRIGGER IF EXISTS trigger_set_appointment_service_name ON appointments;
DROP TRIGGER IF EXISTS trigger_set_appointment_names ON appointments;

-- 3.3 Criar trigger BEFORE INSERT OR UPDATE
CREATE TRIGGER trigger_set_appointment_names
    BEFORE INSERT OR UPDATE OF service_id, professional_id ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION set_appointment_names();

-- =============================================
-- PART 4: BACKFILL EXISTING DATA
-- =============================================

-- 4.1 Preencher service_name para agendamentos existentes
UPDATE appointments a
SET service_name = ps.name
FROM products_services ps
WHERE a.service_id = ps.id
AND a.service_name IS NULL;

-- 4.2 Preencher professional_name para agendamentos existentes
UPDATE appointments a
SET professional_name = p.name
FROM professionals p
WHERE a.professional_id = p.id
AND a.professional_name IS NULL;

-- =============================================
-- PART 5: INDEXES
-- =============================================

-- 5.1 Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_appointments_service_name ON appointments(service_name);
CREATE INDEX IF NOT EXISTS idx_appointments_professional_name ON appointments(professional_name);
