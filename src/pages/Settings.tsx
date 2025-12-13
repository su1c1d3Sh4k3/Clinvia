import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { User, Building2, Lock, Camera, Loader2, Bell, BellRing, Users, Volume2, DollarSign } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentTeamMember } from "@/hooks/useStaff";

export default function Settings() {
    const { user } = useAuth();
    const { data: userRole } = useUserRole();
    const { data: currentTeamMember } = useCurrentTeamMember();
    const [loading, setLoading] = useState(false);
    const [profile, setProfile] = useState<any>(null);
    const [fullName, setFullName] = useState("");
    const [companyName, setCompanyName] = useState("");
    const [avatarUrl, setAvatarUrl] = useState("");
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

    // Notification state
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [groupNotificationsEnabled, setGroupNotificationsEnabled] = useState(true);
    const [financialAccessEnabled, setFinancialAccessEnabled] = useState(true);

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
            setPhone(tm.phone || "");
            setAddress(tm.address || "");
            setProfileEmail(tm.email || "");
            setInstagram(tm.instagram || "");
            setNotificationsEnabled(tm.notifications_enabled ?? true);
            setGroupNotificationsEnabled(tm.group_notifications_enabled ?? true);

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
                phone,
                address,
                email: profileEmail,
                instagram,
                updated_at: new Date().toISOString(),
            };

            if (!currentTeamMember?.id) {
                toast.error("Erro: usuário não identificado");
                setLoading(false);
                return;
            }

            const { error } = await supabase
                .from("team_members")
                .update(updates)
                .eq("id", currentTeamMember.id);

            if (error) throw error;

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
                updated_at: new Date().toISOString(),
            };

            if (!currentTeamMember?.id) {
                toast.error("Erro: usuário não identificado");
                setLoading(false);
                return;
            }

            const { error } = await supabase
                .from("team_members")
                .update(updates)
                .eq("id", currentTeamMember.id);

            if (error) throw error;

            // Request permission if enabled
            if (notificationsEnabled && Notification.permission === 'default') {
                await Notification.requestPermission();
            }

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
        <div className="container mx-auto py-10 max-w-4xl animate-in fade-in duration-500">
            <h1 className="text-3xl font-bold mb-8 text-foreground">Configurações do Sistema</h1>

            <Tabs defaultValue="profile" className="w-full">
                <TabsList className="grid w-full grid-cols-4 mb-8">
                    <TabsTrigger value="profile" className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Perfil
                    </TabsTrigger>
                    <TabsTrigger value="company" className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Empresa
                    </TabsTrigger>
                    <TabsTrigger value="security" className="flex items-center gap-2">
                        <Lock className="h-4 w-4" />
                        Segurança
                    </TabsTrigger>
                    <TabsTrigger value="notifications" className="flex items-center gap-2">
                        <Bell className="h-4 w-4" />
                        Notificações
                    </TabsTrigger>
                </TabsList>

                {/* Profile Tab */}
                <TabsContent value="profile">
                    <Card>
                        <CardHeader>
                            <CardTitle>Perfil do Usuário</CardTitle>
                            <CardDescription>
                                Gerencie suas informações pessoais e como elas aparecem para os outros.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex flex-col md:flex-row gap-8 items-start">
                                {/* Left Side - Avatar */}
                                <div className="flex flex-col items-center gap-4 min-w-[200px]">
                                    <Avatar className="h-32 w-32 border-4 border-background shadow-xl">
                                        <AvatarImage src={avatarUrl} />
                                        <AvatarFallback className="text-4xl font-bold bg-primary/10 text-primary">
                                            {fullName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex items-center gap-2 w-full justify-center">
                                        <Label htmlFor="avatar-upload" className="cursor-pointer">
                                            <div className="flex items-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/90 h-9 px-4 py-2 rounded-md text-sm font-medium transition-colors">
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
                        <CardHeader>
                            <CardTitle>Informações da Empresa</CardTitle>
                            <CardDescription>
                                Configure os dados da sua organização.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
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
                        <CardHeader>
                            <CardTitle>Segurança da Conta</CardTitle>
                            <CardDescription>
                                Atualize seu email e senha.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
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
                        <CardHeader>
                            <CardTitle>Preferências de Notificação</CardTitle>
                            <CardDescription>
                                Personalize como você recebe alertas do sistema.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Browser Notifications */}
                            <div className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-primary/10 rounded-full">
                                        <BellRing className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="space-y-0.5">
                                        <h4 className="font-medium">Notificações de Navegador</h4>
                                        <p className="text-sm text-muted-foreground">
                                            Receba alertas visuais e sonoros quando estiver fora do chat.
                                        </p>
                                    </div>
                                </div>
                                <Switch
                                    checked={notificationsEnabled}
                                    onCheckedChange={setNotificationsEnabled}
                                />
                            </div>

                            {/* Group Notifications */}
                            <div className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-primary/10 rounded-full">
                                        <Users className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="space-y-0.5">
                                        <h4 className="font-medium">Notificações de Grupos</h4>
                                        <p className="text-sm text-muted-foreground">
                                            Receba alertas também para mensagens vindas de grupos.
                                        </p>
                                    </div>
                                </div>
                                <Switch
                                    checked={groupNotificationsEnabled}
                                    onCheckedChange={setGroupNotificationsEnabled}
                                    disabled={!notificationsEnabled}
                                />
                            </div>

                            {/* Financial Access Control (Admin Only) */}
                            {userRole === 'admin' && (
                                <div className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors border-l-4 border-l-primary">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-primary/10 rounded-full">
                                            <DollarSign className="h-5 w-5 text-primary" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <h4 className="font-medium">Conceder acesso financeiro ao supervisor</h4>
                                            <p className="text-sm text-muted-foreground">
                                                Ao desativar, apenas o administrador visualizará dados financeiros da empresa.
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
                            <div className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-primary/10 rounded-full">
                                        <Volume2 className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="space-y-0.5">
                                        <h4 className="font-medium">Testar Alertas</h4>
                                        <p className="text-sm text-muted-foreground">
                                            Verifique se o som e os popups estão funcionando corretamente.
                                        </p>
                                    </div>
                                </div>
                                <Button variant="outline" size="sm" onClick={testNotification}>
                                    Testar Agora
                                </Button>
                            </div>

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
