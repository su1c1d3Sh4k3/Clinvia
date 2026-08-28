import { useEffect } from "react";
import { Megaphone } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { UPDATE_TYPE_CONFIG } from "@/pages/Reports";
import { useUnreadUpdates } from "@/hooks/useSystemUpdates";

/**
 * Aba "Avisos" do widget de suporte: as atualizações publicadas em
 * /admin?tab=atualizacoes. Abrir a aba marca tudo como lido.
 */
export function UpdatesTab() {
    const { updates, unreadIds, markAllRead } = useUnreadUpdates();
    const unreadSet = new Set(unreadIds);

    useEffect(() => {
        markAllRead();
    }, [markAllRead]);

    if (updates.length === 0) {
        return (
            <div className="text-center text-sm text-muted-foreground py-10 px-4">
                <Megaphone className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p>Nenhum aviso por aqui ainda.</p>
                <p className="text-xs mt-1">
                    Novidades, melhorias e alertas da plataforma aparecem nesta aba.
                </p>
            </div>
        );
    }

    return (
        <div className="p-3 space-y-2.5">
            {updates.map((u) => {
                const cfg = UPDATE_TYPE_CONFIG[u.type] || UPDATE_TYPE_CONFIG.update;
                const Icon = cfg.icon;
                const isUnread = unreadSet.has(u.id);
                return (
                    <div
                        key={u.id}
                        className={cn(
                            "rounded-lg border p-3 space-y-2",
                            cfg.bgColor,
                            isUnread ? "border-l-4 border-l-red-500" : "",
                            cfg.borderColor
                        )}
                    >
                        <div className="flex items-start gap-2">
                            <Icon className={cn("w-4 h-4 shrink-0 mt-0.5", cfg.color)} />
                            <h3 className={cn("font-semibold text-sm leading-snug flex-1", cfg.color)}>
                                {u.title}
                            </h3>
                            {isUnread && (
                                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-red-500 text-white font-semibold">
                                    novo
                                </span>
                            )}
                        </div>

                        <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                            {u.content}
                        </p>

                        <div className="flex flex-wrap items-center gap-1.5">
                            {(u.affected_areas || []).map((area) => (
                                <span
                                    key={area}
                                    className={cn(
                                        "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
                                        cfg.badgeClass
                                    )}
                                >
                                    {area}
                                </span>
                            ))}
                            <span className="text-[10px] text-muted-foreground ml-auto">
                                {format(new Date(u.published_at), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
