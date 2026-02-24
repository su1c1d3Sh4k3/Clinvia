import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Users, Briefcase } from "lucide-react";
import { useSalesByAgent, useSalesByProfessional } from "@/hooks/useSales";

interface SalesByPersonTablesProps {
    month: number;
    year: number;
}

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

export function SalesByPersonTables({ month, year }: SalesByPersonTablesProps) {
    const { data: agentData = [], isLoading: loadingAgents } = useSalesByAgent(month, year);
    const { data: profData = [], isLoading: loadingProfs } = useSalesByProfessional(month, year);

    const isLoading = loadingAgents || loadingProfs;

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Skeleton className="h-64" />
                <Skeleton className="h-64" />
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Faturamento por Atendente */}
            <Card className="relative group overflow-hidden rounded-2xl bg-background/80 backdrop-blur-xl border-border/50 shadow-sm hover:shadow-md hover:border-border/80 transition-all duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-background/5 rounded-2xl opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none blur-xl" />
                <div className="relative z-10">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Users className="w-5 h-5 text-blue-500" />
                            Faturamento por Atendente
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {agentData.length === 0 ? (
                            <p className="text-center text-muted-foreground py-8">
                                Nenhuma venda por atendente neste período
                            </p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="text-[#005AA8] dark:text-muted-foreground">Atendente</TableHead>
                                        <TableHead className="text-[#005AA8] dark:text-muted-foreground">Faturado</TableHead>
                                        <TableHead className="text-[#005AA8] dark:text-muted-foreground">Qtd</TableHead>
                                        <TableHead className="text-[#005AA8] dark:text-muted-foreground">Top Produto</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {agentData.map((agent) => (
                                        <TableRow key={agent.id}>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="h-8 w-8">
                                                        <AvatarImage src={agent.photo} />
                                                        <AvatarFallback className="text-xs">
                                                            {agent.name?.[0]?.toUpperCase() || 'A'}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <span className="font-medium truncate max-w-[120px]">
                                                        {agent.name}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-green-500 font-semibold">
                                                {formatCurrency(agent.total_revenue)}
                                            </TableCell>
                                            <TableCell>{agent.quantity_sold}</TableCell>
                                            <TableCell className="truncate max-w-[100px]">
                                                {agent.top_product || '-'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </div>
            </Card>

            {/* Faturamento por Profissional */}
            <Card className="relative group overflow-hidden rounded-2xl bg-background/80 backdrop-blur-xl border-border/50 shadow-sm hover:shadow-md hover:border-border/80 transition-all duration-300">
                <div className="absolute inset-0 bg-gradient-to-bl from-purple-500/5 via-transparent to-background/5 rounded-2xl opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none blur-xl" />
                <div className="relative z-10">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Briefcase className="w-5 h-5 text-purple-500" />
                            Faturamento por Profissional
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {profData.length === 0 ? (
                            <p className="text-center text-muted-foreground py-8">
                                Nenhuma venda por profissional neste período
                            </p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="text-[#005AA8] dark:text-muted-foreground">Profissional</TableHead>
                                        <TableHead className="text-[#005AA8] dark:text-muted-foreground">Faturado</TableHead>
                                        <TableHead className="text-[#005AA8] dark:text-muted-foreground">Qtd</TableHead>
                                        <TableHead className="text-[#005AA8] dark:text-muted-foreground">Top Produto</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {profData.map((prof) => (
                                        <TableRow key={prof.id}>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="h-8 w-8">
                                                        <AvatarImage src={prof.photo} />
                                                        <AvatarFallback className="text-xs">
                                                            {prof.name?.[0]?.toUpperCase() || 'P'}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <span className="font-medium truncate max-w-[120px]">
                                                        {prof.name}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-green-500 font-semibold">
                                                {formatCurrency(prof.total_revenue)}
                                            </TableCell>
                                            <TableCell>{prof.quantity_sold}</TableCell>
                                            <TableCell className="truncate max-w-[100px]">
                                                {prof.top_product || '-'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </div>
            </Card>
        </div>
    );
}
