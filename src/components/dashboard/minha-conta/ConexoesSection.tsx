import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plug, MessageSquare, Instagram } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMyConnections } from "@/hooks/useMinhaConta";
import { useMetaQuality } from "@/hooks/useMetaQuality";
import { MetaQualityBadge } from "@/components/campaigns/MetaQualityPanel";

const KIND_LABEL: Record<string, string> = {
    meta: "WhatsApp Oficial",
    uazapi: "WhatsApp Não Oficial",
    instagram: "Instagram",
};

const CONNECTED_STATUSES = ["connected", "open", "active"];

export function ConexoesSection() {
    const { data: connections, isLoading } = useMyConnections();
    const { data: quality } = useMetaQuality();

    const qualityOf = (instanceId: string) =>
        (quality || []).find((q) => q.instance_id === instanceId);

    return (
        <Card className="rounded-2xl border border-border/50 shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                    <Plug className="w-4 h-4 text-blue-500" />
                    Conexões
                </CardTitle>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <p className="text-sm text-muted-foreground">Carregando...</p>
                ) : !connections || connections.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma instância conectada</p>
                ) : (
                    <div className="space-y-2">
                        {connections.map((c) => {
                            const connected = CONNECTED_STATUSES.includes((c.status || "").toLowerCase());
                            const q = c.kind === "meta" ? qualityOf(c.id) : undefined;
                            return (
                                <div
                                    key={c.id}
                                    className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg border border-border/40 bg-muted/20"
                                >
                                    {c.kind === "instagram" ? (
                                        <Instagram className="w-4 h-4 text-pink-500 shrink-0" />
                                    ) : (
                                        <MessageSquare className="w-4 h-4 text-emerald-500 shrink-0" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{c.name}</p>
                                        {c.phone_number && (
                                            <p className="text-[11px] text-muted-foreground truncate">{c.phone_number}</p>
                                        )}
                                    </div>
                                    <Badge variant="outline" className="text-[10px] shrink-0">
                                        {KIND_LABEL[c.kind]}
                                    </Badge>
                                    <Badge
                                        className={cn(
                                            "text-[10px] shrink-0",
                                            connected
                                                ? "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15"
                                                : "bg-red-500/15 text-red-600 hover:bg-red-500/15"
                                        )}
                                    >
                                        {connected ? "Conectada" : "Desconectada"}
                                    </Badge>
                                    {q && <MetaQualityBadge rating={q.quality_rating} />}
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
