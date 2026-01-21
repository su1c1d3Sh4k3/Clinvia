// @ts-nocheck - RPC functions will be available after migration runs
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Search, LogOut, ShieldAlert, Users, Briefcase, Calendar, MessageSquare, UserCheck, UserX, Clock, Check, X, Phone, Instagram, MapPin, Mail, Coins, Eye } from "lucide-react";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TokenUsageCharts from "@/components/admin/TokenUsageCharts";
import OpenAITokenManager from "@/components/admin/OpenAITokenManager";
import { useExchangeRate } from "@/hooks/useExchangeRate";
import { useAdminImpersonate } from "@/hooks/useAdminImpersonate";

interface Profile {
    id: string;
    full_name: string | null;
    company_name: string | null;
    email: string | null;
    role: string | null;
    created_at: string | null;
    openai_token: string | null;
    openai_token_invalid: boolean | null;
    avatar_url: string | null;
}

interface TeamMember {
    id: string;
    name: string;
    role: string;
    email: string;
    phone: string | null;
    tokens_total: number | null;
    approximate_cost_total: number | null;
}

interface Professional {
    id: string;
    name: string;
    role: string | null;
    photo_url: string | null;
}

interface StatItem {
    status: string;
    count: number;
}

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

interface PendingProfile {
    id: string;
    full_name: string | null;
    company_name: string | null;
    email: string | null;
    phone: string | null;
    instagram: string | null;
    address: string | null;
    created_at: string | null;
}

