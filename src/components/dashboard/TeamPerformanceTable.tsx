import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Sparkles, TrendingUp, Clock, CheckCircle2, AlertCircle, Users } from "lucide-react";
import { toast } from "sonner";

// Card individual de agente com design moderno
const AgentCard = ({
    agent,
    rank,
    onEvaluate
}: {
    agent: any,
    rank: number,
    onEvaluate: (agent: any) => void
}) => {
    const qualityColor = agent.avg_quality >= 8
        ? 'text-green-500'
        : agent.avg_quality >= 5
            ? 'text-yellow-500'
            : 'text-red-500';

    const qualityBg = agent.avg_quality >= 8
        ? 'bg-green-500/10'
        : agent.avg_quality >= 5
            ? 'bg-yellow-500/10'
            : 'bg-red-500/10';

    return (
        <div className="relative rounded-2xl bg-card/50 backdrop-blur-sm border border-border/50 p-5 hover:border-border hover:shadow-lg transition-all duration-300 group">
            {/* Rank Badge */}
            {rank <= 3 && (
                <div className={`absolute -top-2 -left-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${rank === 1 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' :
                        rank === 2 ? 'bg-gradient-to-br from-gray-300 to-gray-500' :
                            'bg-gradient-to-br from-amber-600 to-amber-800'
                    }`}>
                    {rank}
                </div>
            )}

            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <Avatar className="w-12 h-12 ring-2 ring-background shadow-lg">
                    <AvatarImage src={agent.avatar_url} />
                    <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/40 text-primary font-semibold">
                        {agent.name?.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                    <h4 className="font-semibold truncate">{agent.name}</h4>
                    <p className="text-xs text-muted-foreground">Atendente</p>
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-2 rounded-lg bg-muted/30">
                    <div className="flex items-center justify-center gap-1 text-yellow-500 mb-1">
                        <Clock className="w-3 h-3" />
                    </div>
                    <p className="text-lg font-bold">{agent.pending_tickets}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Pendentes</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/30">
                    <div className="flex items-center justify-center gap-1 text-blue-500 mb-1">
                        <AlertCircle className="w-3 h-3" />
                    </div>
                    <p className="text-lg font-bold">{agent.open_tickets}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Abertos</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/30">
                    <div className="flex items-center justify-center gap-1 text-green-500 mb-1">
                        <CheckCircle2 className="w-3 h-3" />
                    </div>
                    <p className="text-lg font-bold">{agent.resolved_tickets}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Resolvidos</p>
                </div>
            </div>

            {/* Footer Stats */}
            <div className="flex items-center justify-between pt-3 border-t border-border/50">
                <div className="flex items-center gap-2">
                    <div className={`px-2 py-1 rounded-full ${qualityBg} ${qualityColor} text-xs font-semibold`}>
                        ★ {agent.avg_quality}
                    </div>
                    <span className="text-xs text-muted-foreground">
                        {agent.avg_response_time_min}min avg
                    </span>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => onEvaluate(agent)}
                >
                    <Sparkles className="w-3 h-3 text-yellow-500" />
                    <span className="text-xs">Avaliar</span>
                </Button>
            </div>
        </div>
    );
};

// Card de resumo do time
const TeamSummaryCard = ({ team }: { team: any[] }) => {
    const totalResolved = team.reduce((acc, a) => acc + (a.resolved_tickets || 0), 0);
    const avgQuality = team.length > 0
        ? (team.reduce((acc, a) => acc + (a.avg_quality || 0), 0) / team.length).toFixed(1)
        : 0;
    const avgResponseTime = team.length > 0
        ? Math.round(team.reduce((acc, a) => acc + (a.avg_response_time_min || 0), 0) / team.length)
        : 0;

    return (
        <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-6">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-3 rounded-xl bg-primary/10">
                    <Users className="w-6 h-6 text-primary" />
                </div>
                <div>
                    <h3 className="font-semibold">Resumo da Equipe</h3>
                    <p className="text-sm text-muted-foreground">{team.length} agentes ativos</p>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                    <p className="text-3xl font-bold text-primary">{totalResolved}</p>
                    <p className="text-xs text-muted-foreground mt-1">Total Resolvidos</p>
                </div>
                <div className="text-center">
                    <p className="text-3xl font-bold text-green-500">{avgQuality}</p>
                    <p className="text-xs text-muted-foreground mt-1">Nota Média</p>
                </div>
                <div className="text-center">
                    <p className="text-3xl font-bold text-cyan-500">{avgResponseTime}m</p>
                    <p className="text-xs text-muted-foreground mt-1">Tempo Médio</p>
                </div>
            </div>
        </div>
    );
};

