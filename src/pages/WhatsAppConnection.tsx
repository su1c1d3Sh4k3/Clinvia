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
      // Valores fixos da Evolution API
      const EVOLUTION_SERVER_URL = "https://wsapi.clinvia.com.br";
      const EVOLUTION_API_KEY = "6cbd4c9e-8862-49f9-918b-34bcce736948";

      // Primeiro criar no banco
      const { data: instance, error } = await supabase
        .from("instances")
        .insert({
          name,
          server_url: EVOLUTION_SERVER_URL,
          apikey: EVOLUTION_API_KEY,
          status: "disconnected",
        })
        .select()
        .single();

      if (error) throw error;

      // Depois criar na Evolution API e gerar QR code
      const { data: evolutionData, error: evolutionError } = await supabase.functions.invoke(
        "evolution-create-instance",
        {
          body: { instanceId: instance.id, instanceName: name },
        }
      );

      if (evolutionError) throw evolutionError;

      return { instance, evolutionData };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["instances"] });
      setName("");
      
      // Abrir modal com QR code imediatamente
      setCurrentQrCode(data.evolutionData.qrCode);
      setCurrentInstanceName(data.evolutionData.instanceName);
      setQrDialogOpen(true);
      setPollingInstanceId(data.instance.id);

      toast({
        title: "Instância criada!",
        description: "Escaneie o QR Code para conectar.",
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
