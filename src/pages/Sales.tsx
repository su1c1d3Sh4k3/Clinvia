import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { FileText, ShoppingCart } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { useFinancialAccess } from "@/hooks/useFinancialAccess";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

import { SalesCards } from "@/components/sales/SalesCards";
import { SalesCharts } from "@/components/sales/SalesCharts";
import { SalesTable } from "@/components/sales/SalesTable";
import { SalesByPersonTables } from "@/components/sales/SalesByPersonTables";
import { SalesReportsModal } from "@/components/sales/SalesReportsModal";

const MONTHS = [
    { value: 1, label: "Janeiro" },
    { value: 2, label: "Fevereiro" },
    { value: 3, label: "Março" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Maio" },
    { value: 6, label: "Junho" },
    { value: 7, label: "Julho" },
    { value: 8, label: "Agosto" },
    { value: 9, label: "Setembro" },
    { value: 10, label: "Outubro" },
    { value: 11, label: "Novembro" },
    { value: 12, label: "Dezembro" },
];

// Anos disponíveis a partir de 2026
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => 2026 + i).filter(y => y <= currentYear + 1);

const Sales = () => {
    const navigate = useNavigate();
    const { data: userRole, isLoading: roleLoading } = useUserRole();
    const { data: financialAccess, isLoading: accessLoading } = useFinancialAccess();

    // Período selecionado
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    // Modal de relatórios
    const [reportsModalOpen, setReportsModalOpen] = useState(false);

    // Controle de acesso - mesma lógica do Financeiro
    useEffect(() => {
        if (!roleLoading && !accessLoading) {
            // Agents não têm acesso
            if (userRole === "agent") {
                navigate("/");
                return;
            }
            // Supervisors precisam de permissão
            if (userRole === "supervisor" && financialAccess === false) {
                navigate("/");
                return;
            }
        }
    }, [userRole, financialAccess, roleLoading, accessLoading, navigate]);

    // Loading enquanto verifica permissões
    if (roleLoading || accessLoading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
        );
    }

    // Não renderiza se não tiver acesso
    if (userRole === "agent" || (userRole === "supervisor" && financialAccess === false)) {
        return null;
    }

    return (
        <div className="flex-1 p-4 md:p-6 space-y-6 overflow-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                        <ShoppingCart className="w-7 h-7 md:w-8 md:h-8 text-primary" />
                        Vendas
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Gerenciamento de vendas e faturamento
                    </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    {/* Seletor de Mês */}
                    <Select
                        value={String(selectedMonth)}
                        onValueChange={(value) => setSelectedMonth(parseInt(value))}
                    >
                        <SelectTrigger className="w-[140px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {MONTHS.map((month) => (
                                <SelectItem key={month.value} value={String(month.value)}>
                                    {month.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Seletor de Ano */}
                    <Select
                        value={String(selectedYear)}
                        onValueChange={(value) => setSelectedYear(parseInt(value))}
                    >
                        <SelectTrigger className="w-[100px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {YEARS.map((year) => (
                                <SelectItem key={year} value={String(year)}>
                                    {year}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Botão de Relatório */}
                    <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => setReportsModalOpen(true)}
                    >
                        <FileText className="w-4 h-4" />
                        <span className="hidden sm:inline">Relatório</span>
                    </Button>
                </div>
            </div>

            {/* Cards de Resumo */}
            <SalesCards month={selectedMonth} year={selectedYear} />

            {/* Gráficos */}
            <SalesCharts month={selectedMonth} year={selectedYear} />

            {/* Tabela de Vendas */}
            <SalesTable month={selectedMonth} year={selectedYear} />

            {/* Faturamento por Pessoa */}
            <SalesByPersonTables month={selectedMonth} year={selectedYear} />

            {/* Modal de Relatórios */}
            <SalesReportsModal
                open={reportsModalOpen}
                onOpenChange={setReportsModalOpen}
            />
        </div>
    );
};

export default Sales;