const Admin = () => {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [searchTerm, setSearchTerm] = useState("");
    const [currentPage, setCurrentPage] = useState(0);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
    const [professionals, setProfessionals] = useState<Professional[]>([]);
    const [appointmentStats, setAppointmentStats] = useState<StatItem[]>([]);
    const [conversationStats, setConversationStats] = useState<StatItem[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [activeTab, setActiveTab] = useState<"ativos" | "pendentes" | "inativos">("ativos");
    const [pendingProfiles, setPendingProfiles] = useState<PendingProfile[]>([]);
    const [inactiveProfiles, setInactiveProfiles] = useState<PendingProfile[]>([]);
    const [loadingPending, setLoadingPending] = useState(false);
    const [loadingInactive, setLoadingInactive] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [expandedProfileData, setExpandedProfileData] = useState<{ openai_token: string | null; openai_token_invalid: boolean } | null>(null);

    const { convertToReal } = useExchangeRate();
    const { impersonate, isLoading: impersonateLoading } = useAdminImpersonate();

    const ITEMS_PER_PAGE = 10;

    // Check auth on mount
    useEffect(() => {
        const checkAuth = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                navigate("/admin-oath");
                return;
            }

            const { data: profile } = await supabase
                .from("profiles")
                .select("role")
                .eq("id", user.id)
                .single();

            if (profile?.role !== "super-admin") {
                toast.error("Acesso negado");
                await supabase.auth.signOut();
                navigate("/admin-oath");
                return;
            }

            setIsLoading(false);
            fetchProfiles();
        };
        checkAuth();
    }, [navigate]);

    const fetchProfiles = async () => {
        try {
            const { data, error } = await (supabase.rpc as any)("admin_get_all_profiles", {
                p_search: searchTerm,
                p_limit: ITEMS_PER_PAGE,
                p_offset: currentPage * ITEMS_PER_PAGE
            });

            if (error) throw error;

            if (data && Array.isArray(data) && data.length > 0) {
                // Fetch avatars using Edge Function (bypasses RLS)
                const profileIds = data.map((p: any) => p.id);
                let avatarMap: Record<string, string | null> = {};

                try {
                    const { data: avatarData } = await supabase.functions.invoke("admin-get-avatars", {
                        body: { profileIds }
                    });
                    if (avatarData?.success) {
                        avatarMap = avatarData.avatars || {};
                    }
                } catch (e) {
                    console.error("Error fetching avatars:", e);
                }

                const profilesWithAvatars = data.map((profile: any) => ({
                    ...profile,
                    avatar_url: avatarMap[profile.id] || null
                }));

                setProfiles(profilesWithAvatars as Profile[]);
                setTotalCount(Number((data as any)[0].total_count) || 0);
            } else {
                setProfiles([]);
                setTotalCount(0);
            }
        } catch (error: any) {
            toast.error("Erro ao carregar profiles: " + error.message);
        }
    };

    const fetchPendingProfiles = async () => {
        setLoadingPending(true);
        try {
            const { data, error } = await (supabase.rpc as any)("admin_get_pending_profiles");
            if (error) throw error;
            setPendingProfiles((data || []) as PendingProfile[]);
        } catch (error: any) {
            toast.error("Erro ao carregar pendentes: " + error.message);
        } finally {
            setLoadingPending(false);
        }
    };

    const fetchInactiveProfiles = async () => {
        setLoadingInactive(true);
        try {
            const { data, error } = await (supabase.rpc as any)("admin_get_inactive_profiles");
            if (error) throw error;
            setInactiveProfiles((data || []) as PendingProfile[]);
        } catch (error: any) {
            toast.error("Erro ao carregar inativos: " + error.message);
        } finally {
            setLoadingInactive(false);
        }
    };

    // Fetch based on active tab
    useEffect(() => {
        if (!isLoading) {
            if (activeTab === "pendentes") {
                fetchPendingProfiles();
            } else if (activeTab === "inativos") {
                fetchInactiveProfiles();
            }
        }
    }, [activeTab, isLoading]);

    const handleApproveClient = async (profileId: string) => {
        setActionLoading(profileId);
        try {
            const { data, error } = await supabase.functions.invoke("approve-client", {
                body: { profile_id: profileId, action: "approve" }
            });

            if (error) throw error;
            if (!data.success) throw new Error(data.error);

            toast.success("Cliente aprovado com sucesso!");
            fetchPendingProfiles();
        } catch (error: any) {
            toast.error("Erro ao aprovar: " + error.message);
        } finally {
            setActionLoading(null);
        }
    };

    const handleRejectClient = async (profileId: string) => {
        setActionLoading(profileId);
        try {
            const { data, error } = await supabase.functions.invoke("approve-client", {
                body: { profile_id: profileId, action: "reject" }
            });

            if (error) throw error;
            if (!data.success) throw new Error(data.error);

            toast.success("Cadastro rejeitado");
            fetchPendingProfiles();
            fetchInactiveProfiles();
        } catch (error: any) {
            toast.error("Erro ao rejeitar: " + error.message);
        } finally {
            setActionLoading(null);
        }
    };

    useEffect(() => {
        if (!isLoading) {
            fetchProfiles();
        }
    }, [currentPage, searchTerm, isLoading]);

    const handleExpand = async (profileId: string) => {
        if (expandedId === profileId) {
            setExpandedId(null);
            setExpandedProfileData(null);
            return;
        }

        setExpandedId(profileId);
        setLoadingDetails(true);
        setExpandedProfileData(null);

        try {
            // Fetch profile token data
            const { data: profileData } = await supabase
                .from("profiles")
                .select("openai_token, openai_token_invalid")
                .eq("id", profileId)
                .single();

            if (profileData) {
                setExpandedProfileData({
                    openai_token: profileData.openai_token,
                    openai_token_invalid: profileData.openai_token_invalid || false
                });
            }

            // Fetch team members with token data
            const { data: tmData } = await (supabase.rpc as any)("admin_get_team_members_with_tokens", {
                p_user_id: profileId
            });
            setTeamMembers((tmData || []) as TeamMember[]);

            // Fetch professionals
            const { data: profData } = await (supabase.rpc as any)("admin_get_professionals", {
                p_user_id: profileId
            });
            setProfessionals((profData || []) as Professional[]);

            // Fetch appointment stats
            const { data: aptData } = await (supabase.rpc as any)("admin_get_appointment_stats", {
                p_user_id: profileId
            });
            setAppointmentStats((aptData || []) as StatItem[]);

            // Fetch conversation stats
            const { data: convData } = await (supabase.rpc as any)("admin_get_conversation_stats", {
                p_user_id: profileId
            });
            setConversationStats((convData || []) as StatItem[]);
        } catch (error: any) {
            toast.error("Erro ao carregar detalhes: " + error.message);
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate("/admin-oath");
    };

    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-white">Carregando...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 text-white">
            {/* Header */}
            <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
                <div className="flex items-center gap-3">
                    <ShieldAlert className="w-8 h-8 text-red-500" />
                    <h1 className="text-xl font-bold">Painel Administrativo</h1>
                </div>
                <Button variant="outline" onClick={handleLogout} className="border-gray-600 text-gray-300 hover:bg-gray-700">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sair
                </Button>
            </header>

            {/* Main Content */}
            <main className="p-6 max-w-7xl mx-auto">
                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "ativos" | "pendentes" | "inativos")} className="w-full mb-6">
                    <TabsList className="grid w-full max-w-2xl mx-auto grid-cols-3 bg-gray-800 border border-gray-700">
                        <TabsTrigger value="ativos" className="flex items-center gap-2 data-[state=active]:bg-green-600 data-[state=active]:text-white">
                            <UserCheck className="h-4 w-4" />
                            <span className="hidden sm:inline">Clientes Ativos</span>
                            <span className="sm:hidden">Ativos</span>
                        </TabsTrigger>
                        <TabsTrigger value="pendentes" className="flex items-center gap-2 data-[state=active]:bg-yellow-600 data-[state=active]:text-white">
                            <Clock className="h-4 w-4" />
                            <span className="hidden sm:inline">Clientes Pendentes</span>
                            <span className="sm:hidden">Pendentes</span>
                        </TabsTrigger>
                        <TabsTrigger value="inativos" className="flex items-center gap-2 data-[state=active]:bg-red-600 data-[state=active]:text-white">
                            <UserX className="h-4 w-4" />
                            <span className="hidden sm:inline">Clientes Inativos</span>
                            <span className="sm:hidden">Inativos</span>
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                {/* Tab: Clientes Ativos */}
                {activeTab === "ativos" && (
                    <>
                        {/* Search and Pagination Info */}
                        <div className="flex flex-col md:flex-row gap-4 mb-6 items-center justify-between">
                            <div className="relative w-full md:w-96">
                                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
                                <Input
                                    placeholder="Buscar por nome, empresa ou email..."
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value);
                                        setCurrentPage(0);
                                    }}
                                    className="pl-9 bg-gray-800 border-gray-700 text-white"
                                />
                            </div>
                            <div className="text-gray-400 text-sm">
                                {totalCount} profiles encontrados | Página {currentPage + 1} de {totalPages || 1}
                            </div>
                        </div>

                        {/* Profiles List */}
                        <div className="space-y-4">
                            {profiles.map((profile) => (
                                <Card key={profile.id} className="bg-gray-800 border-gray-700">
                                    <CardHeader
                                        className="cursor-pointer hover:bg-gray-700/50 transition-colors"
                                        onClick={() => handleExpand(profile.id)}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <Avatar className="w-12 h-12">
                                                    <AvatarImage src={profile.avatar_url || undefined} />
                                                    <AvatarFallback className="bg-gray-600 text-white">
                                                        {profile.full_name?.[0] || "?"}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <CardTitle className="text-lg text-white">
                                                        {profile.full_name || "Sem nome"}
                                                    </CardTitle>
                                                    <p className="text-gray-400 text-sm">{profile.email}</p>
                                                    {profile.company_name && (
                                                        <p className="text-gray-500 text-xs">{profile.company_name}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {profile.role !== "super-admin" && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="border-orange-500/50 text-orange-400 hover:bg-orange-500/20 hover:text-orange-300"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            impersonate(profile.id);
                                                        }}
                                                        disabled={impersonateLoading}
                                                    >
                                                        <Eye className="w-4 h-4 mr-2" />
                                                        Acessar
                                                    </Button>
                                                )}
                                                {profile.role && (
                                                    <Badge variant={profile.role === "super-admin" ? "destructive" : "secondary"}>
                                                        {profile.role}
                                                    </Badge>
                                                )}
                                                {expandedId === profile.id ? (
                                                    <ChevronUp className="w-5 h-5 text-gray-400" />
                                                ) : (
                                                    <ChevronDown className="w-5 h-5 text-gray-400" />
                                                )}
                                            </div>
                                        </div>
                                    </CardHeader>

                                    {/* Expanded Content */}
                                    {expandedId === profile.id && (
                                        <CardContent className="border-t border-gray-700 pt-6">
                                            {loadingDetails ? (
                                                <div className="text-center py-8 text-gray-400">Carregando detalhes...</div>
                                            ) : (
                                                <div className="space-y-6">
                                                    {/* Token Usage Section */}
                                                    <div>
                                                        <h3 className="flex items-center gap-2 text-lg font-semibold mb-4 text-white">
                                                            <Coins className="w-5 h-5 text-purple-500" />
                                                            Consumo de Tokens
                                                        </h3>
                                                        <TokenUsageCharts profileId={profile.id} />
                                                    </div>

                                                    {/* OpenAI Token Manager */}
                                                    <OpenAITokenManager
                                                        profileId={profile.id}
                                                        currentToken={expandedProfileData?.openai_token || null}
                                                        tokenInvalid={expandedProfileData?.openai_token_invalid || false}
                                                        onTokenUpdated={() => handleExpand(profile.id)}
                                                    />

                                                    {/* Tables Row */}
                                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                        {/* Team Members */}
                                                        <div>
                                                            <h3 className="flex items-center gap-2 text-lg font-semibold mb-3 text-white">
                                                                <Users className="w-5 h-5 text-blue-500" />
                                                                Equipe ({teamMembers.length})
                                                            </h3>
                                                            {teamMembers.length > 0 ? (
                                                                <Table>
                                                                    <TableHeader>
                                                                        <TableRow className="border-gray-700">
                                                                            <TableHead className="text-gray-400">Nome</TableHead>
                                                                            <TableHead className="text-gray-400">Role</TableHead>
                                                                            <TableHead className="text-gray-400">Tokens</TableHead>
                                                                            <TableHead className="text-gray-400">Custo (R$)</TableHead>
                                                                        </TableRow>
                                                                    </TableHeader>
                                                                    <TableBody>
                                                                        {teamMembers.map((tm) => (
                                                                            <TableRow key={tm.id} className="border-gray-700">
                                                                                <TableCell className="text-white">{tm.name}</TableCell>
                                                                                <TableCell>
                                                                                    <Badge variant="outline" className="border-gray-600">{tm.role}</Badge>
                                                                                </TableCell>
                                                                                <TableCell className="text-purple-400 font-medium">
                                                                                    {(tm.tokens_total || 0).toLocaleString('pt-BR')}
                                                                                </TableCell>
                                                                                <TableCell className="text-green-400 font-medium">
                                                                                    {convertToReal(tm.approximate_cost_total || 0)}
                                                                                </TableCell>
                                                                            </TableRow>
                                                                        ))}
                                                                    </TableBody>
                                                                </Table>
                                                            ) : (
                                                                <p className="text-gray-500 text-sm">Nenhum membro de equipe</p>
                                                            )}
                                                        </div>

                                                        {/* Professionals */}
                                                        <div>
                                                            <h3 className="flex items-center gap-2 text-lg font-semibold mb-3 text-white">
                                                                <Briefcase className="w-5 h-5 text-green-500" />
                                                                Profissionais ({professionals.length})
                                                            </h3>
                                                            {professionals.length > 0 ? (
                                                                <Table>
                                                                    <TableHeader>
                                                                        <TableRow className="border-gray-700">
                                                                            <TableHead className="text-gray-400">Nome</TableHead>
                                                                            <TableHead className="text-gray-400">Cargo</TableHead>
                                                                        </TableRow>
                                                                    </TableHeader>
                                                                    <TableBody>
                                                                        {professionals.map((prof) => (
                                                                            <TableRow key={prof.id} className="border-gray-700">
                                                                                <TableCell className="flex items-center gap-2">
                                                                                    <Avatar className="w-8 h-8">
                                                                                        <AvatarImage src={prof.photo_url || ""} />
                                                                                        <AvatarFallback>{prof.name[0]}</AvatarFallback>
                                                                                    </Avatar>
                                                                                    <span className="text-white">{prof.name}</span>
                                                                                </TableCell>
                                                                                <TableCell className="text-gray-400">{prof.role || "-"}</TableCell>
                                                                            </TableRow>
                                                                        ))}
                                                                    </TableBody>
                                                                </Table>
                                                            ) : (
                                                                <p className="text-gray-500 text-sm">Nenhum profissional</p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Charts Row */}
                                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                        {/* Appointments Chart */}
                                                        <div className="bg-gray-900 rounded-lg p-4">
                                                            <h3 className="flex items-center gap-2 text-lg font-semibold mb-3 text-white">
                                                                <Calendar className="w-5 h-5 text-orange-500" />
                                                                Agendamentos por Status
                                                            </h3>
                                                            {appointmentStats.length > 0 ? (
                                                                <ResponsiveContainer width="100%" height={280}>
                                                                    <PieChart>
                                                                        <Pie
                                                                            data={appointmentStats}
                                                                            dataKey="count"
                                                                            nameKey="status"
                                                                            cx="50%"
                                                                            cy="50%"
                                                                            outerRadius={70}
                                                                            label={({ name, value }) => `${name}: ${value}`}
                                                                        >
                                                                            {appointmentStats.map((_, index) => (
                                                                                <Cell key={index} fill={COLORS[index % COLORS.length]} />
                                                                            ))}
                                                                        </Pie>
                                                                        <Tooltip />
                                                                        <Legend />
                                                                    </PieChart>
                                                                </ResponsiveContainer>
                                                            ) : (
                                                                <p className="text-gray-500 text-sm text-center py-8">Sem agendamentos</p>
                                                            )}
                                                        </div>

                                                        {/* Conversations Chart */}
                                                        <div className="bg-gray-900 rounded-lg p-4">
                                                            <h3 className="flex items-center gap-2 text-lg font-semibold mb-3 text-white">
                                                                <MessageSquare className="w-5 h-5 text-purple-500" />
                                                                Tickets por Status
                                                            </h3>
                                                            {conversationStats.length > 0 ? (
                                                                <ResponsiveContainer width="100%" height={280}>
                                                                    <PieChart>
                                                                        <Pie
                                                                            data={conversationStats}
                                                                            dataKey="count"
                                                                            nameKey="status"
                                                                            cx="50%"
                                                                            cy="50%"
                                                                            outerRadius={70}
                                                                            label={({ name, value }) => `${name}: ${value}`}
                                                                        >
                                                                            {conversationStats.map((_, index) => (
                                                                                <Cell key={index} fill={COLORS[index % COLORS.length]} />
                                                                            ))}
                                                                        </Pie>
                                                                        <Tooltip />
                                                                        <Legend />
                                                                    </PieChart>
                                                                </ResponsiveContainer>
                                                            ) : (
                                                                <p className="text-gray-500 text-sm text-center py-8">Sem tickets</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </CardContent>
                                    )}
                                </Card>
                            ))}

                            {profiles.length === 0 && (
                                <div className="text-center py-12 text-gray-500">
                                    Nenhum profile encontrado
                                </div>
                            )}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex justify-center gap-4 mt-6">
                                <Button
                                    variant="outline"
                                    onClick={() => setCurrentPage(p => p - 1)}
                                    disabled={currentPage === 0}
                                    className="border-gray-600 text-gray-300 hover:bg-gray-700"
                                >
                                    Anterior
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => setCurrentPage(p => p + 1)}
                                    disabled={currentPage >= totalPages - 1}
                                    className="border-gray-600 text-gray-300 hover:bg-gray-700"
                                >
                                    Próxima
                                </Button>
                            </div>
                        )}
                    </>
                )}

                {/* Tab: Clientes Pendentes */}
                {activeTab === "pendentes" && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-yellow-400 flex items-center gap-2">
                            <Clock className="w-5 h-5" />
                            Cadastros Aguardando Aprovação ({pendingProfiles.length})
                        </h3>

                        {loadingPending ? (
                            <div className="text-center py-12 text-gray-400">Carregando...</div>
                        ) : pendingProfiles.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p>Nenhum cadastro pendente</p>
                            </div>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {pendingProfiles.map((profile) => (
                                    <Card key={profile.id} className="bg-gray-800 border-yellow-500/30">
                                        <CardHeader className="pb-3">
                                            <div className="flex items-center gap-3">
                                                <Avatar className="w-10 h-10">
                                                    <AvatarFallback className="bg-yellow-600 text-white">
                                                        {profile.full_name?.[0] || "?"}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <CardTitle className="text-base text-white">{profile.full_name || "Sem nome"}</CardTitle>
                                                    <p className="text-xs text-gray-400">{profile.company_name}</p>
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="space-y-2 text-sm">
                                            <div className="flex items-center gap-2 text-gray-300">
                                                <Mail className="w-4 h-4 text-gray-500" />
                                                {profile.email}
                                            </div>
                                            {profile.phone && (
                                                <div className="flex items-center gap-2 text-gray-300">
                                                    <Phone className="w-4 h-4 text-gray-500" />
                                                    {profile.phone}
                                                </div>
                                            )}
                                            {profile.instagram && (
                                                <div className="flex items-center gap-2 text-gray-300">
                                                    <Instagram className="w-4 h-4 text-gray-500" />
                                                    {profile.instagram}
                                                </div>
                                            )}
                                            {profile.address && (
                                                <div className="flex items-center gap-2 text-gray-300">
                                                    <MapPin className="w-4 h-4 text-gray-500" />
                                                    <span className="truncate">{profile.address}</span>
                                                </div>
                                            )}
                                            <div className="flex gap-2 pt-3">
                                                <Button
                                                    size="sm"
                                                    className="flex-1 bg-green-600 hover:bg-green-700"
                                                    onClick={() => handleApproveClient(profile.id)}
                                                    disabled={actionLoading === profile.id}
                                                >
                                                    {actionLoading === profile.id ? "..." : (
                                                        <><Check className="w-4 h-4 mr-1" /> Aprovar</>
                                                    )}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    className="flex-1"
                                                    onClick={() => handleRejectClient(profile.id)}
                                                    disabled={actionLoading === profile.id}
                                                >
                                                    {actionLoading === profile.id ? "..." : (
                                                        <><X className="w-4 h-4 mr-1" /> Rejeitar</>
                                                    )}
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Tab: Clientes Inativos */}
                {activeTab === "inativos" && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-red-400 flex items-center gap-2">
                            <UserX className="w-5 h-5" />
                            Clientes Inativos/Rejeitados ({inactiveProfiles.length})
                        </h3>

                        {loadingInactive ? (
                            <div className="text-center py-12 text-gray-400">Carregando...</div>
                        ) : inactiveProfiles.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                <UserX className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p>Nenhum cliente inativo</p>
                            </div>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {inactiveProfiles.map((profile) => (
                                    <Card key={profile.id} className="bg-gray-800 border-red-500/30 opacity-75">
                                        <CardHeader className="pb-3">
                                            <div className="flex items-center gap-3">
                                                <Avatar className="w-10 h-10">
                                                    <AvatarFallback className="bg-red-600 text-white">
                                                        {profile.full_name?.[0] || "?"}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <CardTitle className="text-base text-white">{profile.full_name || "Sem nome"}</CardTitle>
                                                    <p className="text-xs text-gray-400">{profile.company_name}</p>
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="space-y-2 text-sm">
                                            <div className="flex items-center gap-2 text-gray-400">
                                                <Mail className="w-4 h-4 text-gray-500" />
                                                {profile.email}
                                            </div>
                                            {profile.phone && (
                                                <div className="flex items-center gap-2 text-gray-400">
                                                    <Phone className="w-4 h-4 text-gray-500" />
                                                    {profile.phone}
                                                </div>
                                            )}
                                            <Badge variant="destructive" className="mt-2">Rejeitado/Inativo</Badge>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
};

export default Admin;
