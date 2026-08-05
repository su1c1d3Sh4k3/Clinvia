-- ============================================================================
-- Vínculo de contato Instagram → contato WhatsApp (perfil unificado)
-- ============================================================================
-- contacts.linked_contact_id: contato Instagram aponta para o contato
-- WhatsApp "mestre". O ClientProfileModal resolve o vínculo e mostra os
-- dados unificados abrindo por qualquer um dos dois.
-- ============================================================================

ALTER TABLE contacts
    ADD COLUMN IF NOT EXISTS linked_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_linked_contact_id
    ON contacts (linked_contact_id)
    WHERE linked_contact_id IS NOT NULL;
