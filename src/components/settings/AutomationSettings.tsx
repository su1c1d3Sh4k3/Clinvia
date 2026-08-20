import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap, Repeat } from "lucide-react";
import { InstancePrimarySelector } from "./InstancePrimarySelector";

export function AutomationSettings() {
    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="p-4 md:p-6">
                    <CardTitle className="text-base md:text-lg flex items-center gap-2">
                        <Zap className="h-5 w-5 text-primary" />
                        Envios Automáticos
                    </CardTitle>
                    <CardDescription className="text-xs md:text-sm">
                        Escolha qual instância o sistema usa para as mensagens automáticas de agendamento
                        (confirmação 24h antes, lembrete 2h antes e pesquisa de feedback). Por padrão, a
                        prioridade é sempre da API Oficial (Meta). Na API Oficial, as mensagens só são
                        enviadas após a aprovação dos templates pela Meta.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-4 md:p-6 pt-0">
                    <InstancePrimarySelector
                        flagColumn="is_automation_primary"
                        successMessage="Preferência de envios automáticos atualizada"
                        idPrefix="auto"
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="p-4 md:p-6">
                    <CardTitle className="text-base md:text-lg flex items-center gap-2">
                        <Repeat className="h-5 w-5 text-primary" />
                        Recorrência
                    </CardTitle>
                    <CardDescription className="text-xs md:text-sm">
                        Escolha qual instância dispara as campanhas diárias de recorrência (mensagens 1, 2
                        e 3 configuradas nos serviços). Por padrão, a prioridade é da API Oficial (Meta) e,
                        entre várias, da instância mais antiga. Na API Oficial, os disparos só acontecem
                        após a aprovação dos templates pela Meta.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-4 md:p-6 pt-0">
                    <InstancePrimarySelector
                        flagColumn="is_recurrence_primary"
                        successMessage="Instância de recorrência atualizada"
                        idPrefix="rec"
                    />
                </CardContent>
            </Card>
        </div>
    );
}
