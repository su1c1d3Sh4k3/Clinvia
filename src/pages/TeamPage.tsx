import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, ShieldCheck, Loader2, Stethoscope, DoorOpen } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { usePermissions } from "@/hooks/usePermissions";
import { TeamSettings } from "@/components/settings/TeamSettings";
import { PermissionsSettings } from "@/components/settings/PermissionsSettings";
import { ProfissionaisTab } from "@/components/team/ProfissionaisTab";
import { SalasTab } from "@/components/team/SalasTab";
import { useUrlTab } from "@/hooks/useUrlTab";
import { useSuporteTour } from "@/lib/suporteTours";

export default function TeamPage() {
    // isPending (not isLoading): while `user` hydrates the query is disabled and
    // isLoading stays false — redirecting then would bounce admins to "/".
    const { data: userRole, isPending } = useUserRole();
    const { hasAnyAccess, isReady } = usePermissions();
    const [tab, setTab] = useUrlTab("team");
    const isAdmin = userRole === "admin";
    useSuporteTour(!isPending);

    if (isPending || (!isAdmin && !isReady)) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // Admin sempre acessa; supervisor/agent precisam da permissão de Membros da Equipe
    if (!isAdmin && !hasAnyAccess("team_members")) {
        return <Navigate to="/" replace />;
    }

    // A aba Permissões continua exclusiva do admin (evita auto-escalação de privilégios)
    const activeTab = !isAdmin && tab === "permissions" ? "team" : tab;

    return (
        // max-w-5xl (64rem) + 20% p/ cada lado = 89.6rem
        <div className="container mx-auto py-4 md:py-10 px-3 md:px-6 max-w-[89.6rem] animate-in fade-in duration-500">
            <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-8 text-foreground">Equipe</h1>

            <Tabs value={activeTab} onValueChange={setTab} className="w-full">
                <TabsList data-tour="equipe-tabs" className="flex w-full justify-between mb-4 md:mb-8 h-auto">
                    <TabsTrigger value="team" className="flex-1 flex items-center justify-center gap-1 md:gap-2 py-2 md:py-2.5 text-xs md:text-sm">
                        <Users className="h-4 w-4" />
                        <span className="hidden sm:inline">Equipe Comercial</span>
                        <span className="sm:hidden">Equipe</span>
                    </TabsTrigger>
                    <TabsTrigger value="profissionais" className="flex-1 flex items-center justify-center gap-1 md:gap-2 py-2 md:py-2.5 text-xs md:text-sm">
                        <Stethoscope className="h-4 w-4" />
                        <span className="hidden sm:inline">Profissionais</span>
                        <span className="sm:hidden">Prof.</span>
                    </TabsTrigger>
                    <TabsTrigger value="salas" className="flex-1 flex items-center justify-center gap-1 md:gap-2 py-2 md:py-2.5 text-xs md:text-sm">
                        <DoorOpen className="h-4 w-4" />
                        Salas
                    </TabsTrigger>
                    {isAdmin && (
                        <TabsTrigger value="permissions" className="flex-1 flex items-center justify-center gap-1 md:gap-2 py-2 md:py-2.5 text-xs md:text-sm">
                            <ShieldCheck className="h-4 w-4" />
                            Permissões
                        </TabsTrigger>
                    )}
                </TabsList>

                <TabsContent value="team">
                    <TeamSettings />
                </TabsContent>

                <TabsContent value="profissionais">
                    <Card>
                        <CardHeader className="p-4 md:p-6">
                            <CardTitle className="text-base md:text-lg flex items-center gap-2">
                                <Stethoscope className="h-5 w-5 text-primary" />
                                Profissionais
                            </CardTitle>
                            <CardDescription className="text-xs md:text-sm">
                                Cadastre quem atende na clínica. A sala de cada profissional é criada automaticamente
                                com o mesmo nome e a agenda definida aqui.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 md:p-6 pt-0">
                            <ProfissionaisTab />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="salas">
                    <Card>
                        <CardHeader className="p-4 md:p-6">
                            <CardTitle className="text-base md:text-lg flex items-center gap-2">
                                <DoorOpen className="h-5 w-5 text-primary" />
                                Salas
                            </CardTitle>
                            <CardDescription className="text-xs md:text-sm">
                                Cada sala é uma agenda. Os agendamentos são sempre feitos em uma sala — as de
                                profissional pertencem a ele, as avulsas atendem quem estiver disponível.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 md:p-6 pt-0">
                            <SalasTab />
                        </CardContent>
                    </Card>
                </TabsContent>

                {isAdmin && (
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
                )}
            </Tabs>
        </div>
    );
}