export const TeamPerformanceTable = () => {
    const [selectedAgent, setSelectedAgent] = useState<any>(null);
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [evaluationResult, setEvaluationResult] = useState<string | null>(null);

    const { data: team, isLoading } = useQuery({
        queryKey: ['team-performance'],
        queryFn: async () => {
            const { data, error } = await supabase.rpc('get_team_performance');
            if (error) throw error;
            return data;
        }
    });

    const handleEvaluate = async (agent: any) => {
        setSelectedAgent(agent);
        setIsEvaluating(true);
        setEvaluationResult(null);

        try {
            const { data, error } = await supabase.functions.invoke('evaluate-agent', {
                body: {
                    agent_name: agent.name,
                    metrics: {
                        resolved_tickets: agent.resolved_tickets,
                        avg_response_time_min: agent.avg_response_time_min,
                        avg_quality: agent.avg_quality
                    }
                }
            });

            if (error) throw error;
            setEvaluationResult(data.evaluation);
        } catch (error) {
            console.error('Error evaluating agent:', error);
            toast.error("Erro ao realizar avaliação. Tente novamente.");
            setSelectedAgent(null);
        } finally {
            setIsEvaluating(false);
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="h-32 bg-muted/20 rounded-2xl animate-pulse" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-48 bg-muted/20 rounded-2xl animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    if (!team || team.length === 0) {
        return (
            <div className="rounded-2xl bg-card/50 backdrop-blur-sm border border-border/50 p-12 text-center">
                <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">Nenhum agente encontrado</p>
            </div>
        );
    }

    // Ordenar por tickets resolvidos para ranking
    const sortedTeam = [...team].sort((a, b) => (b.resolved_tickets || 0) - (a.resolved_tickets || 0));

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-bold tracking-tight">Desempenho da Equipe</h2>

            {/* Summary Card */}
            <TeamSummaryCard team={team} />

            {/* Agent Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {sortedTeam.map((agent: any, index: number) => (
                    <AgentCard
                        key={agent.user_id}
                        agent={agent}
                        rank={index + 1}
                        onEvaluate={handleEvaluate}
                    />
                ))}
            </div>

            {/* Evaluation Dialog */}
            <Dialog open={!!selectedAgent} onOpenChange={(open) => !open && setSelectedAgent(null)}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-yellow-500" />
                            Avaliação de Desempenho: {selectedAgent?.name}
                        </DialogTitle>
                        <DialogDescription>
                            Análise gerada por IA com base nas métricas atuais.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="mt-4">
                        {isEvaluating ? (
                            <div className="flex flex-col items-center justify-center py-12 space-y-4">
                                <div className="relative">
                                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                                    <Sparkles className="w-4 h-4 absolute -top-1 -right-1 text-yellow-500 animate-pulse" />
                                </div>
                                <p className="text-sm text-muted-foreground">Analisando métricas e gerando feedback...</p>
                            </div>
                        ) : (
                            <div className="prose prose-sm dark:prose-invert max-w-none bg-gradient-to-br from-muted/30 to-muted/10 p-6 rounded-xl border border-border/50">
                                <p className="whitespace-pre-line leading-relaxed">
                                    {evaluationResult}
                                </p>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};
