import { useState, useEffect } from "react";
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
  const [isConfirming, setIsConfirming] = useState(false);

  const { data: instances, isLoading } = useQuery({
    queryKey: ["instances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instances")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Check if polling instance is connected
      if (pollingInstanceId) {
        const instance = data.find(i => i.id === pollingInstanceId);
        if (instance && instance.status === 'connected') {
          setConnectDialogOpen(false);
          setPollingInstanceId(null);
          setCurrentPairCode(null);
          toast({
            title: "WhatsApp conectado!",
            description: "Sua instância está pronta para uso.",
          });
          queryClient.invalidateQueries({ queryKey: ["instances"] });
        }
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("User not authenticated");

      const { data, error } = await supabase.functions.invoke(
        "uzapi-create-instance",
        {
          body: { instanceName: name, userId: user.id },
        }
      );

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Failed to create instance");

      return data;
    },
    onSuccess: (data) => {
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
      toast({
        title: "Erro ao criar instância",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const connectMutation = useMutation({
    mutationFn: async ({ id, phone }: { id: string, phone: string }) => {
      const { data, error } = await supabase.functions.invoke("uzapi-connect-instance", {
        body: { instanceId: id, phoneNumber: phone },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Failed to generate pair code");
      return data;
    },
    onSuccess: (data) => {
      setCurrentPairCode(data.pairCode);
      setPollingInstanceId(selectedInstanceId);
      toast({
        title: "Código gerado!",
        description: "Verifique seu WhatsApp.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao conectar",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const checkConnectionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("uzapi-check-connection", {
        body: { instanceId: id },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["instances"] });
    },
  });

  // Polling para verificar status da conexão
  useEffect(() => {
    if (!pollingInstanceId) return;

    const interval = setInterval(() => {
      checkConnectionMutation.mutate(pollingInstanceId);
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [pollingInstanceId]);

  const handleConnect = (instance: any) => {
    setCurrentInstanceName(instance.name);
    setSelectedInstanceId(instance.id);
    setCurrentPairCode(null); // Always force new connection flow
    setConnectDialogOpen(true);
    setPollingInstanceId(null);
  };

  const handleConfirmConnection = async () => {
    if (selectedInstanceId) {
      setIsConfirming(true);
      try {
        toast({
          title: "Verificando...",
          description: "Consultando status da conexão.",
        });

        const data = await checkConnectionMutation.mutateAsync(selectedInstanceId);

        if (data.status === 'connected') {
          // Configure webhook via Edge Function (avoids CORS)
          toast({
            title: "Configurando...",
            description: "Configurando webhook da instância.",
          });

          try {
            console.log('[WhatsApp] Configuring global webhook via Edge Function...');

            const { data: webhookResult, error: webhookError } = await supabase.functions.invoke(
              'uzapi-configure-webhook',
              { body: { instanceId: selectedInstanceId } }
            );

            if (webhookError) {
              console.error('[WhatsApp] Webhook configuration error:', webhookError);
              toast({
                title: "Aviso",
                description: "Webhook não configurado automaticamente. Configure manualmente se necessário.",
                variant: "destructive"
              });
            } else {
              console.log('[WhatsApp] Webhook configured successfully:', webhookResult);
            }
          } catch (webhookError) {
            console.error('[WhatsApp] Error configuring webhook:', webhookError);
          }

          setConnectDialogOpen(false);
          setPollingInstanceId(null);
          setCurrentPairCode(null);
          toast({
            title: "Conectado com sucesso!",
            description: "A instância está pronta para uso.",
            variant: "default"
          });
          queryClient.invalidateQueries({ queryKey: ["instances"] });
        } else {
          toast({
            title: "Ainda não conectado",
            description: `O status atual é: ${data.status}. Certifique-se de ter digitado o código no WhatsApp.`,
            variant: "destructive"
          });
        }
      } catch (error) {
        toast({
          title: "Erro na verificação",
          description: "Não foi possível verificar o status.",
          variant: "destructive"
        });
      } finally {
        setIsConfirming(false);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
          if (!isConfirming) {
            setConnectDialogOpen(open);
            if (!open) {
              setPollingInstanceId(null);
              setCurrentPairCode(null);
            }
          }
        }}
        instanceName={currentInstanceName}
        onConnect={async (phone) => {
          if (selectedInstanceId) {
            await connectMutation.mutateAsync({ id: selectedInstanceId, phone });
          }
        }}
        pairCode={currentPairCode}
        isLoading={connectMutation.isPending || isConfirming}
        onConfirm={handleConfirmConnection}
      />
    </div>
  );
};

export default WhatsAppConnection;
