import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { evolutionApi } from "@/lib/evolution";

/**
 * Verifica se a URL é temporária do WhatsApp (expira após algum tempo).
 * URLs permanentes do Supabase Storage não precisam ser re-buscadas.
 */
const isTemporaryUrl = (url: string): boolean => {
    return url.includes("pps.whatsapp.net");
};

/**
 * Baixa uma imagem via proxy (para contornar CORS do WhatsApp),
 * faz upload no bucket 'avatars' do Supabase Storage e retorna a URL pública permanente.
 */
const persistPhotoToStorage = async (contactId: string, photoUrl: string): Promise<string | null> => {
    try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        // Se já é uma URL do nosso Storage, não precisa persistir
        if (photoUrl.includes(supabaseUrl)) return photoUrl;

        // Baixar imagem via proxy para contornar CORS do WhatsApp
        const proxyUrl = `${supabaseUrl}/functions/v1/proxy-whatsapp-image?url=${encodeURIComponent(photoUrl)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) return null;

        const blob = await response.blob();
        if (blob.size < 100) return null; // Imagem inválida

        const fileName = `contact_${contactId}.jpg`;
        const { error: uploadError } = await supabase.storage
            .from("avatars")
            .upload(fileName, blob, { contentType: "image/jpeg", upsert: true });

        if (uploadError) {
            console.error("[persistPhotoToStorage] Upload error:", uploadError);
            return null;
        }

        const { data } = supabase.storage.from("avatars").getPublicUrl(fileName);
        return `${data.publicUrl}?t=${Date.now()}`;
    } catch (error) {
        console.error("[persistPhotoToStorage] Error:", error);
        return null;
    }
};

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

                // 2. Se contato não tem foto OU tem URL temporária do WhatsApp → buscar e persistir
                const needsFetch = contact && contact.remote_jid && (
                    !contact.profile_pic_url || isTemporaryUrl(contact.profile_pic_url)
                );

                if (needsFetch) {
                    // Se tem URL temporária, tentar persistir no Storage primeiro
                    if (contact.profile_pic_url && isTemporaryUrl(contact.profile_pic_url)) {
                        const permanentUrl = await persistPhotoToStorage(contact.id, contact.profile_pic_url);
                        if (permanentUrl) {
                            await supabase
                                .from("contacts")
                                .update({ profile_pic_url: permanentUrl })
                                .eq("id", contact.id);

                            queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
                            queryClient.invalidateQueries({ queryKey: ["conversations"] });
                            return; // Foto persistida com sucesso, não precisa buscar na API
                        }
                    }

                    // URL temporária falhou ou não tinha foto → buscar da Evolution API
                    const { data: instance } = await supabase
                        .from("instances")
                        .select("*")
                        .eq("status", "connected")
                        .limit(1)
                        .single();

                    if (instance) {
                        const photoUrl = await evolutionApi.fetchContactProfilePicture(
                            instance.name,
                            contact.remote_jid,
                            instance.apikey
                        );

                        if (photoUrl) {
                            // Persistir no Storage para URL permanente
                            const permanentUrl = await persistPhotoToStorage(contact.id, photoUrl);
                            const urlToSave = permanentUrl || photoUrl;

                            await supabase
                                .from("contacts")
                                .update({ profile_pic_url: urlToSave })
                                .eq("id", contact.id);

                            queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
                            queryClient.invalidateQueries({ queryKey: ["conversations"] });
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
                    const photoUrl = await evolutionApi.fetchInstanceProfilePicture(
                        instance.name,
                        instance.apikey
                    );

                    if (photoUrl) {
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
