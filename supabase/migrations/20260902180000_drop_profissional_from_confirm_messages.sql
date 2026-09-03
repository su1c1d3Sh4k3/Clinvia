-- Remove a variavel {{profissional}} das mensagens de confirmacao.
--
-- Motivo: o valor vinha de appointments.professional_name, que o trigger
-- set_appointment_names copia de professionals.name — ou seja, o nome da SALA.
-- Em sala avulsa ("Sala 2", "Consultorio 1") a mensagem saia como
-- "...procedimento de Botox com Sala 2" para o paciente.
--
-- Os corpos default vivem no codigo (_shared/uazapi-automation-messages.ts).
-- Aqui limpamos so os corpos CUSTOMIZADOS ja salvos por cliente: sem isso o
-- renderizador devolveria o token cru e o paciente receberia o literal
-- "{{profissional}}" no lugar do nome.

UPDATE public.uazapi_automation_messages
SET body = regexp_replace(body, '\s*com\s*\{\{\s*profissional\s*\}\}', '', 'gi')
WHERE body ILIKE '%{{profissional}}%';

-- Defesa: qualquer token remanescente (uso fora do padrao "com {{profissional}}")
UPDATE public.uazapi_automation_messages
SET body = regexp_replace(body, '\s*\{\{\s*profissional\s*\}\}', '', 'gi')
WHERE body ILIKE '%{{profissional}}%';
