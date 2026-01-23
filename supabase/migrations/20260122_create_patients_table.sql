-- Patients Module Migration (FIXED)
-- Creates patients table and updates contacts table

-- 1. Add patient fields to contacts table
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS patient BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS patient_id UUID;

-- 2. Create patients table
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    
    -- Página 1: Dados Pessoais
    nome VARCHAR(255) NOT NULL,
    telefone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    cpf VARCHAR(14),
    rg VARCHAR(20),
    data_nascimento DATE,
    sexo VARCHAR(10),
    nome_civil VARCHAR(255),
    
    -- Página 2: Endereço
    cep VARCHAR(10),
    endereco VARCHAR(255),
    complemento VARCHAR(100),
    bairro VARCHAR(100),
    cidade VARCHAR(100),
    estado VARCHAR(2),
    
    -- Página 3: Dados Complementares
    estado_civil VARCHAR(50),
    escolaridade VARCHAR(50),
    profissao VARCHAR(100),
    contatos_emergencia JSONB DEFAULT '[]',
    
    -- Página 4: Convênios (array para múltiplos)
    convenios JSONB DEFAULT '[]',
    
    -- Anexos e Notas
    docs TEXT[] DEFAULT '{}',
    photos TEXT[] DEFAULT '{}',
    notes JSONB DEFAULT '[]',
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Add foreign key constraint from contacts to patients
ALTER TABLE contacts 
ADD CONSTRAINT fk_contacts_patient 
FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL;

-- 4. Create index for performance
CREATE INDEX IF NOT EXISTS idx_patients_user_id ON patients(user_id);
CREATE INDEX IF NOT EXISTS idx_patients_contact_id ON patients(contact_id);
CREATE INDEX IF NOT EXISTS idx_contacts_patient_id ON contacts(patient_id);

-- 5. Enable RLS
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies (simple pattern matching queues table)
CREATE POLICY "Users can view their own patients" ON patients
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own patients" ON patients
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own patients" ON patients
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own patients" ON patients
    FOR DELETE USING (auth.uid() = user_id);

-- 7. Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_patients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Trigger for updated_at
DROP TRIGGER IF EXISTS patients_updated_at ON patients;
CREATE TRIGGER patients_updated_at
    BEFORE UPDATE ON patients
    FOR EACH ROW
    EXECUTE FUNCTION update_patients_updated_at();
