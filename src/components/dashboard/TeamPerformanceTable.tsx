import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Loader2, Sparkles, Clock, CheckCircle2, AlertCircle, Users, Award } from "lucide-react";
import { toast } from "sonner";

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
            <div className="rounded-2xl bg-white dark:bg-card/50 backdrop-blur-sm border border-border/50 p-12 text-center">
                <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">Nenhum agente encontrado</p>
            </div>
        );
    }

    // Ordenar por tickets resolvidos para ranking
    const sortedTeam = [...team].sort((a, b) => (b.resolved_tickets || 0) - (a.resolved_tickets || 0));

    // Calcular os maiores valores para as barras de progresso
    const maxResolved = Math.max(...sortedTeam.map(a => a.resolved_tickets || 0), 1);
    const maxTime = Math.max(...sortedTeam.map(a => a.avg_response_time_min || 0), 1);

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-bold tracking-tight">Leaderboard da Equipe</h2>

            {/* Tabela Analítica de Performance */}
            <div className="rounded-xl border bg-card text-card-foreground shadow overflow-hidden">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="w-16 text-center">Rank</TableHead>
                            <TableHead>Atendente</TableHead>
                            <TableHead className="w-[120px] text-center">Ativos (P/A)</TableHead>
                            <TableHead className="w-1/4">Resolvidos</TableHead>
                            <TableHead className="w-1/6">TMA (Média)</TableHead>
                            <TableHead className="text-center w-[120px]">Qualidade</TableHead>
                            <TableHead className="w-[100px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedTeam.map((agent: any, index: number) => {
                            const rank = index + 1;
                            const qualityColor = agent.avg_quality >= 8 ? 'text-green-500 bg-green-500/10' : agent.avg_quality >= 5 ? 'text-yellow-500 bg-yellow-500/10' : 'text-red-500 bg-red-500/10';

                            // Progresso percentual invertido para o tempo (menos tempo = barra maior e melhor cor)
                            const timePercent = Math.max(0, 100 - ((agent.avg_response_time_min || 0) / maxTime) * 100);

                            return (
                                <TableRow key={agent.user_id} className="group transition-colors hover:bg-muted/50">
                                    <TableCell className="text-center font-medium">
                                        {rank === 1 ? <Award className="w-5 h-5 mx-auto text-yellow-500" /> :
                                            rank === 2 ? <Award className="w-5 h-5 mx-auto text-gray-400" /> :
                                                rank === 3 ? <Award className="w-5 h-5 mx-auto text-amber-700" /> :
                                                    <span className="text-muted-foreground">{rank}</span>}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <Avatar className="w-9 h-9">
                                                <AvatarImage src={agent.avatar_url} />
                                                <AvatarFallback className="bg-primary/20 text-primary uppercase text-xs">
                                                    {agent.name?.substring(0, 2)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-sm">{agent.name}</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-center items-center gap-2 text-sm font-medium">
                                            <span className="text-yellow-500" title="Pendentes">{agent.pending_tickets}</span>
                                            <span className="text-muted-foreground/30">/</span>
                                            <span className="text-blue-500" title="Abertos">{agent.open_tickets}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <span className="w-8 font-semibold tabular-nums text-foreground/80">{agent.resolved_tickets}</span>
                                            <div className="flex-1 max-w-[120px]">
                                                <Progress value={((agent.resolved_tickets || 0) / maxResolved) * 100} className="h-1.5" />
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <span className="w-12 text-sm font-medium text-muted-foreground">{agent.avg_response_time_min}m</span>
                                            <div className="flex-1 max-w-[80px]">
                                                {/* Usando div simplificada pois a cor do Progress padrão é sempre primary */}
                                                <div className="h-1.5 w-full bg-muted overflow-hidden rounded-full">
                                                    <div className={`h-full ${timePercent > 66 ? 'bg-green-500' : timePercent > 33 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${Math.max(10, timePercent)}%` }} />
                                                </div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${qualityColor}`}>
                                            ★ {agent.avg_quality}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => onEvaluate(agent)}
                                            title="Avaliar Desempenho (IA)"
                                        >
                                            <Sparkles className="w-4 h-4 text-yellow-500" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
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
