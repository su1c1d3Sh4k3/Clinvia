import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { formatPhoneNumber } from "@/utils/formatters";
import { NewMessageModal } from "@/components/NewMessageModal";
import { ConversationMediaModal } from "./ConversationMediaModal";
import { Files, Loader2, MessageSquarePlus, Users } from "lucide-react";
import { toast } from "sonner";

interface GroupInfoModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    groupId: string;
    conversationId: string;
    /** Instância (UAZAPI) da conversa do grupo — usada p/ metadata ao vivo e como padrão no envio */
    instance?: any;
    onJumpToMessage?: (messageId: string) => void;
}

interface Participant {
    /** dígitos puros do telefone; "" quando não resolvível (ex.: @lid sem PhoneNumber) */
    phone: string;
    name: string | null;
    profilePicUrl: string | null;
}

const last8 = (v?: string | null) => (v || "").replace(/\D/g, "").slice(-8);

/** Extrai telefone (dígitos) de um JID UAZAPI ("5537999...@s.whatsapp.net", pode ter ":device") */
function phoneFromJid(jid?: string | null): string {
    if (!jid || jid.endsWith("@lid")) return "";
    const digits = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 15 ? digits : "";
}

export function GroupInfoModal({ open, onOpenChange, groupId, conversationId, instance, onJumpToMessage }: GroupInfoModalProps) {
    const { data: ownerId } = useOwnerId();
    const [isMediaOpen, setIsMediaOpen] = useState(false);
    const [sendTarget, setSendTarget] = useState<{ contact: any | null; phone: string } | null>(null);
    const [resolvingPhone, setResolvingPhone] = useState<string | null>(null);

    // Dados persistidos no banco (webhook popula conforme membros enviam mensagens)
    const { data: dbData, isLoading: dbLoading } = useQuery({
        queryKey: ["group-info", groupId],
        queryFn: async () => {
            const [{ data: group, error: gErr }, { data: members, error: mErr }] = await Promise.all([
                supabase.from("groups" as any).select("id, group_name, group_pic_url, remote_jid").eq("id", groupId).single(),
                supabase.from("group_members" as any).select("push_name, profile_pic_url, number, lid").eq("group_id", groupId),
            ]);
            if (gErr) throw gErr;
            if (mErr) throw mErr;
            return { group: group as any, members: (members || []) as any[] };
        },
        enabled: open && !!groupId,
    });

    // Metadata ao vivo via UAZAPI (descrição + lista COMPLETA de participantes).
    // Parsing defensivo: nomes de campos variam entre versões. Falhou → fallback DB.
    const { data: liveData, isLoading: liveLoading } = useQuery({
        queryKey: ["group-info-live", groupId, instance?.id],
        queryFn: async () => {
            const jid = dbData?.group?.remote_jid;
            const resp = await fetch("https://clinvia.uazapi.com/group/info", {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                    token: instance?.apikey || "",
                },
                body: JSON.stringify({ groupjid: jid }),
            });
            if (!resp.ok) throw new Error(`group/info HTTP ${resp.status}`);
            const raw = await resp.json();
            const g = raw?.group || raw?.data || raw || {};
            const description: string =
                g.Topic ?? g.topic ?? g.description ?? g.Description ?? g.desc ?? "";
            const rawParticipants: any[] = Array.isArray(g.Participants)
                ? g.Participants
                : Array.isArray(g.participants)
                ? g.participants
                : [];
            const participants = rawParticipants.map((p: any) => {
                const pj = typeof p === "string" ? p : p.JID ?? p.jid ?? p.id ?? "";
                const explicitPhone = typeof p === "object" ? (p.PhoneNumber ?? p.phoneNumber ?? p.phone ?? "") : "";
                const explicitLid = typeof p === "object" ? (p.LID ?? p.lid ?? "") : "";
                return {
                    jid: pj as string,
                    phone: phoneFromJid(String(explicitPhone)) || phoneFromJid(pj),
                    lid: String(explicitLid || (String(pj).endsWith("@lid") ? pj : "")).split("@")[0].replace(/\D/g, ""),
                    name: (typeof p === "object" ? p.DisplayName ?? p.name ?? p.pushName : null) || null,
                };
            });
            return { description, participants };
        },
        enabled: open && !!instance?.apikey && !!dbData?.group?.remote_jid,
        staleTime: 60_000,
        retry: false,
    });

    const group = dbData?.group;
    const members = dbData?.members || [];
    // Mapas p/ enriquecer participantes com nome/foto do banco (por telefone e por LID)
    const memberByLast8 = new Map<string, any>();
    const memberByLid = new Map<string, any>();
    for (const m of members) {
        const k = last8(m.number);
        if (k) memberByLast8.set(k, m);
        const l = (m.lid || "").split("@")[0].replace(/\D/g, "");
        if (l) memberByLid.set(l, m);
    }

    // Lista final: UAZAPI (completa) enriquecida com DB; fallback = só group_members
    let participants: Participant[];
    if (liveData?.participants?.length) {
        participants = liveData.participants.map((p) => {
            const m = (p.phone && memberByLast8.get(last8(p.phone))) || (p.lid && memberByLid.get(p.lid)) || null;
            return {
                phone: p.phone || phoneFromJid(m?.number) || "",
                name: p.name || m?.push_name || null,
                profilePicUrl: m?.profile_pic_url || null,
            };
        });
    } else {
        participants = members.map((m: any) => ({
            phone: phoneFromJid(m.number) || last8(m.number),
            name: m.push_name || null,
            profilePicUrl: m.profile_pic_url || null,
        }));
    }
    // Ordena: com nome primeiro, depois por número
    participants.sort((a, b) => (a.name || "zzz" + a.phone).localeCompare(b.name || "zzz" + b.phone, "pt-BR"));

    const description = liveData?.description || "";

    // Últimas imagens da conversa (amostra; galeria completa no ConversationMediaModal)
    const { data: mediaPreview } = useQuery({
        queryKey: ["group-media-preview", conversationId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("messages")
                .select("id, media_url")
                .eq("conversation_id", conversationId)
                .eq("is_deleted", false)
                .eq("message_type", "image")
                .not("media_url", "is", null)
                .order("created_at", { ascending: false })
                .limit(12);
            if (error) throw error;
            return data || [];
        },
        enabled: open && !!conversationId,
    });

    // Clique no participante: resolve contato existente pelos últimos 8 dígitos
    // (regra do projeto — Meta salva sem @s.whatsapp.net, UAZAPI com) e abre o
    // modal de nova mensagem; sem contato, o NewMessageModal cria ao enviar.
    const handleParticipantClick = async (p: Participant) => {
        if (!p.phone || p.phone.length < 8) {
            toast.error("Número deste participante não está disponível.");
            return;
        }
        setResolvingPhone(p.phone);
        try {
            const { data: contact } = await supabase
                .from("contacts")
                .select("id, push_name, number")
                .like("number", `%${p.phone.slice(-8)}%`)
                .eq("user_id", ownerId!)
                .order("created_at", { ascending: true })
                .limit(1)
                .maybeSingle();
            setSendTarget({ contact: contact || null, phone: p.phone });
        } catch {
            setSendTarget({ contact: null, phone: p.phone });
        } finally {
            setResolvingPhone(null);
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="w-[95vw] sm:w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Informações do Grupo
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            Detalhes, mídias e participantes do grupo
                        </DialogDescription>
                    </DialogHeader>

                    {dbLoading ? (
                        <div className="flex items-center justify-center py-10">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {/* Foto + nome + descrição */}
                            <div className="flex flex-col items-center text-center gap-2">
                                <Avatar className="h-20 w-20">
                                    <AvatarImage src={group?.group_pic_url || undefined} />
                                    <AvatarFallback className="text-2xl">
                                        {(group?.group_name || "G")[0]?.toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <h3 className="font-semibold text-base leading-tight break-words max-w-full">
                                    {group?.group_name || "Grupo"}
                                </h3>
                                {liveLoading ? (
                                    <p className="text-xs text-muted-foreground">Carregando descrição...</p>
                                ) : (
                                    <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words max-w-full">
                                        {description || "Sem descrição"}
                                    </p>
                                )}
                            </div>

                            {/* Mídias trocadas */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium flex items-center gap-1.5">
                                        <Files className="h-3.5 w-3.5" /> Mídias
                                    </span>
                                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsMediaOpen(true)}>
                                        Ver todas
                                    </Button>
                                </div>
                                {mediaPreview?.length ? (
                                    <div className="grid grid-cols-6 gap-1">
                                        {mediaPreview.map((m: any) => (
                                            <button
                                                key={m.id}
                                                onClick={() => setIsMediaOpen(true)}
                                                className="aspect-square rounded overflow-hidden bg-muted hover:opacity-80 transition-opacity"
                                            >
                                                <img src={m.media_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground">Nenhuma imagem trocada ainda.</p>
                                )}
                            </div>

                            {/* Participantes */}
                            <div className="space-y-2">
                                <span className="text-sm font-medium flex items-center gap-1.5">
                                    <Users className="h-3.5 w-3.5" /> Participantes ({participants.length})
                                </span>
                                {liveLoading && !participants.length ? (
                                    <p className="text-xs text-muted-foreground py-2">Carregando participantes...</p>
                                ) : !participants.length ? (
                                    <p className="text-xs text-muted-foreground py-2">
                                        Nenhum participante identificado ainda — a lista é preenchida conforme os membros interagem no grupo.
                                    </p>
                                ) : (
                                    <ScrollArea className="max-h-[32vh]">
                                        <div className="space-y-0.5 pr-3">
                                            {participants.map((p, i) => (
                                                <button
                                                    key={`${p.phone}-${i}`}
                                                    onClick={() => handleParticipantClick(p)}
                                                    disabled={resolvingPhone !== null}
                                                    className="w-full flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted transition-colors text-left group"
                                                >
                                                    <Avatar className="h-8 w-8 shrink-0">
                                                        <AvatarImage src={p.profilePicUrl || undefined} />
                                                        <AvatarFallback className="text-xs">
                                                            {(p.name || p.phone || "?")[0]?.toUpperCase()}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-medium truncate">
                                                            {p.name || formatPhoneNumber(p.phone) || "Desconhecido"}
                                                        </p>
                                                        {p.name && (
                                                            <p className="text-xs text-muted-foreground truncate">
                                                                {p.phone ? formatPhoneNumber(p.phone) : "Número indisponível"}
                                                            </p>
                                                        )}
                                                    </div>
                                                    {resolvingPhone === p.phone ? (
                                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                                                    ) : (
                                                        <MessageSquarePlus className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <ConversationMediaModal
                open={isMediaOpen}
                onOpenChange={setIsMediaOpen}
                conversationId={conversationId}
                onJumpToMessage={onJumpToMessage}
            />

            {sendTarget && (
                <NewMessageModal
                    open={!!sendTarget}
                    onOpenChange={(o) => !o && setSendTarget(null)}
                    prefilledContact={sendTarget.contact}
                    prefilledPhone={sendTarget.phone}
                    defaultInstanceId={instance?.id}
                />
            )}
        </>
    );
}
