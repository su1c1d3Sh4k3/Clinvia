import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { evolutionApi } from "@/lib/evolution";

export const useFetchProfilePictures = (conversationId?: string) => {
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!conversationId) return;

        const fetchPictures = async () => {
            try {
                // 1. Buscar conversa com contato
                const { data: conversation } = await supabase
                    .from("conversations")
                    .select("*, contacts(*)")
                    .eq("id", conversationId)
                    .single();

                if (!conversation) return;

                const contact = conversation.contacts;

                // 2. Se contato não tem foto, buscar da Evolution API
                if (contact && !contact.profile_pic_url && contact.remote_jid) {
                    console.log('📸 Buscando foto do cliente:', contact.remote_jid);

                    // Buscar instância conectada
                    const { data: instance } = await supabase
                        .from("instances")
                        .select("*")
                        .eq("status", "connected")
                        .limit(1)
                        .single();

                    if (instance) {
                        // CORREÇÃO: Passar remote_jid COMPLETO (com @s.whatsapp.net)
                        const photoUrl = await evolutionApi.fetchContactProfilePicture(
                            instance.name,
                            contact.remote_jid, // COMPLETO: 5511999999999@s.whatsapp.net
                            instance.apikey
                        );

                        if (photoUrl) {
                            console.log('✅ Foto do cliente obtida:', photoUrl);
                            // Salvar foto no banco
                            await supabase
                                .from("contacts")
                                .update({ profile_pic_url: photoUrl })
                                .eq("id", contact.id);

                            // Invalidar query para recarregar
                            queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
                        }
                    }
                }

                // 3. Buscar foto da instância se não existir
                const { data: instance } = await supabase
                    .from("instances")
                    .select("*")
                    .eq("status", "connected")
                    .limit(1)
                    .single();

                if (instance && !instance.profile_pic_url) {
                    console.log('📸 Buscando foto da instância:', instance.name);

                    const photoUrl = await evolutionApi.fetchInstanceProfilePicture(
                        instance.name,
                        instance.apikey
                    );

                    if (photoUrl) {
                        console.log('✅ Foto da instância obtida:', photoUrl);
                        await supabase
                            .from("instances")
                            .update({ profile_pic_url: photoUrl })
                            .eq("id", instance.id);

                        queryClient.invalidateQueries({ queryKey: ["connected-instance"] });
                    }
                }

            } catch (error) {
                console.error("Erro ao buscar fotos de perfil:", error);
            }
        };

        fetchPictures();
    }, [conversationId, queryClient]);
};
