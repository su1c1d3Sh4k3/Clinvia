-- Atualizar função para retornar com foto do contato
CREATE OR REPLACE FUNCTION get_my_patients()
RETURNS TABLE (
    id uuid,
    user_id uuid,
    contact_id uuid,
    nome varchar,
    telefone varchar,
    email varchar,
    cpf varchar,
    rg varchar,
    data_nascimento date,
    sexo varchar,
    nome_civil varchar,
    cep varchar,
    endereco varchar,
    complemento varchar,
    bairro varchar,
    cidade varchar,
    estado varchar,
    estado_civil varchar,
    escolaridade varchar,
    profissao varchar,
    contatos_emergencia jsonb,
    convenios jsonb,
    docs text[],
    photos text[],
    notes jsonb,
    created_at timestamptz,
    updated_at timestamptz,
    profile_pic_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_owner_id UUID;
BEGIN
    -- Buscar owner_id do usuário logado
    SELECT tm.user_id INTO v_owner_id
    FROM public.team_members tm
    WHERE tm.auth_user_id = auth.uid()
    LIMIT 1;
    
    -- Fallback para admin
    IF v_owner_id IS NULL THEN
        SELECT tm.user_id INTO v_owner_id
        FROM public.team_members tm
        WHERE tm.user_id = auth.uid()
        LIMIT 1;
    END IF;
    
    -- Último fallback
    IF v_owner_id IS NULL THEN
        v_owner_id := auth.uid();
    END IF;
    
    -- Retornar patients com foto do contato
    RETURN QUERY
    SELECT 
        p.id,
        p.user_id,
        p.contact_id,
        p.nome,
        p.telefone,
        p.email,
        p.cpf,
        p.rg,
        p.data_nascimento,
        p.sexo,
        p.nome_civil,
        p.cep,
        p.endereco,
        p.complemento,
        p.bairro,
        p.cidade,
        p.estado,
        p.estado_civil,
        p.escolaridade,
        p.profissao,
        p.contatos_emergencia,
        p.convenios,
        p.docs,
        p.photos,
        p.notes,
        p.created_at,
        p.updated_at,
        c.profile_pic_url
    FROM public.patients p
    LEFT JOIN public.contacts c ON p.contact_id = c.id
    WHERE p.user_id = v_owner_id
    ORDER BY p.nome;
END;
$$;
