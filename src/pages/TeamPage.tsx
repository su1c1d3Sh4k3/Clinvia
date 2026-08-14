import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, ShieldCheck, Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { TeamSettings } from "@/components/settings/TeamSettings";
import { PermissionsSettings } from "@/components/settings/PermissionsSettings";
import { useUrlTab } from "@/hooks/useUrlTab";

export default function TeamPage() {
    // isPending (not isLoading): while `user` hydrates the query is disabled and
    // isLoading stays false — redirecting then would bounce admins to "/".
    const { data: userRole, isPending } = useUserRole();
    const [tab, setTab] = useUrlTab("team");

    if (isPending) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (userRole !== "admin") {
        return <Navigate to="/" replace />;
    }

    return (
        <div className="container mx-auto py-4 md:py-10 px-3 md:px-6 max-w-5xl animate-in fade-in duration-500">
            <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-8 text-foreground">Equipe</h1>

            <Tabs value={tab} onValueChange={setTab} className="w-full">
                <TabsList className="flex w-full justify-between mb-4 md:mb-8 h-auto">
                    <TabsTrigger value="team" className="flex-1 flex items-center justify-center gap-1 md:gap-2 py-2 md:py-2.5 text-xs md:text-sm">
                        <Users className="h-4 w-4" />
                        Equipes
                    </TabsTrigger>
                    <TabsTrigger value="permissions" className="flex-1 flex items-center justify-center gap-1 md:gap-2 py-2 md:py-2.5 text-xs md:text-sm">
                        <ShieldCheck className="h-4 w-4" />
                        Permissões
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="team">
                    <TeamSettings />
                </TabsContent>

                <TabsContent value="permissions">
                    <Card>
                        <CardHeader className="p-4 md:p-6">
                            <CardTitle className="text-base md:text-lg flex items-center gap-2">
                                <ShieldCheck className="h-5 w-5 text-primary" />
                                Permissões por Nível de Privilégio do Usuário
                            </CardTitle>
                            <CardDescription className="text-xs md:text-sm">
                                Defina o que Supervisores e Agentes podem criar, editar ou deletar em cada módulo.
                                As conversas e regras de visibilidade de dados sempre seguem as regras padrão do sistema.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 md:p-6 pt-0">
                            <PermissionsSettings />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
