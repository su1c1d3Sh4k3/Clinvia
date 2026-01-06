-- =============================================
-- CLEANUP: Deletar usuários específicos e seus dados vinculados
-- Data: 2026-01-05
-- Emails: bruno.leroia@gmail.com, teste2@clinvia.com
-- =============================================
-- ATENÇÃO: Esta migration deleta permanentemente os usuários e TODOS os dados vinculados
-- devido aos ON DELETE CASCADE configurados nas foreign keys
-- =============================================

DO $$
DECLARE
    v_user_id_1 UUID;
    v_user_id_2 UUID;
BEGIN
    -- Buscar IDs dos usuários pelos emails
    SELECT id INTO v_user_id_1 FROM auth.users WHERE email = 'bruno.leroia@gmail.com';
    SELECT id INTO v_user_id_2 FROM auth.users WHERE email = 'teste2@clinvia.com';

    -- Log dos IDs encontrados
    IF v_user_id_1 IS NOT NULL THEN
        RAISE NOTICE 'Usuário bruno.leroia@gmail.com encontrado: %', v_user_id_1;
    ELSE
        RAISE NOTICE 'Usuário bruno.leroia@gmail.com não encontrado';
    END IF;

    IF v_user_id_2 IS NOT NULL THEN
        RAISE NOTICE 'Usuário teste2@clinvia.com encontrado: %', v_user_id_2;
    ELSE
        RAISE NOTICE 'Usuário teste2@clinvia.com não encontrado';
    END IF;

    -- Deletar usuário 1 (bruno.leroia@gmail.com)
    IF v_user_id_1 IS NOT NULL THEN
        -- Deletar notificações relacionadas PRIMEIRO
        DELETE FROM public.notifications WHERE related_user_id = v_user_id_1;
        DELETE FROM public.notifications WHERE user_id = v_user_id_1;
        
        -- Deletar de team_members (por segurança, embora CASCADE deva fazer isso)
        DELETE FROM public.team_members WHERE auth_user_id = v_user_id_1;
        DELETE FROM public.team_members WHERE user_id = v_user_id_1;
        
        -- Deletar de profiles
        DELETE FROM public.profiles WHERE id = v_user_id_1;
        
        -- Deletar de auth.users (CASCADE deletará o resto)
        DELETE FROM auth.users WHERE id = v_user_id_1;
        
        RAISE NOTICE 'Usuário bruno.leroia@gmail.com deletado com sucesso';
    END IF;

    -- Deletar usuário 2 (teste2@clinvia.com)
    IF v_user_id_2 IS NOT NULL THEN
        -- Deletar notificações relacionadas PRIMEIRO
        DELETE FROM public.notifications WHERE related_user_id = v_user_id_2;
        DELETE FROM public.notifications WHERE user_id = v_user_id_2;
        
        -- Deletar de team_members (por segurança, embora CASCADE deva fazer isso)
        DELETE FROM public.team_members WHERE auth_user_id = v_user_id_2;
        DELETE FROM public.team_members WHERE user_id = v_user_id_2;
        
        -- Deletar de profiles
        DELETE FROM public.profiles WHERE id = v_user_id_2;
        
        -- Deletar de auth.users (CASCADE deletará o resto)
        DELETE FROM auth.users WHERE id = v_user_id_2;
        
        RAISE NOTICE 'Usuário teste2@clinvia.com deletado com sucesso';
    END IF;

    -- Mensagem final
    RAISE NOTICE 'Cleanup concluído. Verifique os logs acima para detalhes.';
END $$;
