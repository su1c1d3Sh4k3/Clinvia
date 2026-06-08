import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, FileText, Trash2, Download } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useOwnerId } from "@/hooks/useOwnerId";

const CATEGORIES = [
  { value: "avaliacao", label: "Avaliação" },
  { value: "receita", label: "Receita" },
  { value: "notas", label: "Notas" },
  { value: "exames", label: "Exames" },
  { value: "documentos", label: "Documentos" },
] as const;

interface HistoricoTabProps {
  contactId: string;
}

export const HistoricoTab = ({ contactId }: HistoricoTabProps) => {
  const { data: ownerId } = useOwnerId();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [activeCategory, setActiveCategory] = useState("avaliacao");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const { data: documents, isLoading } = useQuery({
    queryKey: ["client-documents", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_documents" as any)
        .select("*")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const filtered = (documents || []).filter((d: any) => d.category === activeCategory);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ownerId) return;
    e.target.value = "";
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${ownerId}/${contactId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("client-documents")
        .upload(path, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("client-documents").getPublicUrl(path);

      const { error } = await supabase.from("client_documents" as any).insert({
        user_id: ownerId,
        contact_id: contactId,
        category: activeCategory,
        title: newTitle || file.name,
        description: newDescription || null,
        file_url: urlData.publicUrl,
      });
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["client-documents", contactId] });
      setNewTitle("");
      setNewDescription("");
      toast.success("Arquivo adicionado com sucesso");
    } catch (err: any) {
      toast.error("Erro ao enviar: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleAddNote = async () => {
    if (!ownerId || !newTitle.trim()) return;
    setUploading(true);
    try {
      const { error } = await supabase.from("client_documents" as any).insert({
        user_id: ownerId,
        contact_id: contactId,
        category: activeCategory,
        title: newTitle.trim(),
        description: newDescription || null,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["client-documents", contactId] });
      setNewTitle("");
      setNewDescription("");
      toast.success("Nota adicionada");
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este registro?")) return;
    const { error } = await supabase.from("client_documents" as any).delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    queryClient.invalidateQueries({ queryKey: ["client-documents", contactId] });
    toast.success("Excluído");
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList>
          {CATEGORIES.map((cat) => (
            <TabsTrigger key={cat.value} value={cat.value} className="text-xs">
              {cat.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {CATEGORIES.map((cat) => (
          <TabsContent key={cat.value} value={cat.value} className="mt-4 space-y-4">
            {/* Add form */}
            <div className="border rounded-md p-3 space-y-3 bg-muted/20">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Título</Label>
                  <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="h-8 text-sm" placeholder="Título do registro" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Descrição (opcional)</Label>
                  <Input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className="h-8 text-sm" placeholder="Descrição breve" />
                </div>
              </div>
              <div className="flex gap-2">
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
                <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Anexar Arquivo
                </Button>
                <Button size="sm" className="gap-1 text-xs" onClick={handleAddNote} disabled={uploading || !newTitle.trim()}>
                  <Plus className="w-3 h-3" /> Adicionar Nota
                </Button>
              </div>
            </div>

            {/* List */}
            {filtered.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">Nenhum registro em {cat.label}.</p>
            ) : (
              <div className="space-y-2">
                {filtered.map((doc: any) => (
                  <div key={doc.id} className="flex items-start gap-3 p-3 border rounded-md">
                    <FileText className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{doc.title}</p>
                      {doc.description && <p className="text-xs text-muted-foreground">{doc.description}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {format(new Date(doc.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {doc.file_url && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer"><Download className="h-3.5 w-3.5" /></a>
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(doc.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};
