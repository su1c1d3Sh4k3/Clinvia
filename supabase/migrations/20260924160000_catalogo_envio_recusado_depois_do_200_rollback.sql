-- Rollback de 20260924160000_catalogo_envio_recusado_depois_do_200.sql
--
-- Tira as duas familias do catalogo. ATENCAO ao efeito real disso: sem linha no
-- catalogo o componente NAO deixa de existir — o `webhook-handle-status` vai
-- continuar relatando. O que muda e que o piso de gravidade some e a IA passa a
-- ser a unica autora da gravidade, que foi exatamente a fonte de ruido medida em
-- 24/09. Para calar de verdade, desligue no codigo, nao aqui.

delete from public.incident_component_catalog
 where match_tipo = 'prefixo'
   and component in ('envio:rejeitado-', 'envio:bloqueado-');
