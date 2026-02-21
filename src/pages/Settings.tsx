import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { User, Building2, Lock, Camera, Loader2, Bell, BellRing, Users, Volume2, DollarSign, Settings as SettingsIcon, Pen, Download, Smartphone, Monitor, CheckCircle2, Calendar, ListTodo, TrendingUp, Lightbulb, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { FaInstagram } from "react-icons/fa";
import { Switch } from "@/components/ui/switch";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentTeamMember } from "@/hooks/useStaff";
import { useInstallPWA } from "@/hooks/useInstallPWA";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";

export default function Settings() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const { data: userRole } = useUserRole();
    const { data: currentTeamMember } = useCurrentTeamMember();
    const [loading, setLoading] = useState(false);
    const [profile, setProfile] = useState<any>(null);
    const [fullName, setFullName] = useState("");
    const [companyName, setCompanyName] = useState("");
    const [avatarUrl, setAvatarUrl] = useState("");
    const [profilePicUrl, setProfilePicUrl] = useState("");
    const [uploading, setUploading] = useState(false);

    // New profile fields
    const [phone, setPhone] = useState("");
    const [address, setAddress] = useState("");
    const [profileEmail, setProfileEmail] = useState("");
    const [instagram, setInstagram] = useState("");

    // Security state
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [groupNotificationsEnabled, setGroupNotificationsEnabled] = useState(true);
    const [instagramNotificationsEnabled, setInstagramNotificationsEnabled] = useState(true);
    const [financialAccessEnabled, setFinancialAccessEnabled] = useState(true);
    const [signMessagesEnabled, setSignMessagesEnabled] = useState(true);

    // Delete account states
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);

    // PWA install hook
    const { isInstallable, isInstalled, isIOS, installApp, showIOSInstructions } = useInstallPWA();

    // Push notifications hook
    const { isSupported: pushSupported, isSubscribed: pushSubscribed, subscribe: subscribePush, loading: pushLoading } = usePushNotifications();

    // Push notification preferences (dashboard notifications)
    const [pushNotificationsOpen, setPushNotificationsOpen] = useState(false);
    const [pushPreferences, setPushPreferences] = useState({
        tasks: false,
        deals: false,
        appointments: false,
        financial: false,
        opportunities: false
    });

    // Carregar dados quando currentTeamMember estiver disponível
    useEffect(() => {
        if (user) {
            setEmail(user.email || "");
        }
    }, [user]);

    // Preencher campos quando currentTeamMember carregar
    useEffect(() => {
        if (currentTeamMember) {
            const tm = currentTeamMember as any;
            setProfile(tm);
            setFullName(tm.full_name || tm.name || "");
            setAvatarUrl(tm.avatar_url || "");
            setProfilePicUrl(tm.profile_pic_url || tm.avatar_url || "");
            setPhone(tm.phone || "");
            setAddress(tm.address || "");
            setProfileEmail(tm.email || "");
            setInstagram(tm.instagram || "");
            setNotificationsEnabled(tm.notifications_enabled ?? true);
            setGroupNotificationsEnabled(tm.group_notifications_enabled ?? true);
            setInstagramNotificationsEnabled(tm.instagram_notifications_enabled ?? true);
            setSignMessagesEnabled(tm.sign_messages ?? true);

            // Load push notification preferences
            if (tm.push_notification_preferences) {
                setPushPreferences({
                    tasks: tm.push_notification_preferences.tasks ?? false,
                    deals: tm.push_notification_preferences.deals ?? false,
                    appointments: tm.push_notification_preferences.appointments ?? false,
                    financial: tm.push_notification_preferences.financial ?? false,
                    opportunities: tm.push_notification_preferences.opportunities ?? false
                });
            }

            // Buscar company_name e financial_access de profiles (dados da empresa)
            fetchCompanySettings(tm.user_id);
            // fetchCompanyName(tm.user_id); // Replaced by fetchCompanySettings
        }
    }, [currentTeamMember]);

    const fetchCompanySettings = async (ownerId: string) => {
        const { data: profileData } = await supabase
            .from("profiles")
            .select("company_name, financial_access")
            .eq("id", ownerId)
            .single();

        if (profileData) {
            setCompanyName(profileData.company_name || "");
            setFinancialAccessEnabled(profileData.financial_access ?? true);
        }
    };


    const updateProfile = async () => {
        try {
            setLoading(true);

            // Todos os roles salvam suas configurações em team_members
            const updates = {
                name: fullName,
                full_name: fullName,
                avatar_url: avatarUrl,
                profile_pic_url: profilePicUrl || avatarUrl,
                phone,
                address,
                email: profileEmail,
                instagram,
                updated_at: new Date().toISOString(),
            };

            if (!user?.id) {
                toast.error("Erro: usuário não autenticado");
                setLoading(false);
                return;
            }

            const { error } = await supabase
                .from("team_members")
                .update(updates)
                .eq("auth_user_id", user.id);

            if (error) throw error;

            queryClient.invalidateQueries({ queryKey: ["current-team-member"] });
            toast.success("Perfil atualizado com sucesso!");
        } catch (error: any) {
            toast.error("Erro ao atualizar perfil");
            console.error("Error updating profile:", error.message);
        } finally {
            setLoading(false);
        }
    };

    const updateCompany = async () => {
        if (userRole !== 'admin') {
            toast.error("Você não tem permissão para alterar dados da empresa.");
            return;
        }

        try {
            setLoading(true);
            const updates = {
                id: user?.id,
                company_name: companyName,
                updated_at: new Date().toISOString(),
            };

            const { error } = await supabase.from("profiles").upsert(updates);

            if (error) throw error;
            toast.success("Informações da empresa atualizadas!");
        } catch (error: any) {
            toast.error("Erro ao atualizar empresa");
            console.error("Error updating company:", error.message);
        } finally {
            setLoading(false);
        }
    };

    const updateSecurity = async () => {
        try {
            setLoading(true);
            const attributes: any = {};

            if (email !== user?.email) {
                attributes.email = email;
            }

            if (password) {
                if (password !== confirmPassword) {
                    toast.error("As senhas não coincidem");
                    setLoading(false);
                    return;
                }
                attributes.password = password;
            }

            if (Object.keys(attributes).length === 0) {
                toast.info("Nenhuma alteração detectada");
                setLoading(false);
                return;
            }

            const { error } = await supabase.auth.updateUser(attributes);

            if (error) throw error;

            toast.success("Configurações de segurança atualizadas! Verifique seu email se alterou o endereço.");
            setPassword("");
            setConfirmPassword("");
        } catch (error: any) {
            toast.error("Erro ao atualizar segurança: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const updateNotifications = async () => {
        try {
            setLoading(true);
            const updates = {
                notifications_enabled: notificationsEnabled,
                group_notifications_enabled: groupNotificationsEnabled,
                instagram_notifications_enabled: instagramNotificationsEnabled,
                push_notification_preferences: pushPreferences,
                updated_at: new Date().toISOString(),
            };

            if (!user?.id) {
                toast.error("Erro: usuário não autenticado");
                setLoading(false);
                return;
            }

            const { error } = await supabase
                .from("team_members")
                .update(updates)
                .eq("auth_user_id", user.id);

            if (error) throw error;

            // Register for push notifications if any preference is enabled
            const hasPushPreference = notificationsEnabled ||
                pushPreferences.tasks ||
                pushPreferences.deals ||
                pushPreferences.appointments ||
                pushPreferences.financial ||
                pushPreferences.opportunities;

            if (hasPushPreference && pushSupported && !pushSubscribed) {
                console.log('[Settings] Registering for push notifications...');
                const subscribed = await subscribePush();
                if (subscribed) {
                    toast.success("Dispositivo registrado para notificações push!");
                } else {
                    console.warn('[Settings] Failed to subscribe to push notifications');
                }
            }

            queryClient.invalidateQueries({ queryKey: ["current-team-member"] });
            toast.success("Preferências de notificação atualizadas!");
        } catch (error: any) {
            toast.error("Erro ao atualizar notificações");
            console.error("Error updating notifications:", error.message);
        } finally {
            setLoading(false);
        }
    };

    const updateFinancialAccess = async (newValue: boolean) => {
        if (userRole !== 'admin') return;

        try {
            setLoading(true);
            setFinancialAccessEnabled(newValue); // Optimistic update

            const { error } = await supabase
                .from("profiles")
                .update({ financial_access: newValue, updated_at: new Date().toISOString() })
                .eq("id", user?.id);

            if (error) throw error;

            toast.success("Permissão de acesso financeiro atualizada!");
        } catch (error: any) {
            setFinancialAccessEnabled(!newValue); // Revert
            toast.error("Erro ao atualizar permissão financeira");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const updateSignMessages = async (newValue: boolean) => {
        try {
            setLoading(true);
            setSignMessagesEnabled(newValue); // Optimistic update

            if (!user?.id) {
                toast.error("Erro: usuário não autenticado");
                setLoading(false);
                return;
            }

            const { error } = await supabase
                .from("team_members")
                .update({ sign_messages: newValue, updated_at: new Date().toISOString() })
                .eq("auth_user_id", user.id);

            if (error) throw error;

            queryClient.invalidateQueries({ queryKey: ["current-team-member"] });
            toast.success(newValue ? "Assinatura de mensagens ativada!" : "Assinatura de mensagens desativada!");
        } catch (error: any) {
            setSignMessagesEnabled(!newValue); // Revert
            toast.error("Erro ao atualizar configuração");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const deleteAccount = async () => {
        try {
            setDeleteLoading(true);

            // Obter ID do usuário atual (admin)
            const currentUserId = user?.id;

            if (!currentUserId) {
                toast.error("Erro: usuário não identificado");
                return;
            }

            // Verificar se é admin
            if (userRole !== 'admin') {
                toast.error("Apenas administradores podem excluir a conta");
                return;
            }

            // Chamar Edge Function para deletar conta
            const { data, error } = await supabase.functions.invoke(
                "delete-admin-account",
                { body: { userId: currentUserId } }
            );

            if (error) {
                throw error;
            }

            if (data?.error) {
                throw new Error(data.error);
            }

            // Deslogar usuário
            await supabase.auth.signOut();

            toast.success("Conta excluída com sucesso");

            // Redirecionar para página de login
            navigate("/auth");

        } catch (error: any) {
            console.error("Erro ao deletar conta:", error);
            toast.error("Erro ao deletar conta: " + error.message);
        } finally {
            setDeleteLoading(false);
            setShowDeleteDialog(false);
        }
    };

    const playTestSound = () => {
        try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            const ctx = new AudioContext();
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            oscillator.type = "sine";
            oscillator.frequency.setValueAtTime(880, ctx.currentTime);
            gainNode.gain.setValueAtTime(0.1, ctx.currentTime);

            oscillator.start();
            gainNode.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.5);
            oscillator.stop(ctx.currentTime + 0.5);
        } catch (e) {
            console.error("Audio play failed", e);
        }
    };

    const testNotification = async () => {
        if (Notification.permission === 'granted') {
            new Notification("Teste de Notificação", {
                body: "Se você está vendo isso, as notificações estão funcionando!",
                icon: "/placeholder.png"
            });
            playTestSound();
            toast.success("Notificação de teste enviada!");
        } else {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                testNotification();
            } else {
                toast.error("Permissão de notificação negada.");
            }
        }
    };

    return (
        <div className="container mx-auto py-4 md:py-10 px-3 md:px-6 max-w-4xl animate-in fade-in duration-500">
            <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-8 text-foreground">Configurações do Sistema</h1>

            <Tabs defaultValue="profile" className="w-full">
                <TabsList className="grid w-full grid-cols-4 mb-4 md:mb-8 h-auto">
                    <TabsTrigger value="profile" className="flex items-center justify-center gap-1 md:gap-2 py-2 md:py-2.5 text-xs md:text-sm">
                        <User className="h-4 w-4" />
                        <span className="hidden md:inline">Perfil</span>
                    </TabsTrigger>
                    <TabsTrigger value="company" className="flex items-center justify-center gap-1 md:gap-2 py-2 md:py-2.5 text-xs md:text-sm">
                        <Building2 className="h-4 w-4" />
                        <span className="hidden md:inline">Empresa</span>
                    </TabsTrigger>
                    <TabsTrigger value="security" className="flex items-center justify-center gap-1 md:gap-2 py-2 md:py-2.5 text-xs md:text-sm">
                        <Lock className="h-4 w-4" />
                        <span className="hidden md:inline">Segurança</span>
                    </TabsTrigger>
                    <TabsTrigger value="notifications" className="flex items-center justify-center gap-1 md:gap-2 py-2 md:py-2.5 text-xs md:text-sm">
                        <SettingsIcon className="h-4 w-4" />
                        <span className="hidden md:inline">Sistema</span>
                    </TabsTrigger>
                </TabsList>

                {/* Profile Tab */}
                <TabsContent value="profile">
                    <Card>
                        <CardHeader className="p-4 md:p-6">
                            <CardTitle className="text-base md:text-lg">Perfil do Usuário</CardTitle>
                            <CardDescription className="text-xs md:text-sm">
                                Gerencie suas informações pessoais.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 md:p-6 pt-0 md:pt-0 space-y-4 md:space-y-6">
                            <div className="flex flex-col gap-6 md:gap-8 items-center md:items-start md:flex-row">
                                {/* Avatar */}
                                <div className="flex flex-col items-center gap-3 md:gap-4 md:min-w-[200px]">
                                    <Avatar className="h-24 w-24 md:h-32 md:w-32 border-4 border-background shadow-xl">
                                        <AvatarImage src={profilePicUrl || avatarUrl} />
                                        <AvatarFallback className="text-2xl md:text-4xl font-bold bg-primary/10 text-primary">
                                            {fullName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex items-center gap-2 w-full justify-center">
                                        <Label htmlFor="avatar-upload" className="cursor-pointer">
                                            <div className="flex items-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/90 h-8 md:h-9 px-3 md:px-4 py-1.5 md:py-2 rounded-md text-xs md:text-sm font-medium transition-colors">
                                                {uploading ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Camera className="h-4 w-4" />
                                                )}
                                                Alterar Foto
                                            </div>
                                            <Input
                                                id="avatar-upload"
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                disabled={uploading}
                                                onChange={async (event) => {
                                                    try {
                                                        setUploading(true);
                                                        if (!event.target.files || event.target.files.length === 0) {
                                                            throw new Error("Você deve selecionar uma imagem para fazer upload.");
                                                        }

                                                        const file = event.target.files[0];
                                                        const fileExt = file.name.split(".").pop();
                                                        const filePath = `${user?.id}-${Math.random()}.${fileExt}`;

                                                        const { error: uploadError } = await supabase.storage
                                                            .from("avatars")
                                                            .upload(filePath, file);

                                                        if (uploadError) {
                                                            throw uploadError;
                                                        }

                                                        const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
                                                        setAvatarUrl(data.publicUrl);
                                                        setProfilePicUrl(data.publicUrl);
                                                        toast.success("Imagem carregada com sucesso!");
                                                    } catch (error: any) {
                                                        toast.error("Erro ao fazer upload da imagem");
                                                        console.error("Error uploading avatar:", error.message);
                                                    } finally {
                                                        setUploading(false);
                                                    }
                                                }}
                                            />
                                        </Label>
                                    </div>
                                </div>

                                {/* Right Side - Data Grid */}
                                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                                    <div className="space-y-2">
                                        <Label htmlFor="fullName">Nome Completo</Label>
                                        <Input
                                            id="fullName"
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            placeholder="Seu nome completo"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="phone">Telefone</Label>
                                        <Input
                                            id="phone"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            placeholder="(00) 00000-0000"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="profileEmail">Email de Contato</Label>
                                        <Input
                                            id="profileEmail"
                                            type="email"
                                            value={profileEmail}
                                            onChange={(e) => setProfileEmail(e.target.value)}
                                            placeholder="contato@exemplo.com"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="instagram">Instagram</Label>
                                        <Input
                                            id="instagram"
                                            value={instagram}
                                            onChange={(e) => setInstagram(e.target.value)}
                                            placeholder="@usuario"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Address - Full Width Below */}
                            <div className="space-y-2">
                                <Label htmlFor="address">Endereço</Label>
                                <Input
                                    id="address"
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    placeholder="Seu endereço completo"
                                />
                            </div>

                            {/* Save Button */}
                            <div className="flex justify-end pt-4">
                                <Button onClick={updateProfile} disabled={loading}>
                                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Salvar Alterações
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Company Tab */}
                <TabsContent value="company">
                    <Card>
                        <CardHeader className="p-4 md:p-6">
                            <CardTitle className="text-base md:text-lg">Informações da Empresa</CardTitle>
                            <CardDescription className="text-xs md:text-sm">
                                Configure os dados da sua organização.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 md:p-6 pt-0 md:pt-0 space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="companyName">Nome da Empresa</Label>
                                <Input
                                    id="companyName"
                                    value={companyName}
                                    onChange={(e) => setCompanyName(e.target.value)}
                                    placeholder="Nome da sua empresa"
                                    disabled={userRole !== 'admin'}
                                />
                            </div>
                        </CardContent>
                        <CardFooter>
                            {userRole === 'admin' && (
                                <Button onClick={updateCompany} disabled={loading} className="ml-auto">
                                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Salvar Alterações
                                </Button>
                            )}
                        </CardFooter>
                    </Card>
                </TabsContent>

                {/* Security Tab */}
                <TabsContent value="security">
                    <Card>
                        <CardHeader className="p-4 md:p-6">
                            <CardTitle className="text-base md:text-lg">Segurança da Conta</CardTitle>
                            <CardDescription className="text-xs md:text-sm">
                                Atualize seu email e senha.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 md:p-6 pt-0 md:pt-0 space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="seu@email.com"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                                <div className="space-y-2">
                                    <Label htmlFor="password">Nova Senha</Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                                    <Input
                                        id="confirmPassword"
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button onClick={updateSecurity} disabled={loading} className="ml-auto">
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Atualizar Segurança
                            </Button>
                        </CardFooter>
                    </Card>
                </TabsContent>

                {/* Notifications Tab */}
                <TabsContent value="notifications">
                    <Card>
                        <CardHeader className="p-4 md:p-6">
                            <CardTitle className="text-base md:text-lg">Preferências de Notificação</CardTitle>
                            <CardDescription className="text-xs md:text-sm">
                                Personalize como você recebe alertas.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 md:p-6 pt-0 md:pt-0 space-y-3 md:space-y-6">
                            {/* Browser Notifications */}
                            <div className="flex items-center justify-between p-3 md:p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors gap-3">
                                <div className="flex items-center gap-3 md:gap-4">
                                    <div className="p-1.5 md:p-2 bg-primary/10 rounded-full">
                                        <BellRing className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                                    </div>
                                    <div className="space-y-0.5">
                                        <h4 className="font-medium text-sm md:text-base">Notificações</h4>
                                        <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
                                            Alertas visuais e sonoros.
                                        </p>
                                    </div>
                                </div>
                                <Switch
                                    checked={notificationsEnabled}
                                    onCheckedChange={setNotificationsEnabled}
                                />
                            </div>

                            {/* Group Notifications */}
                            <div className="flex items-center justify-between p-3 md:p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors gap-3">
                                <div className="flex items-center gap-3 md:gap-4">
                                    <div className="p-1.5 md:p-2 bg-primary/10 rounded-full">
                                        <Users className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                                    </div>
                                    <div className="space-y-0.5">
                                        <h4 className="font-medium text-sm md:text-base">Grupos</h4>
                                        <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
                                            Alertas para mensagens de grupos.
                                        </p>
                                    </div>
                                </div>
                                <Switch
                                    checked={groupNotificationsEnabled}
                                    onCheckedChange={setGroupNotificationsEnabled}
                                    disabled={!notificationsEnabled}
                                />
                            </div>

                            {/* Instagram Notifications */}
                            <div className="flex items-center justify-between p-3 md:p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors gap-3">
                                <div className="flex items-center gap-3 md:gap-4">
                                    <div className="p-1.5 md:p-2 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 rounded-full">
                                        <FaInstagram className="h-4 w-4 md:h-5 md:w-5 text-white" />
                                    </div>
                                    <div className="space-y-0.5">
                                        <h4 className="font-medium text-sm md:text-base">Instagram</h4>
                                        <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
                                            Alertas para mensagens do Instagram.
                                        </p>
                                    </div>
                                </div>
                                <Switch
                                    checked={instagramNotificationsEnabled}
                                    onCheckedChange={setInstagramNotificationsEnabled}
                                    disabled={!notificationsEnabled}
                                />
                            </div>

                            {/* Sign Messages */}
                            {userRole !== 'agent' && (
                                <div className="flex items-center justify-between p-3 md:p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors border-l-4 border-l-primary gap-3">
                                    <div className="flex items-center gap-3 md:gap-4">
                                        <div className="p-1.5 md:p-2 bg-primary/10 rounded-full">
                                            <Pen className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <h4 className="font-medium text-sm md:text-base">Assinar mensagens</h4>
                                            <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
                                                Seu nome será enviado com as mensagens.
                                            </p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={signMessagesEnabled}
                                        onCheckedChange={updateSignMessages}
                                        disabled={loading}
                                    />
                                </div>
                            )}

                            {/* Financial Access Control */}
                            {userRole === 'admin' && (
                                <div className="flex items-center justify-between p-3 md:p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors border-l-4 border-l-primary gap-3">
                                    <div className="flex items-center gap-3 md:gap-4">
                                        <div className="p-1.5 md:p-2 bg-primary/10 rounded-full">
                                            <DollarSign className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <h4 className="font-medium text-sm md:text-base">Acesso financeiro</h4>
                                            <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
                                                Supervisor visualiza dados financeiros.
                                            </p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={financialAccessEnabled}
                                        onCheckedChange={updateFinancialAccess}
                                        disabled={loading}
                                    />
                                </div>
                            )}

                            {/* Test Section */}
                            <div className="flex items-center justify-between p-3 md:p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors gap-3">
                                <div className="flex items-center gap-3 md:gap-4">
                                    <div className="p-1.5 md:p-2 bg-primary/10 rounded-full">
                                        <Volume2 className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                                    </div>
                                    <div className="space-y-0.5">
                                        <h4 className="font-medium text-sm md:text-base">Testar Alertas</h4>
                                        <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
                                            Verifique som e popups.
                                        </p>
                                    </div>
                                </div>
                                <Button variant="outline" size="sm" onClick={testNotification} className="text-xs md:text-sm h-8 px-2 md:px-3">
                                    Testar
                                </Button>
                            </div>

                            {/* Separator */}
                            <div className="border-t my-4" />

                            {/* Download App Section */}
                            <div className="flex items-center justify-between p-3 md:p-4 border rounded-lg bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20 gap-3">
                                <div className="flex items-center gap-3 md:gap-4">
                                    <div className="p-1.5 md:p-2 bg-primary/20 rounded-full">
                                        {isIOS ? <Smartphone className="h-4 w-4 md:h-5 md:w-5 text-primary" /> : <Monitor className="h-4 w-4 md:h-5 md:w-5 text-primary" />}
                                    </div>
                                    <div className="space-y-0.5">
                                        <h4 className="font-medium text-sm md:text-base">Baixar App</h4>
                                        <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
                                            {isInstalled ? "App já instalado!" : isIOS ? "Adicione à tela inicial" : "Instale para acesso rápido"}
                                        </p>
                                    </div>
                                </div>
                                {isInstalled ? (
                                    <div className="flex items-center gap-2 text-green-600">
                                        <CheckCircle2 className="h-4 w-4" />
                                        <span className="text-xs md:text-sm font-medium">Instalado</span>
                                    </div>
                                ) : showIOSInstructions ? (
                                    <Button variant="outline" size="sm" className="text-xs md:text-sm h-8 px-2 md:px-3" onClick={() => {
                                        toast.info("Para instalar no iOS: Toque no ícone de compartilhamento e selecione 'Adicionar à Tela de Início'");
                                    }}>
                                        <Smartphone className="h-4 w-4 mr-1" />
                                        Como instalar
                                    </Button>
                                ) : isInstallable ? (
                                    <Button size="sm" className="text-xs md:text-sm h-8 px-2 md:px-3" onClick={async () => {
                                        const result = await installApp();
                                        if (result.success) {
                                            toast.success("App instalado com sucesso!");
                                        } else if (result.outcome === 'dismissed') {
                                            toast.info("Instalação cancelada");
                                        }
                                    }}>
                                        <Download className="h-4 w-4 mr-1" />
                                        Instalar
                                    </Button>
                                ) : (
                                    <span className="text-xs text-muted-foreground">Não disponível</span>
                                )}
                            </div>

                            {/* Push Notifications Section - Collapsible */}
                            <Collapsible open={pushNotificationsOpen} onOpenChange={setPushNotificationsOpen}>
                                <CollapsibleTrigger asChild>
                                    <div className="flex items-center justify-between p-3 md:p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors cursor-pointer gap-3">
                                        <div className="flex items-center gap-3 md:gap-4">
                                            <div className="p-1.5 md:p-2 bg-primary/10 rounded-full">
                                                <Bell className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                                            </div>
                                            <div className="space-y-0.5">
                                                <h4 className="font-medium text-sm md:text-base">Notificações Push</h4>
                                                <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
                                                    Alertas mesmo com app fechado
                                                </p>
                                            </div>
                                        </div>
                                        {pushNotificationsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="mt-2 space-y-2 pl-4 border-l-2 border-primary/20 ml-4">
                                    {/* Tasks */}
                                    <div className="flex items-center justify-between p-2 md:p-3 border rounded-lg bg-card/50">
                                        <div className="flex items-center gap-2">
                                            <ListTodo className="h-4 w-4 text-indigo-500" />
                                            <span className="text-sm">Tarefas</span>
                                        </div>
                                        <Switch
                                            checked={pushPreferences.tasks}
                                            onCheckedChange={(v) => setPushPreferences(p => ({ ...p, tasks: v }))}
                                        />
                                    </div>
                                    {/* Deals */}
                                    <div className="flex items-center justify-between p-2 md:p-3 border rounded-lg bg-card/50">
                                        <div className="flex items-center gap-2">
                                            <TrendingUp className="h-4 w-4 text-green-500" />
                                            <span className="text-sm">CRM / Negócios</span>
                                        </div>
                                        <Switch
                                            checked={pushPreferences.deals}
                                            onCheckedChange={(v) => setPushPreferences(p => ({ ...p, deals: v }))}
                                        />
                                    </div>
                                    {/* Appointments */}
                                    <div className="flex items-center justify-between p-2 md:p-3 border rounded-lg bg-card/50">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="h-4 w-4 text-blue-500" />
                                            <span className="text-sm">Agendamentos</span>
                                        </div>
                                        <Switch
                                            checked={pushPreferences.appointments}
                                            onCheckedChange={(v) => setPushPreferences(p => ({ ...p, appointments: v }))}
                                        />
                                    </div>
                                    {/* Financial */}
                                    <div className="flex items-center justify-between p-2 md:p-3 border rounded-lg bg-card/50">
                                        <div className="flex items-center gap-2">
                                            <DollarSign className="h-4 w-4 text-emerald-500" />
                                            <span className="text-sm">Financeiro</span>
                                        </div>
                                        <Switch
                                            checked={pushPreferences.financial}
                                            onCheckedChange={(v) => setPushPreferences(p => ({ ...p, financial: v }))}
                                        />
                                    </div>
                                    {/* Opportunities */}
                                    <div className="flex items-center justify-between p-2 md:p-3 border rounded-lg bg-card/50">
                                        <div className="flex items-center gap-2">
                                            <Lightbulb className="h-4 w-4 text-purple-500" />
                                            <span className="text-sm">Oportunidades</span>
                                        </div>
                                        <Switch
                                            checked={pushPreferences.opportunities}
                                            onCheckedChange={(v) => setPushPreferences(p => ({ ...p, opportunities: v }))}
                                        />
                                    </div>
                                </CollapsibleContent>
                            </Collapsible>

                            {/* Register This Device Button */}
                            {pushSupported && (
                                <div className="flex items-center justify-between p-3 md:p-4 border rounded-lg bg-gradient-to-r from-green-500/10 to-emerald-500/5 border-green-500/20 gap-3">
                                    <div className="flex items-center gap-3 md:gap-4">
                                        <div className="p-1.5 md:p-2 bg-green-500/20 rounded-full">
                                            <Smartphone className="h-4 w-4 md:h-5 md:w-5 text-green-600" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <h4 className="font-medium text-sm md:text-base">Registrar Dispositivo</h4>
                                            <p className="text-xs md:text-sm text-muted-foreground">
                                                {pushSubscribed ? "Este dispositivo já está registrado" : "Ative notificações neste aparelho"}
                                            </p>
                                        </div>
                                    </div>
                                    {pushSubscribed ? (
                                        <div className="flex items-center gap-2 text-green-600">
                                            <CheckCircle2 className="h-4 w-4" />
                                            <span className="text-xs md:text-sm font-medium">Registrado</span>
                                        </div>
                                    ) : (
                                        <Button
                                            size="sm"
                                            className="text-xs md:text-sm h-8 px-3 bg-green-600 hover:bg-green-700"
                                            disabled={pushLoading}
                                            onClick={async () => {
                                                const result = await subscribePush();
                                                if (result) {
                                                    toast.success("Dispositivo registrado para notificações push!");
                                                } else {
                                                    toast.error("Falha ao registrar. Verifique as permissões do navegador.");
                                                }
                                            }}
                                        >
                                            {pushLoading ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <>
                                                    <Bell className="h-4 w-4 mr-1" />
                                                    Ativar
                                                </>
                                            )}
                                        </Button>
                                    )}
                                </div>
                            )}

                            {/* Separator */}
                            <div className="border-t my-4" />

                            {/* Delete Account Section - APENAS ADMIN */}
                            {userRole === 'admin' && (
                                <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                                    <AlertDialogTrigger asChild>
                                        <div className="flex items-center justify-between p-3 md:p-4 border-2 border-destructive/50 rounded-lg bg-destructive/5 hover:bg-destructive/10 transition-colors cursor-pointer gap-3">
                                            <div className="flex items-center gap-3 md:gap-4">
                                                <div className="p-1.5 md:p-2 bg-destructive/20 rounded-full">
                                                    <AlertCircle className="h-4 w-4 md:h-5 md:w-5 text-destructive" />
                                                </div>
                                                <div className="space-y-0.5">
                                                    <h4 className="font-medium text-sm md:text-base text-destructive">Excluir conta</h4>
                                                    <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
                                                        Deletar permanentemente todos os dados
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle className="text-destructive flex items-center gap-2">
                                                <AlertCircle className="h-5 w-5" />
                                                Confirmar Exclusão de Conta
                                            </AlertDialogTitle>
                                            <AlertDialogDescription className="text-base leading-relaxed pt-2">
                                                A exclusão deletará <strong className="text-foreground">TODOS</strong> os seus dados de forma <strong className="text-foreground">definitiva e irreversível</strong>, não sendo mais possível restaurá-los.
                                                <br /><br />
                                                Isso inclui:
                                                <ul className="list-disc list-inside mt-2 space-y-1">
                                                    <li>Todos os membros da equipe (supervisores e agentes)</li>
                                                    <li>Todas as conversas e mensagens</li>
                                                    <li>Todos os contatos</li>
                                                    <li>Todos os dados financeiros (receitas, despesas)</li>
                                                    <li>Todos os dados do CRM e agendamentos</li>
                                                </ul>
                                                <br />
                                                <strong className="text-destructive">Tem certeza que deseja continuar?</strong>
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel disabled={deleteLoading}>Não</AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    deleteAccount();
                                                }}
                                                disabled={deleteLoading}
                                                className="bg-destructive hover:bg-destructive/90"
                                            >
                                                {deleteLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                Sim, excluir permanentemente
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}

                        </CardContent>
                        <CardFooter>
                            <Button onClick={updateNotifications} disabled={loading} className="ml-auto">
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Salvar Preferências
                            </Button>
                        </CardFooter>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
