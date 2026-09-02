import { useState } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { TrendingUp } from "lucide-react";
import { ClientProfileModal } from "@/components/contacts/ClientProfileModal";
import { SalesCards } from "@/components/sales/SalesCards";
import { SalesCharts } from "@/components/sales/SalesCharts";
import { SalesByPersonTables } from "@/components/sales/SalesByPersonTables";
import { TopSellersTable } from "@/components/sales/TopSellersTable";
import { VendasTable } from "./VendasTable";

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

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

export function VendasTab() {
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [year, setYear] = useState(new Date().getFullYear());
    const [selectedContact, setSelectedContact] = useState<{ id: string; push_name: string } | null>(null);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-wrap items-center justify-between gap-4" data-tour="financeiro-vendas-periodo">
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                    <span className="text-sm font-medium text-muted-foreground">Período:</span>
                </div>
                <div className="flex items-center gap-3">
                    <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
                        <SelectTrigger className="w-[140px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {MONTHS.map((m) => (
                                <SelectItem key={m.value} value={String(m.value)}>
                                    {m.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}>
                        <SelectTrigger className="w-[100px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {YEARS.map((y) => (
                                <SelectItem key={y} value={String(y)}>
                                    {y}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <SalesCards month={month} year={year} />

            <SalesCharts month={month} year={year} />

            <div data-tour="financeiro-vendas-tabela">
                <VendasTable onOpenContact={setSelectedContact} />
            </div>

            <TopSellersTable month={month} year={year} />

            <div data-tour="financeiro-faturamento">
                <SalesByPersonTables month={month} year={year} />
            </div>

            <ClientProfileModal
                open={!!selectedContact}
                onOpenChange={(open) => !open && setSelectedContact(null)}
                contact={selectedContact}
                defaultTab="vendas"
            />
        </div>
    );
}
