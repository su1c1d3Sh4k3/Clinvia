import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";

/**
 * URL temporária do WhatsApp — expira em ~24-48h e quebra a foto.
 * Precisa ser persistida no Storage para virar permanente.
 */
const isTemporaryUrl = (url: string | null | undefined): boolean => {
    if (!url) return false;
    return url.includes("pps.whatsapp.net");
};

/**
 * Baixa a imagem via proxy edge function (que contorna CORS),
 * faz upload no bucket 'avatars' do Supabase Storage e retorna URL pública com cache-bust.
 */
const persistPhotoToStorage = async (
    contactId: string,
    photoUrl: string,
): Promise<string | null> => {
    try {
        const supabaseUrl =
            import.meta.env.VITE_SUPABASE_URL ||
            "https://swfshqvvbohnahdyndch.supabase.co";

        // Já é URL do nosso Storage → não precisa persistir
        if (photoUrl.includes(supabaseUrl)) return photoUrl;

        const proxyUrl = `${supabaseUrl}/functions/v1/proxy-whatsapp-image?url=${encodeURIComponent(photoUrl)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) return null;

        const blob = await response.blob();
        if (blob.size < 100) return null; // imagem inválida

        const fileName = `contact_${contactId}.jpg`;
        const { error: uploadError } = await supabase.storage
            .from("avatars")
            .upload(fileName, blob, { contentType: "image/jpeg", upsert: true });

        if (uploadError) {
            console.error("[deals-photos] upload error:", uploadError);
            return null;
        }

        const { data } = supabase.storage.from("avatars").getPublicUrl(fileName);
        return `${data.publicUrl}?t=${Date.now()}`;
    } catch (err) {
        console.error("[deals-photos] persist error:", err);
        return null;
    }
};

interface DealLite {
    id: string;
    contact_id?: string | null;
    contacts?: {
        id?: string;
        profile_pic_url?: string | null;
        remote_jid?: string | null;
    } | null;
}

/**
 * Hook batch que valida fotos dos contatos atrelados aos deals exibidos.
 *
 * Para cada deal:
 *   - Se o contato tem URL temporária (`pps.whatsapp.net`), faz fetch via proxy,
 *     salva permanente no Storage e atualiza `contacts.profile_pic_url` no banco.
 *   - Após qualquer atualização, invalida `["crm-deals", funnelId]` para o React Query
 *     re-renderizar com a URL fresh.
 *
 * Também subscreve realtime em `contacts.UPDATE` filtrado pelo owner — qualquer mudança
 * em `profile_pic_url` invalida a query, mantendo os cards sempre atualizados.
 */
export function useFetchDealsProfilePictures(
    funnelId: string | undefined,
    deals: DealLite[] | undefined,
) {
    const queryClient = useQueryClient();
    const { data: ownerId } = useOwnerId();
    const processingRef = useRef<Set<string>>(new Set());

    // 1. Validação proativa: persiste URLs temporárias no Storage
    useEffect(() => {
        if (!funnelId || !deals || deals.length === 0) return;

        const dealsWithTemporaryUrls = deals.filter(
            (d) =>
                d.contacts?.id &&
                d.contacts.profile_pic_url &&
                isTemporaryUrl(d.contacts.profile_pic_url) &&
                !processingRef.current.has(d.contacts.id),
        );

        if (dealsWithTemporaryUrls.length === 0) return;

        let cancelled = false;

        (async () => {
            let anyUpdated = false;

            for (const deal of dealsWithTemporaryUrls) {
                const contact = deal.contacts!;
                if (!contact.id || !contact.profile_pic_url) continue;

                processingRef.current.add(contact.id);

                const permanentUrl = await persistPhotoToStorage(
                    contact.id,
                    contact.profile_pic_url,
                );

                if (cancelled) return;

                if (permanentUrl) {
                    await supabase
                        .from("contacts")
                        .update({ profile_pic_url: permanentUrl })
                        .eq("id", contact.id);
                    anyUpdated = true;
                }
            }

            if (anyUpdated && !cancelled) {
                queryClient.invalidateQueries({ queryKey: ["crm-deals", funnelId] });
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [funnelId, deals, queryClient]);

    // 2. Realtime: invalida quando `contacts.profile_pic_url` muda no banco
    useEffect(() => {
        if (!funnelId || !ownerId) return;

        const channel = supabase
            .channel(`crm-deals-photo-watch-${funnelId}`)
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "contacts",
                    filter: `user_id=eq.${ownerId}`,
                },
                (payload) => {
                    const oldUrl = (payload.old as { profile_pic_url?: string | null })
                        ?.profile_pic_url;
                    const newUrl = (payload.new as { profile_pic_url?: string | null })
                        ?.profile_pic_url;
                    if (oldUrl !== newUrl) {
                        queryClient.invalidateQueries({
                            queryKey: ["crm-deals", funnelId],
                        });
                    }
                },
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [funnelId, ownerId, queryClient]);
}
