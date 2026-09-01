-- Separa "profissional" de "sala".
--
-- Conceito: a tabela `professionals` passa a representar a SALA (a agenda).
-- Nada muda em appointments.professional_id — continua apontando para a sala,
-- que é o que a plataforma inteira já usa. O profissional humano vira a nova
-- tabela `responsaveis`.
--
-- Todo responsável tem exatamente uma sala (professionals.responsavel_id);
-- salas avulsas (sem responsável) continuam existindo normalmente.

-- ─── 1. Tabela responsaveis ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.responsaveis (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name        text NOT NULL,
    role        text,
    photo_url   text,
    active      boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_responsaveis_user ON public.responsaveis(user_id);

ALTER TABLE public.responsaveis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team read responsaveis" ON public.responsaveis;
DROP POLICY IF EXISTS "Team insert responsaveis" ON public.responsaveis;
DROP POLICY IF EXISTS "Team update responsaveis" ON public.responsaveis;
DROP POLICY IF EXISTS "Team delete responsaveis" ON public.responsaveis;

CREATE POLICY "Team read responsaveis" ON public.responsaveis
    FOR SELECT TO authenticated USING (user_id = get_owner_id());
CREATE POLICY "Team insert responsaveis" ON public.responsaveis
    FOR INSERT TO authenticated WITH CHECK (user_id = get_owner_id());
CREATE POLICY "Team update responsaveis" ON public.responsaveis
    FOR UPDATE TO authenticated USING (user_id = get_owner_id());
CREATE POLICY "Team delete responsaveis" ON public.responsaveis
    FOR DELETE TO authenticated USING (user_id = get_owner_id());

-- ─── 2. Vínculo sala ↔ responsável + inativação ─────────────────────────────

ALTER TABLE public.professionals
    ADD COLUMN IF NOT EXISTS responsavel_id uuid REFERENCES public.responsaveis(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- 1:1 — cada responsável tem no máximo uma sala
CREATE UNIQUE INDEX IF NOT EXISTS uq_professionals_responsavel
    ON public.professionals(responsavel_id) WHERE responsavel_id IS NOT NULL;

-- ─── 3. Nome sincronizado nos dois sentidos ─────────────────────────────────
-- Sala de responsável não tem nome próprio: renomear de um lado renomeia o outro.

CREATE OR REPLACE FUNCTION public.sync_sala_name_from_responsavel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.name IS DISTINCT FROM OLD.name THEN
        UPDATE public.professionals
           SET name = NEW.name, updated_at = now()
         WHERE responsavel_id = NEW.id
           AND name IS DISTINCT FROM NEW.name;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_sala_name ON public.responsaveis;
CREATE TRIGGER trg_sync_sala_name
    AFTER UPDATE OF name ON public.responsaveis
    FOR EACH ROW EXECUTE FUNCTION public.sync_sala_name_from_responsavel();

CREATE OR REPLACE FUNCTION public.sync_responsavel_name_from_sala()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.responsavel_id IS NOT NULL AND NEW.name IS DISTINCT FROM OLD.name THEN
        UPDATE public.responsaveis
           SET name = NEW.name, updated_at = now()
         WHERE id = NEW.responsavel_id
           AND name IS DISTINCT FROM NEW.name;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_responsavel_name ON public.professionals;
CREATE TRIGGER trg_sync_responsavel_name
    AFTER UPDATE OF name ON public.professionals
    FOR EACH ROW EXECUTE FUNCTION public.sync_responsavel_name_from_sala();

-- ─── 4. Inativação em cascata ───────────────────────────────────────────────
-- Inativar o responsável inativa a sala dele. A sala de um responsável não pode
-- ser inativada sozinha (o vínculo é 1:1); salas avulsas podem.

CREATE OR REPLACE FUNCTION public.sync_sala_active_from_responsavel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.active IS DISTINCT FROM OLD.active THEN
        UPDATE public.professionals
           SET active = NEW.active, updated_at = now()
         WHERE responsavel_id = NEW.id
           AND active IS DISTINCT FROM NEW.active;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_sala_active ON public.responsaveis;
CREATE TRIGGER trg_sync_sala_active
    AFTER UPDATE OF active ON public.responsaveis
    FOR EACH ROW EXECUTE FUNCTION public.sync_sala_active_from_responsavel();

CREATE OR REPLACE FUNCTION public.guard_sala_active()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_resp_active boolean;
BEGIN
    IF NEW.active IS DISTINCT FROM OLD.active AND NEW.responsavel_id IS NOT NULL THEN
        SELECT active INTO v_resp_active FROM public.responsaveis WHERE id = NEW.responsavel_id;
        -- Só aceita a mudança se ela estiver acompanhando o responsável
        -- (a cascata do trigger acima já deixou o responsável no estado novo).
        IF v_resp_active IS DISTINCT FROM NEW.active THEN
            RAISE EXCEPTION 'Esta sala pertence a um profissional. Inative o profissional para inativar a sala.'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sala_active ON public.professionals;
CREATE TRIGGER trg_guard_sala_active
    BEFORE UPDATE OF active ON public.professionals
    FOR EACH ROW EXECUTE FUNCTION public.guard_sala_active();

-- ─── 5. Exclusão bloqueada com agendamento futuro ───────────────────────────
-- appointments.professional_id é ON DELETE CASCADE: apagar a sala apagaria o
-- histórico. Excluir só é permitido quando não há agenda futura viva.

CREATE OR REPLACE FUNCTION public.sala_has_future_appointments(p_professional_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.appointments a
         WHERE a.professional_id = p_professional_id
           AND a.start_time > now()
           AND coalesce(a.status::text, '') NOT IN ('canceled', 'cancelled', 'no_show', 'completed')
    );
$$;

CREATE OR REPLACE FUNCTION public.guard_sala_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF public.sala_has_future_appointments(OLD.id) THEN
        RAISE EXCEPTION 'A sala "%" possui agendamentos futuros e não pode ser excluída.', OLD.name
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sala_delete ON public.professionals;
CREATE TRIGGER trg_guard_sala_delete
    BEFORE DELETE ON public.professionals
    FOR EACH ROW EXECUTE FUNCTION public.guard_sala_delete();

-- Excluir o responsável exclui a sala dele; se a sala tiver agenda futura, nada
-- é excluído (o guard da sala aborta a transação inteira).
CREATE OR REPLACE FUNCTION public.delete_sala_with_responsavel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    DELETE FROM public.professionals WHERE responsavel_id = OLD.id;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_sala_with_responsavel ON public.responsaveis;
CREATE TRIGGER trg_delete_sala_with_responsavel
    BEFORE DELETE ON public.responsaveis
    FOR EACH ROW EXECUTE FUNCTION public.delete_sala_with_responsavel();

-- ─── 6. updated_at ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_responsaveis_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_responsaveis ON public.responsaveis;
CREATE TRIGGER trg_touch_responsaveis
    BEFORE UPDATE ON public.responsaveis
    FOR EACH ROW EXECUTE FUNCTION public.touch_responsaveis_updated_at();

-- ─── 7. Migração de dados: PELE DERMATOLOGIA ────────────────────────────────
-- As 4 salas dos médicos já existem; aqui só nascem os responsáveis e o vínculo.

INSERT INTO public.responsaveis (user_id, name, role, photo_url)
SELECT p.user_id, p.name, p.role, p.photo_url
  FROM public.professionals p
 WHERE p.user_id = 'e697878e-29c9-4b7e-88bb-869f4f2c76af'
   AND p.name IN (
       '01 DR ALBERTO OITICICA',
       '01 DRA BIBIANA GUIMARAES',
       '01 DRA FAYRUSS MAGNA',
       '01 DRA GABRIELA GUIMARAES'
   )
   AND p.responsavel_id IS NULL
   AND NOT EXISTS (
       SELECT 1 FROM public.responsaveis r
        WHERE r.user_id = p.user_id AND r.name = p.name
   );

UPDATE public.professionals p
   SET responsavel_id = r.id
  FROM public.responsaveis r
 WHERE r.user_id = p.user_id
   AND r.name = p.name
   AND p.user_id = 'e697878e-29c9-4b7e-88bb-869f4f2c76af'
   AND p.responsavel_id IS NULL;
