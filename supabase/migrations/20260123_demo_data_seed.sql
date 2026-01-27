-- =============================================
-- DEMO DATA SEED MIGRATION
-- Populates tables with demo data for user: c4ac5e5e-2bdb-4c9c-a309-8eae3582c0df
-- Created: 2026-01-23
-- =============================================

DO $$
DECLARE
    v_user_id UUID := 'c4ac5e5e-2bdb-4c9c-a309-8eae3582c0df';
    v_today DATE := CURRENT_DATE;
    v_tomorrow DATE := CURRENT_DATE + INTERVAL '1 day';
    v_day_after DATE := CURRENT_DATE + INTERVAL '2 days';
    
    -- Contact IDs (will be generated)
    v_contact_ids UUID[] := ARRAY[
        gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
        gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
    ];
    
    -- Product IDs (10 products)
    v_product_ids UUID[] := ARRAY[
        gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
        gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
    ];
    
    -- Service IDs (10 services)
    v_service_ids UUID[] := ARRAY[
        gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
        gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
    ];
    
    -- Team Member IDs
    v_team_ids UUID[] := ARRAY[
        gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
    ];
    
    -- Professional IDs
    v_prof_ids UUID[] := ARRAY[
        gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
    ];
    
    -- Funnel IDs
    v_funnel_ids UUID[] := ARRAY[
        gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
    ];
    
    -- Stage IDs (6 per funnel = 18)
    v_stage_ids UUID[];
    
    -- Task Board ID
    v_board_id UUID := gen_random_uuid();
    
