-- REGRA DO USER: "nenhum contato pode ser salvo com @s.whatsapp.net, e os que
-- ja estao precisam ser removidos".
--
-- O sufixo e detalhe do JID da UAZAPI. A Meta grava o numero limpo, entao o
-- mesmo cliente aparecia 2x no cadastro dependendo do provedor. A partir daqui
-- contacts.number guarda SO os digitos.
--
-- Sufixos que NAO sao numero de pessoa continuam intactos: @g.us (grupo),
-- @lid, @broadcast e o prefixo instagram:.

-- ---------------------------------------------------------- guard permanente
create or replace function public.contacts_strip_wa_suffix()
returns trigger
language plpgsql
as $$
begin
  if new.number is not null and new.number ~ '@(s\.whatsapp\.net|c\.us)$' then
    new.number := split_part(new.number, '@', 1);
  end if;
  return new;
end;
$$;

drop trigger if exists zz_contacts_strip_wa_suffix on public.contacts;
create trigger zz_contacts_strip_wa_suffix
before insert or update of number on public.contacts
for each row execute function public.contacts_strip_wa_suffix();

-- --------------------------------------------------------------- backfill
-- Sem risco de colisao: os pares que tinham os MESMOS digitos ja foram
-- unificados na migration 20260901120000 (o que sobra difere pelo 9o digito).
update public.contacts
   set number = split_part(number, '@', 1)
 where number ~ '@(s\.whatsapp\.net|c\.us)$';
