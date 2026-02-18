import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ConnectInstanceDialog } from "@/components/ConnectInstanceDialog";
import { InstanceRow } from "@/components/InstanceRow";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

const WhatsAppConnection = () => {
  const { user } = useAuth();
  const { data: userRole } = useUserRole();
  const isAgent = userRole === 'agent';
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [currentPairCode, setCurrentPairCode] = useState<string | null>(null);
  const [currentInstanceName, setCurrentInstanceName] = useState("");
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [pollingInstanceId, setPollingInstanceId] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);

  // Ref to track if dialog should be locked (prevents any close actions)
  const dialogLockedRef = useRef(false);

  // Debug: Log user info on mount
  useEffect(() => {
    console.log('[DEBUG] 🔐 Current user:', user?.id, user?.email);
    console.log('[DEBUG] 🎭 User role:', userRole);
  }, [user, userRole]);

  const { data: instances, isLoading } = useQuery({
    queryKey: ["instances", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      console.log('[DEBUG] 📋 Fetching instances for user:', user?.id);
      const { data, error } = await supabase
        .from("instances")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error('[DEBUG] ❌ Error fetching instances:', error);
        throw error;
      }
      console.log('[DEBUG] ✅ Instances loaded:', data?.length, data?.map(i => ({ id: i.id, name: i.name, status: i.status, user_id: i.user_id })));
      return data;
    },
    enabled: !!user?.id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("User not authenticated");

      // Sanitizar nome: lowercase, espaços para hífen, trim
      const sanitizedName = name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      console.log('[DEBUG] 🆕 Creating instance:', { originalName: name, sanitizedName, userId: user.id });

      if (!sanitizedName) throw new Error("Nome da instância inválido");

      // A verificação de duplicidade é feita na Edge Function com service_role
      const { data, error } = await supabase.functions.invoke(
        "uzapi-create-instance",
        {
          body: { instanceName: sanitizedName, userId: user.id },
        }
      );

      console.log('[DEBUG] 📤 uzapi-create-instance response:', data, error);

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Falha ao criar instância");

      return data;
    },
    onSuccess: (data) => {
      console.log('[DEBUG] ✅ Instance created successfully:', data);
      queryClient.invalidateQueries({ queryKey: ["instances"] });
      setName("");

      // Automatically open connect dialog for new instance
      setCurrentInstanceName(data.instanceName);
      setSelectedInstanceId(data.id);
      setConnectDialogOpen(true);

      toast({
        title: "Instância criada!",
        description: "Agora conecte seu WhatsApp.",
      });
    },
    onError: (error: any) => {
      console.error('[DEBUG] ❌ Create instance error:', error);
      toast({
        title: "Erro ao criar instância",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const connectMutation = useMutation({
    mutationFn: async ({ id, phone }: { id: string, phone: string }) => {
      console.log('[DEBUG] 🔗 Starting connection for instance:', id, 'phone:', phone);

      // Webhook configuration is now done INSIDE uzapi-connect-instance Edge Function
      // This ensures webhook is configured with the correct token before generating pair code
      console.log('[DEBUG] 📱 Calling uzapi-connect-instance (includes webhook config)...');

      const { data, error } = await supabase.functions.invoke("uzapi-connect-instance", {
        body: { instanceId: id, phoneNumber: phone },
      });

      console.log('[DEBUG] 📤 uzapi-connect-instance response:', data, error);

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Falha ao gerar código de pareamento");

      // Log webhook configuration status
      if (data.webhookConfigured) {
        console.log('[DEBUG] ✅ Webhook was configured successfully inside Edge Function');
      } else {
        console.log('[DEBUG] ⚠️ Webhook configuration may have failed, but pair code was generated');
      }

      return data;
    },
    onSuccess: (data) => {
      console.log('[DEBUG] ✅ Pair code generated:', data.pairCode);
      console.log('[DEBUG] 🔄 Starting polling for instance:', selectedInstanceId);

      setCurrentPairCode(data.pairCode);
      setPollingInstanceId(selectedInstanceId);
      setPollCount(0);
      dialogLockedRef.current = true;

      toast({
        title: "Código gerado e webhook configurado!",
        description: "Verifique seu WhatsApp e digite o código.",
      });
    },
    onError: (error: any) => {
      console.error('[DEBUG] ❌ Connect error:', error);
      toast({
        title: "Erro ao conectar",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const checkConnectionMutation = useMutation({
    mutationFn: async (id: string) => {
      console.log('[DEBUG] 🔍 Checking connection status for:', id, 'poll #', pollCount + 1);

      const { data, error } = await supabase.functions.invoke("uzapi-manager", {
        body: { action: 'check_connection', instanceId: id },
      });

      console.log('[DEBUG] 📤 uzapi-check-connection response:', data, error);

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setPollCount(prev => prev + 1);
      console.log('[DEBUG] 📊 Connection status:', data.status, '| pollingInstanceId:', pollingInstanceId, '| poll #:', pollCount + 1);

      // Auto-close modal when connected
      if (data.status === 'connected' && pollingInstanceId) {
        console.log('[DEBUG] 🎉 CONNECTED! Closing modal...');
        dialogLockedRef.current = false;
        setConnectDialogOpen(false);
        setPollingInstanceId(null);
        setCurrentPairCode(null);
        setPollCount(0);
        toast({
          title: "Conectado com sucesso!",
          description: "A instância está pronta para uso.",
        });
        queryClient.invalidateQueries({ queryKey: ["instances"] });
      } else if (data.status === 'disconnected') {
        console.log('[DEBUG] ⚠️ Status is disconnected - connection might have failed or timed out');
      } else {
        console.log('[DEBUG] ⏳ Still waiting... status:', data.status);
      }
    },
    onError: (error: any) => {
      console.error('[DEBUG] ❌ Check connection error:', error);
    }
  });

  // Polling para verificar status da conexão
  useEffect(() => {
    if (!pollingInstanceId) {
      console.log('[DEBUG] 🛑 Polling stopped - no pollingInstanceId');
      return;
    }

    console.log('[DEBUG] 🔄 Starting polling interval for:', pollingInstanceId);

    // Immediate first check
    checkConnectionMutation.mutate(pollingInstanceId);

    const interval = setInterval(() => {
      console.log('[DEBUG] ⏰ Polling tick for:', pollingInstanceId);
      checkConnectionMutation.mutate(pollingInstanceId);
    }, 5000); // Check every 5 seconds

    return () => {
      console.log('[DEBUG] 🧹 Cleaning up polling interval');
      clearInterval(interval);
    };
  }, [pollingInstanceId]);

  const handleConnect = (instance: any) => {
    console.log('[DEBUG] 🔌 handleConnect called for:', instance.id, instance.name);
    console.log('[DEBUG] 📋 Instance details:', { id: instance.id, name: instance.name, status: instance.status, user_id: instance.user_id });

    setCurrentInstanceName(instance.name);
    setSelectedInstanceId(instance.id);
    setCurrentPairCode(null);
    setConnectDialogOpen(true);
    setPollingInstanceId(null);
    setPollCount(0);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[DEBUG] 📝 Form submitted with name:', name);
    createMutation.mutate();
  };

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-4 md:space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Conexões WhatsApp</h1>
          <p className="text-muted-foreground text-sm md:text-base">
            Gerencie suas instâncias da Evolution API
          </p>
          {/* Debug info */}
          <p className="text-xs text-muted-foreground/50 mt-1">
            User: {user?.id?.slice(0, 8)}... | Polling: {pollingInstanceId ? `${pollingInstanceId.slice(0, 8)}... (#${pollCount})` : 'off'}
          </p>
        </div>

        {!isAgent && (
          <Card>
            <CardHeader className="p-4 md:p-6">
              <CardTitle className="text-base md:text-lg">Nova Instância</CardTitle>
              <CardDescription className="text-xs md:text-sm">
                Adicione uma nova conexão com a Evolution API
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome da Instância</Label>
                  <Input
                    id="name"
                    placeholder="Meu WhatsApp"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Criando..." : "Criar Instância"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-base md:text-lg">Instâncias Configuradas</CardTitle>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
            {isLoading ? (
              <p className="text-muted-foreground">Carregando...</p>
            ) : instances && instances.length > 0 ? (
              <div className="space-y-4">
                {instances.map((instance) => (
                  <InstanceRow
                    key={instance.id}
                    instance={instance}
                    onConnect={handleConnect}
                  />
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">
                Nenhuma instância configurada ainda.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <ConnectInstanceDialog
        open={connectDialogOpen}
        onOpenChange={(open) => {
          console.log('[DEBUG] 🚪 Dialog onOpenChange:', open);
          setConnectDialogOpen(open);
          if (!open) {
            console.log('[DEBUG] 🧹 Dialog closed - cleaning up state');
            dialogLockedRef.current = false;
            setPollingInstanceId(null);
            setCurrentPairCode(null);
            setPollCount(0);
          }
        }}
        instanceName={currentInstanceName}
        onConnect={async (phone) => {
          console.log('[DEBUG] 📞 onConnect callback with phone:', phone, 'instanceId:', selectedInstanceId);
          if (selectedInstanceId) {
            await connectMutation.mutateAsync({ id: selectedInstanceId, phone });
          }
        }}
        pairCode={currentPairCode}
        isLoading={connectMutation.isPending}
      />
    </div>
  );
};

export default WhatsAppConnection;
