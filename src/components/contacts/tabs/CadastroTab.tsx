import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useOwnerId } from "@/hooks/useOwnerId";

interface CadastroTabProps {
  contact: any;
}

export const CadastroTab = ({ contact }: CadastroTabProps) => {
  const { data: ownerId } = useOwnerId();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: patient, isLoading } = useQuery({
    queryKey: ["patient-by-contact", contact.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients" as any)
        .select("*")
        .eq("contact_id", contact.id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const [form, setForm] = useState({
    nome: "", telefone: "", email: "", cpf: "", rg: "",
    data_nascimento: "", sexo: "", nome_civil: "",
    cep: "", endereco: "", complemento: "", bairro: "", cidade: "", estado: "",
    estado_civil: "", escolaridade: "", profissao: "",
  });

  useEffect(() => {
    if (patient) {
      setForm({
        nome: patient.nome || contact.push_name || "",
        telefone: patient.telefone || contact.phone || "",
        email: patient.email || contact.email || "",
        cpf: patient.cpf || contact.cpf || "",
        rg: patient.rg || "",
        data_nascimento: patient.data_nascimento || "",
        sexo: patient.sexo || "",
        nome_civil: patient.nome_civil || "",
        cep: patient.cep || "",
        endereco: patient.endereco || "",
        complemento: patient.complemento || "",
        bairro: patient.bairro || "",
        cidade: patient.cidade || "",
        estado: patient.estado || "",
        estado_civil: patient.estado_civil || "",
        escolaridade: patient.escolaridade || "",
        profissao: patient.profissao || "",
      });
    } else {
      setForm({
        nome: contact.push_name || "", telefone: contact.phone || "",
        email: contact.email || "", cpf: contact.cpf || "",
        rg: "", data_nascimento: "", sexo: "", nome_civil: "",
        cep: "", endereco: "", complemento: "", bairro: "", cidade: "", estado: "",
        estado_civil: "", escolaridade: "", profissao: "",
      });
    }
  }, [patient, contact]);

  const setField = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const handleSave = async () => {
    if (!ownerId) return;
    setSaving(true);
    try {
      if (patient) {
        const { error } = await supabase.from("patients" as any).update(form).eq("id", patient.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("patients" as any).insert({
          ...form, user_id: ownerId, contact_id: contact.id,
        });
        if (error) throw error;
        // Mark contact as patient
        await supabase.from("contacts").update({ patient: true }).eq("id", contact.id);
      }
      queryClient.invalidateQueries({ queryKey: ["patient-by-contact", contact.id] });
      toast.success("Cadastro salvo com sucesso");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const Field = ({ label, field, type = "text", span = 1 }: { label: string; field: string; type?: string; span?: number }) => (
    <div className={span === 2 ? "col-span-2" : ""}>
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={(form as any)[field] || ""} onChange={(e) => setField(field, e.target.value)} className="h-8 text-sm" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Dados pessoais */}
      <div>
        <h4 className="text-sm font-medium mb-3">Dados Pessoais</h4>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome" field="nome" span={2} />
          <Field label="Nome Civil" field="nome_civil" />
          <Field label="Telefone" field="telefone" />
          <Field label="Email" field="email" />
          <Field label="CPF" field="cpf" />
          <Field label="RG" field="rg" />
          <Field label="Data de Nascimento" field="data_nascimento" type="date" />
          <div>
            <Label className="text-xs">Sexo</Label>
            <Select value={form.sexo} onValueChange={(v) => setField("sexo", v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="masculino">Masculino</SelectItem>
                <SelectItem value="feminino">Feminino</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Endereço */}
      <div>
        <h4 className="text-sm font-medium mb-3">Endereço</h4>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CEP" field="cep" />
          <Field label="Endereço" field="endereco" />
          <Field label="Complemento" field="complemento" />
          <Field label="Bairro" field="bairro" />
          <Field label="Cidade" field="cidade" />
          <Field label="Estado" field="estado" />
        </div>
      </div>

      {/* Dados complementares */}
      <div>
        <h4 className="text-sm font-medium mb-3">Dados Complementares</h4>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Estado Civil" field="estado_civil" />
          <Field label="Escolaridade" field="escolaridade" />
          <Field label="Profissão" field="profissao" />
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Salvar Cadastro
      </Button>
    </div>
  );
};
