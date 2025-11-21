import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, CheckCircle, XCircle, Wifi } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { NavigationSidebar } from "@/components/NavigationSidebar";
import { QRCodeDialog } from "@/components/QRCodeDialog";

const WhatsAppConnection = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [currentQrCode, setCurrentQrCode] = useState<string | null>(null);
  const [currentInstanceName, setCurrentInstanceName] = useState("");
  const [pollingInstanceId, setPollingInstanceId] = useState<string | null>(null);

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
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("instances")
        .insert({
          name,
          server_url: serverUrl,
          apikey: apiKey,
          status: "disconnected",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instances"] });
      setName("");
      setServerUrl("");
      setApiKey("");
      toast({
        title: "Instância criada!",
        description: "Conecte-a para começar a usar.",
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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("instances").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instances"] });
      toast({
        title: "Instância deletada",
      });
    },
  });

  const connectMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("evolution-create-instance", {
        body: { instanceId: id },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data, instanceId) => {
      setCurrentQrCode(data.qrCode);
      setCurrentInstanceName(data.instanceName);
      setQrDialogOpen(true);
      setPollingInstanceId(instanceId);
      queryClient.invalidateQueries({ queryKey: ["instances"] });
      toast({
        title: "QR Code gerado!",
        description: "Escaneie com seu WhatsApp para conectar.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao gerar QR Code",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const checkConnectionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("evolution-check-connection", {
        body: { instanceId: id },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["instances"] });
      if (data.status === 'connected') {
        setQrDialogOpen(false);
        setPollingInstanceId(null);
        toast({
          title: "WhatsApp conectado!",
          description: "Sua instância está pronta para uso.",
        });
      }
    },
  });

  // Polling para verificar status da conexão
  useEffect(() => {
    if (!pollingInstanceId) return;

    const interval = setInterval(() => {
      checkConnectionMutation.mutate(pollingInstanceId);
    }, 3000); // Verifica a cada 3 segundos

    return () => clearInterval(interval);
  }, [pollingInstanceId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <NavigationSidebar />
      
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Conexões WhatsApp</h1>
            <p className="text-muted-foreground">
              Gerencie suas instâncias da Evolution API
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Nova Instância</CardTitle>
              <CardDescription>
                Adicione uma nova conexão com a Evolution API
              </CardDescription>
            </CardHeader>
            <CardContent>
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
                <div className="space-y-2">
                  <Label htmlFor="server-url">Server URL</Label>
                  <Input
                    id="server-url"
                    placeholder="https://evolution.example.com"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="api-key">API Key</Label>
                  <Input
                    id="api-key"
                    type="password"
                    placeholder="Sua API Key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Criando..." : "Criar Instância"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Instâncias Configuradas</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-muted-foreground">Carregando...</p>
              ) : instances && instances.length > 0 ? (
                <div className="space-y-4">
                  {instances.map((instance) => (
                    <div
                      key={instance.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="space-y-1">
                        <h3 className="font-semibold">{instance.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {instance.server_url}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={
                            instance.status === "connected" ? "default" : "secondary"
                          }
                        >
                          {instance.status === "connected" ? (
                            <CheckCircle className="w-3 h-3 mr-1" />
                          ) : (
                            <XCircle className="w-3 h-3 mr-1" />
                          )}
                          {instance.status}
                        </Badge>
                        {instance.status !== "connected" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => connectMutation.mutate(instance.id)}
                            disabled={connectMutation.isPending}
                          >
                            <Wifi className="w-4 h-4 mr-2" />
                            Conectar WhatsApp
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteMutation.mutate(instance.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
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
      </div>

      <QRCodeDialog
        open={qrDialogOpen}
        onOpenChange={(open) => {
          setQrDialogOpen(open);
          if (!open) {
            setPollingInstanceId(null);
          }
        }}
        qrCode={currentQrCode}
        instanceName={currentInstanceName}
      />
    </div>
  );
};

export default WhatsAppConnection;