BEGIN
    -- =============================================
    -- 1. INSERT CONTACTS (10 records)
    -- =============================================
    INSERT INTO contacts (id, user_id, number, push_name, phone, email, company, created_at) VALUES
    (v_contact_ids[1], v_user_id, '5511987654321@s.whatsapp.net', 'Maria Silva', '11987654321', 'maria.silva@email.com', 'Clínica Estética', NOW()),
    (v_contact_ids[2], v_user_id, '5511976543210@s.whatsapp.net', 'João Santos', '11976543210', 'joao.santos@email.com', 'Consultório Médico', NOW()),
    (v_contact_ids[3], v_user_id, '5511965432109@s.whatsapp.net', 'Ana Oliveira', '11965432109', 'ana.oliveira@email.com', 'Spa Beleza', NOW()),
    (v_contact_ids[4], v_user_id, '5511954321098@s.whatsapp.net', 'Pedro Costa', '11954321098', 'pedro.costa@email.com', NULL, NOW()),
    (v_contact_ids[5], v_user_id, '5511943210987@s.whatsapp.net', 'Carla Ferreira', '11943210987', 'carla.ferreira@email.com', 'Academia Fitness', NOW()),
    (v_contact_ids[6], v_user_id, '5511932109876@s.whatsapp.net', 'Lucas Almeida', '11932109876', 'lucas.almeida@email.com', NULL, NOW()),
    (v_contact_ids[7], v_user_id, '5511921098765@s.whatsapp.net', 'Fernanda Lima', '11921098765', 'fernanda.lima@email.com', 'Consultoria RH', NOW()),
    (v_contact_ids[8], v_user_id, '5511910987654@s.whatsapp.net', 'Roberto Martins', '11910987654', 'roberto.martins@email.com', 'Tech Solutions', NOW()),
    (v_contact_ids[9], v_user_id, '5511909876543@s.whatsapp.net', 'Juliana Souza', '11909876543', 'juliana.souza@email.com', NULL, NOW()),
    (v_contact_ids[10], v_user_id, '5511898765432@s.whatsapp.net', 'Ricardo Pereira', '11898765432', 'ricardo.pereira@email.com', 'Imobiliária Prime', NOW());

    -- =============================================
    -- 2. INSERT PRODUCTS (10 records)
    -- =============================================
    INSERT INTO products_services (id, user_id, type, name, description, price, stock_quantity, created_at) VALUES
    (v_product_ids[1], v_user_id, 'product', 'Creme Hidratante Facial', 'Creme hidratante para uso diário', 89.90, 50, NOW()),
    (v_product_ids[2], v_user_id, 'product', 'Sérum Vitamina C', 'Sérum antioxidante com vitamina C', 129.90, 35, NOW()),
    (v_product_ids[3], v_user_id, 'product', 'Protetor Solar FPS 50', 'Proteção solar de amplo espectro', 59.90, 80, NOW()),
    (v_product_ids[4], v_user_id, 'product', 'Óleo Essencial Lavanda', 'Óleo relaxante para aromaterapia', 45.00, 60, NOW()),
    (v_product_ids[5], v_user_id, 'product', 'Kit Skincare Completo', 'Kit com 5 produtos para cuidados', 299.90, 20, NOW()),
    (v_product_ids[6], v_user_id, 'product', 'Máscara Facial Argila', 'Máscara purificante de argila verde', 39.90, 45, NOW()),
    (v_product_ids[7], v_user_id, 'product', 'Gel de Limpeza Facial', 'Gel de limpeza suave para o rosto', 49.90, 70, NOW()),
    (v_product_ids[8], v_user_id, 'product', 'Tônico Facial Rosas', 'Tônico calmante com água de rosas', 55.00, 40, NOW()),
    (v_product_ids[9], v_user_id, 'product', 'Creme Anti-idade', 'Creme com ácido hialurônico', 189.90, 25, NOW()),
    (v_product_ids[10], v_user_id, 'product', 'Esfoliante Corporal', 'Esfoliante com cristais naturais', 69.90, 55, NOW());

    -- =============================================
    -- 3. INSERT SERVICES (10 records)
    -- =============================================
    INSERT INTO products_services (id, user_id, type, name, description, price, duration_minutes, opportunity_alert_days, created_at) VALUES
    (v_service_ids[1], v_user_id, 'service', 'Limpeza de Pele', 'Limpeza profunda com extração', 150.00, 60, 30, NOW()),
    (v_service_ids[2], v_user_id, 'service', 'Massagem Relaxante', 'Massagem corporal com óleos essenciais', 180.00, 60, 15, NOW()),
    (v_service_ids[3], v_user_id, 'service', 'Peeling Facial', 'Peeling químico para renovação celular', 250.00, 45, 45, NOW()),
    (v_service_ids[4], v_user_id, 'service', 'Drenagem Linfática', 'Massagem de drenagem para redução de medidas', 120.00, 50, 7, NOW()),
    (v_service_ids[5], v_user_id, 'service', 'Aplicação de Botox', 'Aplicação de toxina botulínica', 800.00, 30, 180, NOW()),
    (v_service_ids[6], v_user_id, 'service', 'Preenchimento Labial', 'Preenchimento com ácido hialurônico', 1200.00, 45, 365, NOW()),
    (v_service_ids[7], v_user_id, 'service', 'Microagulhamento', 'Tratamento para cicatrizes e rugas', 350.00, 60, 30, NOW()),
    (v_service_ids[8], v_user_id, 'service', 'Depilação a Laser', 'Sessão de depilação definitiva', 200.00, 40, 30, NOW()),
    (v_service_ids[9], v_user_id, 'service', 'Consulta Dermatológica', 'Avaliação dermatológica completa', 300.00, 30, 180, NOW()),
    (v_service_ids[10], v_user_id, 'service', 'Tratamento Capilar', 'Tratamento intensivo para cabelos', 220.00, 90, 60, NOW());

    -- =============================================
    -- 4. INSERT PATIENTS (3 records linked to first 3 contacts)
    -- =============================================
    INSERT INTO patients (id, user_id, contact_id, nome, telefone, email, cpf, data_nascimento, sexo, cidade, estado, created_at) VALUES
    (gen_random_uuid(), v_user_id, v_contact_ids[1], 'Maria Silva', '11987654321', 'maria.silva@email.com', '123.456.789-00', '1985-03-15', 'F', 'São Paulo', 'SP', NOW()),
    (gen_random_uuid(), v_user_id, v_contact_ids[2], 'João Santos', '11976543210', 'joao.santos@email.com', '234.567.890-11', '1978-07-22', 'M', 'São Paulo', 'SP', NOW()),
    (gen_random_uuid(), v_user_id, v_contact_ids[3], 'Ana Oliveira', '11965432109', 'ana.oliveira@email.com', '345.678.901-22', '1990-11-08', 'F', 'Campinas', 'SP', NOW());

    -- =============================================
    -- 5. INSERT TEAM MEMBERS (4 records)
    -- Note: All as agents since supervisor already exists
    -- =============================================
    INSERT INTO team_members (id, user_id, name, email, phone, role, created_at) VALUES
    (v_team_ids[1], v_user_id, 'Carlos Vendedor', 'carlos.vendas@clinvia.com', '11999990001', 'agent', NOW()),
    (v_team_ids[2], v_user_id, 'Patricia Recepcionista', 'patricia.recepcao@clinvia.com', '11999990002', 'agent', NOW()),
    (v_team_ids[3], v_user_id, 'Bruno Atendente', 'bruno.agent@clinvia.com', '11999990003', 'agent', NOW()),
    (v_team_ids[4], v_user_id, 'Camila Atendente', 'camila.agent@clinvia.com', '11999990004', 'agent', NOW());

    -- =============================================
    -- 6. INSERT PROFESSIONALS (4 records linked to services)
    -- =============================================
    INSERT INTO professionals (id, user_id, name, role, service_ids, work_days, work_hours, created_at) VALUES
    (v_prof_ids[1], v_user_id, 'Dra. Amanda Rodrigues', 'Dermatologista', ARRAY[v_service_ids[1], v_service_ids[3], v_service_ids[5], v_service_ids[9]], ARRAY[1,2,3,4,5], '{"start": "08:00", "end": "18:00", "break_start": "12:00", "break_end": "13:00"}', NOW()),
    (v_prof_ids[2], v_user_id, 'Dr. Felipe Mendes', 'Esteticista', ARRAY[v_service_ids[2], v_service_ids[4], v_service_ids[7]], ARRAY[1,2,3,4,5], '{"start": "09:00", "end": "19:00", "break_start": "12:30", "break_end": "13:30"}', NOW()),
    (v_prof_ids[3], v_user_id, 'Dra. Beatriz Nunes', 'Cirurgiã Plástica', ARRAY[v_service_ids[5], v_service_ids[6]], ARRAY[2,3,4], '{"start": "10:00", "end": "17:00", "break_start": "12:00", "break_end": "14:00"}', NOW()),
    (v_prof_ids[4], v_user_id, 'Marina Costa', 'Massoterapeuta', ARRAY[v_service_ids[2], v_service_ids[4], v_service_ids[10]], ARRAY[1,2,3,4,5,6], '{"start": "08:00", "end": "20:00", "break_start": "13:00", "break_end": "14:00"}', NOW());

    -- =============================================
    -- 7. INSERT CRM FUNNELS (3 records)
    -- =============================================
    INSERT INTO crm_funnels (id, user_id, name, description, is_active, created_at) VALUES
    (v_funnel_ids[1], v_user_id, 'Funil de Vendas', 'Pipeline principal de vendas de serviços', true, NOW()),
    (v_funnel_ids[2], v_user_id, 'Funil de Atendimento', 'Acompanhamento de pacientes em tratamento', true, NOW()),
    (v_funnel_ids[3], v_user_id, 'Funil Pós-Venda', 'Fidelização e retenção de clientes', true, NOW());

    -- =============================================
    -- 8. INSERT CRM STAGES (6 per funnel)
    -- =============================================
    -- Funnel 1 stages
    v_stage_ids := ARRAY[
        gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
        gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
        gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
    ];
    
    -- Funil de Vendas stages
    INSERT INTO crm_stages (id, funnel_id, name, color, position, is_system, created_at) VALUES
    (v_stage_ids[1], v_funnel_ids[1], 'Novo Lead', '#3B82F6', 0, false, NOW()),
    (v_stage_ids[2], v_funnel_ids[1], 'Contato Feito', '#8B5CF6', 1, false, NOW()),
    (v_stage_ids[3], v_funnel_ids[1], 'Proposta Enviada', '#F59E0B', 2, false, NOW()),
    (v_stage_ids[4], v_funnel_ids[1], 'Negociação', '#EF4444', 3, false, NOW()),
    (v_stage_ids[5], v_funnel_ids[1], 'Ganho', '#22C55E', 4, true, NOW()),
    (v_stage_ids[6], v_funnel_ids[1], 'Perdido', '#6B7280', 5, true, NOW());
    
    -- Funil de Atendimento stages
    INSERT INTO crm_stages (id, funnel_id, name, color, position, is_system, created_at) VALUES
    (v_stage_ids[7], v_funnel_ids[2], 'Agendado', '#3B82F6', 0, false, NOW()),
    (v_stage_ids[8], v_funnel_ids[2], 'Em Tratamento', '#8B5CF6', 1, false, NOW()),
    (v_stage_ids[9], v_funnel_ids[2], 'Retorno Marcado', '#F59E0B', 2, false, NOW()),
    (v_stage_ids[10], v_funnel_ids[2], 'Aguardando Resultado', '#EF4444', 3, false, NOW()),
    (v_stage_ids[11], v_funnel_ids[2], 'Concluído', '#22C55E', 4, true, NOW()),
    (v_stage_ids[12], v_funnel_ids[2], 'Cancelado', '#6B7280', 5, true, NOW());
    
    -- Funil Pós-Venda stages
    INSERT INTO crm_stages (id, funnel_id, name, color, position, is_system, created_at) VALUES
    (v_stage_ids[13], v_funnel_ids[3], 'Cliente Satisfeito', '#3B82F6', 0, false, NOW()),
    (v_stage_ids[14], v_funnel_ids[3], 'Indicação Solicitada', '#8B5CF6', 1, false, NOW()),
    (v_stage_ids[15], v_funnel_ids[3], 'Promoção Enviada', '#F59E0B', 2, false, NOW()),
    (v_stage_ids[16], v_funnel_ids[3], 'Retorno Agendado', '#EF4444', 3, false, NOW()),
    (v_stage_ids[17], v_funnel_ids[3], 'Fidelizado', '#22C55E', 4, true, NOW()),
    (v_stage_ids[18], v_funnel_ids[3], 'Perdido', '#6B7280', 5, true, NOW());

    -- =============================================
    -- 9. INSERT CRM DEALS (6 per funnel = 18 total)
    -- =============================================
    -- Funil 1 deals
    INSERT INTO crm_deals (id, user_id, contact_id, funnel_id, stage_id, title, description, value, priority, created_at) VALUES
    (gen_random_uuid(), v_user_id, v_contact_ids[1], v_funnel_ids[1], v_stage_ids[1], 'Pacote Skincare - Maria', 'Interesse em tratamento completo', 1500.00, 'high', NOW()),
    (gen_random_uuid(), v_user_id, v_contact_ids[2], v_funnel_ids[1], v_stage_ids[2], 'Consulta Dermatológica - João', 'Primeira consulta agendada', 300.00, 'medium', NOW()),
    (gen_random_uuid(), v_user_id, v_contact_ids[3], v_funnel_ids[1], v_stage_ids[3], 'Botox - Ana', 'Proposta enviada por WhatsApp', 800.00, 'high', NOW()),
    (gen_random_uuid(), v_user_id, v_contact_ids[4], v_funnel_ids[1], v_stage_ids[4], 'Peeling + Microagulhamento - Pedro', 'Negociando parcelamento', 600.00, 'medium', NOW()),
    (gen_random_uuid(), v_user_id, v_contact_ids[5], v_funnel_ids[1], v_stage_ids[5], 'Massagem Mensal - Carla', 'Contrato fechado 6 meses', 1080.00, 'low', NOW()),
    (gen_random_uuid(), v_user_id, v_contact_ids[6], v_funnel_ids[1], v_stage_ids[6], 'Tratamento Capilar - Lucas', 'Desistiu por preço', 220.00, 'low', NOW());
    
    -- Funil 2 deals
    INSERT INTO crm_deals (id, user_id, contact_id, funnel_id, stage_id, title, description, value, priority, created_at) VALUES
    (gen_random_uuid(), v_user_id, v_contact_ids[7], v_funnel_ids[2], v_stage_ids[7], 'Limpeza de Pele - Fernanda', 'Agendado para próxima semana', 150.00, 'medium', NOW()),
    (gen_random_uuid(), v_user_id, v_contact_ids[8], v_funnel_ids[2], v_stage_ids[8], 'Depilação a Laser - Roberto', 'Em tratamento - 3ª sessão', 600.00, 'high', NOW()),
    (gen_random_uuid(), v_user_id, v_contact_ids[9], v_funnel_ids[2], v_stage_ids[9], 'Drenagem - Juliana', 'Retorno marcado em 15 dias', 120.00, 'low', NOW()),
    (gen_random_uuid(), v_user_id, v_contact_ids[10], v_funnel_ids[2], v_stage_ids[10], 'Peeling - Ricardo', 'Aguardando resultado do tratamento', 250.00, 'medium', NOW()),
    (gen_random_uuid(), v_user_id, v_contact_ids[1], v_funnel_ids[2], v_stage_ids[11], 'Tratamento Facial - Maria', 'Tratamento concluído com sucesso', 450.00, 'high', NOW()),
    (gen_random_uuid(), v_user_id, v_contact_ids[2], v_funnel_ids[2], v_stage_ids[12], 'Massagem - João', 'Cancelou por problemas pessoais', 180.00, 'low', NOW());
    
    -- Funil 3 deals
    INSERT INTO crm_deals (id, user_id, contact_id, funnel_id, stage_id, title, description, value, priority, created_at) VALUES
    (gen_random_uuid(), v_user_id, v_contact_ids[3], v_funnel_ids[3], v_stage_ids[13], 'Pós-tratamento - Ana', 'Cliente muito satisfeita', 0.00, 'high', NOW()),
    (gen_random_uuid(), v_user_id, v_contact_ids[4], v_funnel_ids[3], v_stage_ids[14], 'Indicação - Pedro', 'Solicitada indicação de amigos', 0.00, 'medium', NOW()),
    (gen_random_uuid(), v_user_id, v_contact_ids[5], v_funnel_ids[3], v_stage_ids[15], 'Newsletter - Carla', 'Enviada promoção de aniversário', 0.00, 'low', NOW()),
    (gen_random_uuid(), v_user_id, v_contact_ids[6], v_funnel_ids[3], v_stage_ids[16], 'Reativação - Lucas', 'Tentando remarcar', 0.00, 'medium', NOW()),
    (gen_random_uuid(), v_user_id, v_contact_ids[7], v_funnel_ids[3], v_stage_ids[17], 'Cliente VIP - Fernanda', 'Cliente fidelizada há 2 anos', 0.00, 'high', NOW()),
    (gen_random_uuid(), v_user_id, v_contact_ids[8], v_funnel_ids[3], v_stage_ids[18], 'Ex-cliente - Roberto', 'Mudou de cidade', 0.00, 'low', NOW());

    -- =============================================
    -- 10. INSERT TASK BOARD (1 record)
    -- =============================================
    INSERT INTO task_boards (id, user_id, name, start_hour, end_hour, interval_minutes, allowed_agents, created_at) VALUES
    (v_board_id, v_user_id, 'Quadro Geral', 8, 20, 30, ARRAY[]::UUID[], NOW());

    -- =============================================
    -- 11. INSERT TASKS (9 records: 3 today, 3 tomorrow, 3 day after)
    -- =============================================
    INSERT INTO tasks (id, user_id, board_id, title, urgency, description, start_time, end_time, type, status, created_at) VALUES
    -- Today
    (gen_random_uuid(), v_user_id, v_board_id, 'Ligar para Maria sobre resultado', 'high', 'Confirmar satisfação com o tratamento', v_today + INTERVAL '9 hours', v_today + INTERVAL '9 hours 30 minutes', 'activity', 'pending', NOW()),
    (gen_random_uuid(), v_user_id, v_board_id, 'Preparar materiais para workshop', 'medium', 'Separar produtos para demonstração', v_today + INTERVAL '11 hours', v_today + INTERVAL '12 hours', 'activity', 'pending', NOW()),
    (gen_random_uuid(), v_user_id, v_board_id, 'Revisar estoque de produtos', 'low', 'Checar itens com baixo estoque', v_today + INTERVAL '15 hours', v_today + INTERVAL '16 hours', 'reminder', 'pending', NOW()),
    
    -- Tomorrow
    (gen_random_uuid(), v_user_id, v_board_id, 'Reunião com fornecedor', 'high', 'Negociar novos produtos', v_tomorrow + INTERVAL '10 hours', v_tomorrow + INTERVAL '11 hours', 'schedule', 'pending', NOW()),
    (gen_random_uuid(), v_user_id, v_board_id, 'Atualizar redes sociais', 'medium', 'Postar conteúdo sobre promoções', v_tomorrow + INTERVAL '14 hours', v_tomorrow + INTERVAL '15 hours', 'activity', 'pending', NOW()),
    (gen_random_uuid(), v_user_id, v_board_id, 'Enviar orçamentos pendentes', 'high', 'Responder 3 solicitações de orçamento', v_tomorrow + INTERVAL '16 hours', v_tomorrow + INTERVAL '17 hours', 'activity', 'pending', NOW()),
    
    -- Day after tomorrow
    (gen_random_uuid(), v_user_id, v_board_id, 'Treinamento da equipe', 'medium', 'Capacitação sobre novos procedimentos', v_day_after + INTERVAL '9 hours', v_day_after + INTERVAL '11 hours', 'schedule', 'pending', NOW()),
    (gen_random_uuid(), v_user_id, v_board_id, 'Manutenção equipamentos', 'low', 'Agendar revisão preventiva', v_day_after + INTERVAL '13 hours', v_day_after + INTERVAL '14 hours', 'reminder', 'pending', NOW()),
    (gen_random_uuid(), v_user_id, v_board_id, 'Follow-up clientes inativos', 'high', 'Contatar clientes sem visita há 3 meses', v_day_after + INTERVAL '15 hours', v_day_after + INTERVAL '17 hours', 'activity', 'pending', NOW());

    -- =============================================
    -- 12. INSERT APPOINTMENTS (36 total: 9 per professional)
    -- =============================================
    -- Professional 1: Dra. Amanda Rodrigues
    INSERT INTO appointments (id, user_id, professional_id, contact_id, service_id, start_time, end_time, price, description, type, status, created_at) VALUES
    -- Today
    (gen_random_uuid(), v_user_id, v_prof_ids[1], v_contact_ids[1], v_service_ids[1], v_today + INTERVAL '8 hours', v_today + INTERVAL '9 hours', 150.00, 'Limpeza de pele primeira sessão', 'appointment', 'confirmed', NOW()),
    (gen_random_uuid(), v_user_id, v_prof_ids[1], v_contact_ids[2], v_service_ids[9], v_today + INTERVAL '10 hours', v_today + INTERVAL '10 hours 30 minutes', 300.00, 'Consulta inicial', 'appointment', 'pending', NOW()),
    (gen_random_uuid(), v_user_id, v_prof_ids[1], v_contact_ids[3], v_service_ids[5], v_today + INTERVAL '14 hours', v_today + INTERVAL '14 hours 30 minutes', 800.00, 'Aplicação de Botox', 'appointment', 'confirmed', NOW()),
    -- Tomorrow
    (gen_random_uuid(), v_user_id, v_prof_ids[1], v_contact_ids[4], v_service_ids[3], v_tomorrow + INTERVAL '9 hours', v_tomorrow + INTERVAL '9 hours 45 minutes', 250.00, 'Peeling facial', 'appointment', 'pending', NOW()),
    (gen_random_uuid(), v_user_id, v_prof_ids[1], v_contact_ids[5], v_service_ids[1], v_tomorrow + INTERVAL '11 hours', v_tomorrow + INTERVAL '12 hours', 150.00, 'Limpeza de pele', 'appointment', 'confirmed', NOW()),
    (gen_random_uuid(), v_user_id, v_prof_ids[1], v_contact_ids[6], v_service_ids[9], v_tomorrow + INTERVAL '15 hours', v_tomorrow + INTERVAL '15 hours 30 minutes', 300.00, 'Retorno consulta', 'appointment', 'pending', NOW()),
    -- Day after
    (gen_random_uuid(), v_user_id, v_prof_ids[1], v_contact_ids[7], v_service_ids[5], v_day_after + INTERVAL '8 hours', v_day_after + INTERVAL '8 hours 30 minutes', 800.00, 'Botox - retoque', 'appointment', 'pending', NOW()),
    (gen_random_uuid(), v_user_id, v_prof_ids[1], v_contact_ids[8], v_service_ids[3], v_day_after + INTERVAL '10 hours', v_day_after + INTERVAL '10 hours 45 minutes', 250.00, 'Peeling segunda sessão', 'appointment', 'confirmed', NOW()),
    (gen_random_uuid(), v_user_id, v_prof_ids[1], v_contact_ids[9], v_service_ids[1], v_day_after + INTERVAL '14 hours', v_day_after + INTERVAL '15 hours', 150.00, 'Limpeza de pele', 'appointment', 'pending', NOW());
    
    -- Professional 2: Dr. Felipe Mendes
    INSERT INTO appointments (id, user_id, professional_id, contact_id, service_id, start_time, end_time, price, description, type, status, created_at) VALUES
    -- Today
    (gen_random_uuid(), v_user_id, v_prof_ids[2], v_contact_ids[10], v_service_ids[2], v_today + INTERVAL '9 hours', v_today + INTERVAL '10 hours', 180.00, 'Massagem relaxante', 'appointment', 'confirmed', NOW()),
    (gen_random_uuid(), v_user_id, v_prof_ids[2], v_contact_ids[1], v_service_ids[4], v_today + INTERVAL '11 hours', v_today + INTERVAL '11 hours 50 minutes', 120.00, 'Drenagem linfática', 'appointment', 'pending', NOW()),
    (gen_random_uuid(), v_user_id, v_prof_ids[2], v_contact_ids[2], v_service_ids[7], v_today + INTERVAL '15 hours', v_today + INTERVAL '16 hours', 350.00, 'Microagulhamento', 'appointment', 'confirmed', NOW()),
    -- Tomorrow
    (gen_random_uuid(), v_user_id, v_prof_ids[2], v_contact_ids[3], v_service_ids[2], v_tomorrow + INTERVAL '10 hours', v_tomorrow + INTERVAL '11 hours', 180.00, 'Massagem relaxante', 'appointment', 'pending', NOW()),
    (gen_random_uuid(), v_user_id, v_prof_ids[2], v_contact_ids[4], v_service_ids[4], v_tomorrow + INTERVAL '13 hours', v_tomorrow + INTERVAL '13 hours 50 minutes', 120.00, 'Drenagem linfática', 'appointment', 'confirmed', NOW()),
    (gen_random_uuid(), v_user_id, v_prof_ids[2], v_contact_ids[5], v_service_ids[7], v_tomorrow + INTERVAL '16 hours', v_tomorrow + INTERVAL '17 hours', 350.00, 'Microagulhamento', 'appointment', 'pending', NOW()),
    -- Day after
    (gen_random_uuid(), v_user_id, v_prof_ids[2], v_contact_ids[6], v_service_ids[2], v_day_after + INTERVAL '9 hours', v_day_after + INTERVAL '10 hours', 180.00, 'Massagem relaxante', 'appointment', 'confirmed', NOW()),
    (gen_random_uuid(), v_user_id, v_prof_ids[2], v_contact_ids[7], v_service_ids[4], v_day_after + INTERVAL '11 hours', v_day_after + INTERVAL '11 hours 50 minutes', 120.00, 'Drenagem linfática', 'appointment', 'pending', NOW()),
    (gen_random_uuid(), v_user_id, v_prof_ids[2], v_contact_ids[8], v_service_ids[7], v_day_after + INTERVAL '15 hours', v_day_after + INTERVAL '16 hours', 350.00, 'Microagulhamento', 'appointment', 'confirmed', NOW());
    
    -- Professional 3: Dra. Beatriz Nunes
    INSERT INTO appointments (id, user_id, professional_id, contact_id, service_id, start_time, end_time, price, description, type, status, created_at) VALUES
    -- Today
    (gen_random_uuid(), v_user_id, v_prof_ids[3], v_contact_ids[9], v_service_ids[5], v_today + INTERVAL '10 hours', v_today + INTERVAL '10 hours 30 minutes', 800.00, 'Aplicação de Botox', 'appointment', 'confirmed', NOW()),
    (gen_random_uuid(), v_user_id, v_prof_ids[3], v_contact_ids[10], v_service_ids[6], v_today + INTERVAL '11 hours', v_today + INTERVAL '11 hours 45 minutes', 1200.00, 'Preenchimento labial', 'appointment', 'pending', NOW()),
    (gen_random_uuid(), v_user_id, v_prof_ids[3], v_contact_ids[1], v_service_ids[5], v_today + INTERVAL '14 hours 30 minutes', v_today + INTERVAL '15 hours', 800.00, 'Botox - retoque', 'appointment', 'confirmed', NOW()),
    -- Tomorrow
    (gen_random_uuid(), v_user_id, v_prof_ids[3], v_contact_ids[2], v_service_ids[6], v_tomorrow + INTERVAL '10 hours', v_tomorrow + INTERVAL '10 hours 45 minutes', 1200.00, 'Preenchimento labial', 'appointment', 'pending', NOW()),
    (gen_random_uuid(), v_user_id, v_prof_ids[3], v_contact_ids[3], v_service_ids[5], v_tomorrow + INTERVAL '11 hours 30 minutes', v_tomorrow + INTERVAL '12 hours', 800.00, 'Aplicação de Botox', 'appointment', 'confirmed', NOW()),
    (gen_random_uuid(), v_user_id, v_prof_ids[3], v_contact_ids[4], v_service_ids[6], v_tomorrow + INTERVAL '14 hours', v_tomorrow + INTERVAL '14 hours 45 minutes', 1200.00, 'Preenchimento facial', 'appointment', 'pending', NOW()),
    -- Day after
    (gen_random_uuid(), v_user_id, v_prof_ids[3], v_contact_ids[5], v_service_ids[5], v_day_after + INTERVAL '10 hours', v_day_after + INTERVAL '10 hours 30 minutes', 800.00, 'Botox primeira aplicação', 'appointment', 'confirmed', NOW()),
    (gen_random_uuid(), v_user_id, v_prof_ids[3], v_contact_ids[6], v_service_ids[6], v_day_after + INTERVAL '11 hours', v_day_after + INTERVAL '11 hours 45 minutes', 1200.00, 'Preenchimento labial', 'appointment', 'pending', NOW()),
    (gen_random_uuid(), v_user_id, v_prof_ids[3], v_contact_ids[7], v_service_ids[5], v_day_after + INTERVAL '14 hours 30 minutes', v_day_after + INTERVAL '15 hours', 800.00, 'Botox retoque', 'appointment', 'confirmed', NOW());
    
    -- Professional 4: Marina Costa
    INSERT INTO appointments (id, user_id, professional_id, contact_id, service_id, start_time, end_time, price, description, type, status, created_at) VALUES
    -- Today
    (gen_random_uuid(), v_user_id, v_prof_ids[4], v_contact_ids[8], v_service_ids[2], v_today + INTERVAL '8 hours', v_today + INTERVAL '9 hours', 180.00, 'Massagem relaxante', 'appointment', 'confirmed', NOW()),
    (gen_random_uuid(), v_user_id, v_prof_ids[4], v_contact_ids[9], v_service_ids[4], v_today + INTERVAL '10 hours', v_today + INTERVAL '10 hours 50 minutes', 120.00, 'Drenagem linfática', 'appointment', 'pending', NOW()),
    (gen_random_uuid(), v_user_id, v_prof_ids[4], v_contact_ids[10], v_service_ids[10], v_today + INTERVAL '15 hours', v_today + INTERVAL '16 hours 30 minutes', 220.00, 'Tratamento capilar', 'appointment', 'confirmed', NOW()),
    -- Tomorrow
    (gen_random_uuid(), v_user_id, v_prof_ids[4], v_contact_ids[1], v_service_ids[2], v_tomorrow + INTERVAL '9 hours', v_tomorrow + INTERVAL '10 hours', 180.00, 'Massagem relaxante VIP', 'appointment', 'pending', NOW()),
    (gen_random_uuid(), v_user_id, v_prof_ids[4], v_contact_ids[2], v_service_ids[4], v_tomorrow + INTERVAL '11 hours', v_tomorrow + INTERVAL '11 hours 50 minutes', 120.00, 'Drenagem pós operatório', 'appointment', 'confirmed', NOW()),
    (gen_random_uuid(), v_user_id, v_prof_ids[4], v_contact_ids[3], v_service_ids[10], v_tomorrow + INTERVAL '14 hours', v_tomorrow + INTERVAL '15 hours 30 minutes', 220.00, 'Tratamento capilar', 'appointment', 'pending', NOW()),
    -- Day after
    (gen_random_uuid(), v_user_id, v_prof_ids[4], v_contact_ids[4], v_service_ids[2], v_day_after + INTERVAL '8 hours', v_day_after + INTERVAL '9 hours', 180.00, 'Massagem relaxante', 'appointment', 'confirmed', NOW()),
    (gen_random_uuid(), v_user_id, v_prof_ids[4], v_contact_ids[5], v_service_ids[4], v_day_after + INTERVAL '10 hours', v_day_after + INTERVAL '10 hours 50 minutes', 120.00, 'Drenagem linfática', 'appointment', 'pending', NOW()),
    (gen_random_uuid(), v_user_id, v_prof_ids[4], v_contact_ids[6], v_service_ids[10], v_day_after + INTERVAL '16 hours', v_day_after + INTERVAL '17 hours 30 minutes', 220.00, 'Tratamento capilar intensivo', 'appointment', 'confirmed', NOW());

    -- =============================================
    -- 13. INSERT SALES (10 records)
    -- =============================================
    INSERT INTO sales (id, user_id, category, product_service_id, quantity, unit_price, total_amount, payment_type, installments, interest_rate, sale_date, team_member_id, professional_id, notes, created_at) VALUES
    -- Cash sales
    (gen_random_uuid(), v_user_id, 'product', v_product_ids[1], 2, 89.90, 179.80, 'cash', 1, 0, CURRENT_DATE - INTERVAL '5 days', v_team_ids[3], NULL, 'Venda balcão', NOW()),
    (gen_random_uuid(), v_user_id, 'product', v_product_ids[2], 1, 129.90, 129.90, 'cash', 1, 0, CURRENT_DATE - INTERVAL '3 days', v_team_ids[4], NULL, 'Cliente indicação', NOW()),
    (gen_random_uuid(), v_user_id, 'service', v_service_ids[1], 1, 150.00, 150.00, 'cash', 1, 0, CURRENT_DATE - INTERVAL '2 days', NULL, v_prof_ids[1], 'Limpeza de pele', NOW()),
    (gen_random_uuid(), v_user_id, 'service', v_service_ids[2], 1, 180.00, 180.00, 'cash', 1, 0, CURRENT_DATE - INTERVAL '1 day', NULL, v_prof_ids[4], 'Massagem relaxante', NOW()),
    (gen_random_uuid(), v_user_id, 'product', v_product_ids[5], 1, 299.90, 299.90, 'cash', 1, 0, CURRENT_DATE, v_team_ids[3], NULL, 'Kit completo vendido', NOW()),
    
    -- Installment sales
    (gen_random_uuid(), v_user_id, 'service', v_service_ids[5], 1, 800.00, 800.00, 'installment', 4, 2.5, CURRENT_DATE - INTERVAL '10 days', NULL, v_prof_ids[3], 'Botox parcelado', NOW()),
    (gen_random_uuid(), v_user_id, 'service', v_service_ids[6], 1, 1200.00, 1200.00, 'installment', 6, 2.0, CURRENT_DATE - INTERVAL '7 days', NULL, v_prof_ids[3], 'Preenchimento parcelado', NOW()),
    (gen_random_uuid(), v_user_id, 'product', v_product_ids[9], 3, 189.90, 569.70, 'installment', 3, 0, CURRENT_DATE - INTERVAL '4 days', v_team_ids[4], NULL, 'Compra para revenda', NOW()),
    (gen_random_uuid(), v_user_id, 'service', v_service_ids[8], 5, 200.00, 1000.00, 'installment', 5, 1.5, CURRENT_DATE - INTERVAL '2 days', NULL, v_prof_ids[2], 'Pacote depilação 5 sessões', NOW()),
    (gen_random_uuid(), v_user_id, 'service', v_service_ids[7], 3, 350.00, 1050.00, 'installment', 3, 0, CURRENT_DATE, NULL, v_prof_ids[2], 'Pacote microagulhamento', NOW());

    RAISE NOTICE 'Demo data inserted successfully for user %', v_user_id;
    
END $$;
