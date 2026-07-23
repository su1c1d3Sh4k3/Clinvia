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

interface FieldProps {
  label: string;
  field: string;
  type?: string;
  span?: number;
  form: Record<string, string>;
  setField: (key: string, value: string) => void;
}

// Definido fora do CadastroTab: se declarado dentro, o componente é recriado a
// cada render e o React remonta o Input, fazendo o campo perder o foco a cada tecla.
const Field = ({ label, field, type = "text", span = 1, form, setField }: FieldProps) => (
  <div className={span === 2 ? "col-span-2" : ""}>
    <Label className="text-xs">{label}</Label>
    <Input type={type} value={form[field] || ""} onChange={(e) => setField(field, e.target.value)} className="h-8 text-sm" />
  </div>
);

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
      // Coluna date do Postgres não aceita string vazia — campo é opcional
      const payload = { ...form, data_nascimento: form.data_nascimento || null };
      if (patient) {
        const { error } = await supabase.from("patients" as any).update(payload).eq("id", patient.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("patients" as any).insert({
          ...payload, user_id: ownerId, contact_id: contact.id,
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

  const fieldProps = { form: form as Record<string, string>, setField };

  return (
    <div className="space-y-6">
      {/* Dados pessoais */}
      <div>
        <h4 className="text-sm font-medium mb-3">Dados Pessoais</h4>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome" field="nome" span={2} {...fieldProps} />
          <Field label="Nome Civil" field="nome_civil" {...fieldProps} />
          <Field label="Telefone" field="telefone" {...fieldProps} />
          <Field label="Email" field="email" {...fieldProps} />
          <Field label="CPF" field="cpf" {...fieldProps} />
          <Field label="RG" field="rg" {...fieldProps} />
          <Field label="Data de Nascimento" field="data_nascimento" type="date" {...fieldProps} />
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
          <Field label="CEP" field="cep" {...fieldProps} />
          <Field label="Endereço" field="endereco" {...fieldProps} />
          <Field label="Complemento" field="complemento" {...fieldProps} />
          <Field label="Bairro" field="bairro" {...fieldProps} />
          <Field label="Cidade" field="cidade" {...fieldProps} />
          <Field label="Estado" field="estado" {...fieldProps} />
        </div>
      </div>

      {/* Dados complementares */}
      <div>
        <h4 className="text-sm font-medium mb-3">Dados Complementares</h4>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Estado Civil" field="estado_civil" {...fieldProps} />
          <Field label="Escolaridade" field="escolaridade" {...fieldProps} />
          <Field label="Profissão" field="profissao" {...fieldProps} />
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Salvar Cadastro
      </Button>
    </div>
  );
};
