import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useOwnerId } from "@/hooks/useOwnerId";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import type { Patient } from "@/pages/Patients";

interface PatientModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    patientToEdit?: Patient | null;
}

const ESTADOS_BRASIL = [
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
    "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

const ESTADOS_CIVIS = ["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)", "Separado(a)", "União Estável"];

const ESCOLARIDADES = [
    "Ensino Fundamental Incompleto", "Ensino Fundamental Completo",
    "Ensino Médio Incompleto", "Ensino Médio Completo",
    "Ensino Superior Incompleto", "Ensino Superior Completo",
    "Pós-Graduação", "Mestrado", "Doutorado"
];

export const PatientModal = ({ open, onOpenChange, patientToEdit }: PatientModalProps) => {
    const [step, setStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { data: ownerId } = useOwnerId();

    // Form state - Step 1
    const [contactId, setContactId] = useState<string>("");
    const [nome, setNome] = useState("");
    const [telefone, setTelefone] = useState("");
    const [email, setEmail] = useState("");
    const [cpf, setCpf] = useState("");
    const [rg, setRg] = useState("");
    const [dataNascimento, setDataNascimento] = useState("");
    const [sexo, setSexo] = useState("");
    const [usaNomeCivil, setUsaNomeCivil] = useState(false);
    const [nomeCivil, setNomeCivil] = useState("");

    // Form state - Step 2
    const [cep, setCep] = useState("");
    const [endereco, setEndereco] = useState("");
    const [complemento, setComplemento] = useState("");
    const [bairro, setBairro] = useState("");
    const [cidade, setCidade] = useState("");
    const [estado, setEstado] = useState("");

    // Form state - Step 3
    const [estadoCivil, setEstadoCivil] = useState("");
    const [escolaridade, setEscolaridade] = useState("");
    const [profissao, setProfissao] = useState("");
    const [contatosEmergencia, setContatosEmergencia] = useState<{ nome: string; telefone: string }[]>([{ nome: "", telefone: "" }]);

    // Form state - Step 4
    const [convenios, setConvenios] = useState<{ nome: string; tipo_plano: string; numero_carteirinha: string; validade: string; carencia: string; acomodacao: string }[]>([
        { nome: "", tipo_plano: "", numero_carteirinha: "", validade: "", carencia: "", acomodacao: "" }
    ]);

    // Fetch contacts for dropdown
    const { data: contacts } = useQuery({
        queryKey: ["contacts-for-patients", ownerId],
        queryFn: async () => {
            if (!ownerId) return [];
            const { data, error } = await supabase
                .from("contacts")
                .select("id, push_name, number, phone, email, cpf")
                .eq("user_id", ownerId)
                .order("push_name");
            if (error) throw error;
            // Filter out groups
            return (data as any[]).filter(c => !c.number?.endsWith('@g.us'));
        },
        enabled: !!ownerId && open,
    });

    // Reset form when modal opens/closes
    useEffect(() => {
        if (open) {
            if (patientToEdit) {
                setContactId(patientToEdit.contact_id || "");
                setNome(patientToEdit.nome || "");
                setTelefone(patientToEdit.telefone || "");
                setEmail(patientToEdit.email || "");
                setCpf(patientToEdit.cpf || "");
                setRg(patientToEdit.rg || "");
                setDataNascimento(patientToEdit.data_nascimento || "");
                setSexo(patientToEdit.sexo || "");
                setNomeCivil(patientToEdit.nome_civil || "");
                setUsaNomeCivil(!!patientToEdit.nome_civil);
                setCep(patientToEdit.cep || "");
                setEndereco(patientToEdit.endereco || "");
                setComplemento(patientToEdit.complemento || "");
                setBairro(patientToEdit.bairro || "");
                setCidade(patientToEdit.cidade || "");
                setEstado(patientToEdit.estado || "");
                setEstadoCivil(patientToEdit.estado_civil || "");
                setEscolaridade(patientToEdit.escolaridade || "");
                setProfissao(patientToEdit.profissao || "");
                setContatosEmergencia(patientToEdit.contatos_emergencia?.length ? patientToEdit.contatos_emergencia : [{ nome: "", telefone: "" }]);
                setConvenios(patientToEdit.convenios?.length ? patientToEdit.convenios : [{ nome: "", tipo_plano: "", numero_carteirinha: "", validade: "", carencia: "", acomodacao: "" }]);
            } else {
                resetForm();
            }
            setStep(1);
        }
    }, [open, patientToEdit]);

    const resetForm = () => {
        setContactId("");
        setNome("");
        setTelefone("");
        setEmail("");
        setCpf("");
        setRg("");
        setDataNascimento("");
        setSexo("");
        setUsaNomeCivil(false);
        setNomeCivil("");
        setCep("");
        setEndereco("");
        setComplemento("");
        setBairro("");
        setCidade("");
        setEstado("");
        setEstadoCivil("");
        setEscolaridade("");
        setProfissao("");
        setContatosEmergencia([{ nome: "", telefone: "" }]);
        setConvenios([{ nome: "", tipo_plano: "", numero_carteirinha: "", validade: "", carencia: "", acomodacao: "" }]);
    };

    // Masks
    const formatCPF = (value: string) => {
        const nums = value.replace(/\D/g, "").slice(0, 11);
        if (nums.length <= 3) return nums;
        if (nums.length <= 6) return `${nums.slice(0, 3)}.${nums.slice(3)}`;
        if (nums.length <= 9) return `${nums.slice(0, 3)}.${nums.slice(3, 6)}.${nums.slice(6)}`;
        return `${nums.slice(0, 3)}.${nums.slice(3, 6)}.${nums.slice(6, 9)}-${nums.slice(9)}`;
    };

    const formatPhone = (value: string) => {
        const nums = value.replace(/\D/g, "").slice(0, 13);
        if (nums.length <= 2) return `+${nums}`;
        if (nums.length <= 4) return `+${nums.slice(0, 2)} (${nums.slice(2)}`;
        if (nums.length <= 5) return `+${nums.slice(0, 2)} (${nums.slice(2, 4)}) ${nums.slice(4)}`;
        if (nums.length <= 9) return `+${nums.slice(0, 2)} (${nums.slice(2, 4)}) ${nums.slice(4, 5)} ${nums.slice(5)}`;
        return `+${nums.slice(0, 2)} (${nums.slice(2, 4)}) ${nums.slice(4, 5)} ${nums.slice(5, 9)}-${nums.slice(9)}`;
    };

    const formatCEP = (value: string) => {
        const nums = value.replace(/\D/g, "").slice(0, 8);
        if (nums.length <= 5) return nums;
        return `${nums.slice(0, 5)}-${nums.slice(5)}`;
    };

    const formatDate = (value: string) => {
        const nums = value.replace(/\D/g, "").slice(0, 8);
        if (nums.length <= 2) return nums;
        if (nums.length <= 4) return `${nums.slice(0, 2)}/${nums.slice(2)}`;
        return `${nums.slice(0, 2)}/${nums.slice(2, 4)}/${nums.slice(4)}`;
    };

    // Auto-fill from contact
    const handleContactSelect = (id: string) => {
        setContactId(id);
        const contact = contacts?.find(c => c.id === id);
        if (contact) {
            setNome(contact.push_name || "");
            setTelefone(formatPhone(contact.phone || contact.number?.split("@")[0] || ""));
            setEmail(contact.email || "");
            setCpf(formatCPF(contact.cpf || ""));
        }
    };

    const handleSave = async () => {
        if (!nome.trim() || !telefone.trim()) {
            toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
            return;
        }

        setIsLoading(true);
        try {
            const patientData = {
                user_id: ownerId,
                contact_id: contactId || null,
                nome: nome.trim(),
                telefone: telefone.trim(),
                email: email.trim() || null,
                cpf: cpf.trim() || null,
                rg: rg.trim() || null,
                data_nascimento: dataNascimento ? new Date(dataNascimento.split("/").reverse().join("-")).toISOString().split("T")[0] : null,
                sexo: sexo || null,
                nome_civil: usaNomeCivil ? nomeCivil.trim() : null,
                cep: cep.trim() || null,
                endereco: endereco.trim() || null,
                complemento: complemento.trim() || null,
                bairro: bairro.trim() || null,
                cidade: cidade.trim() || null,
                estado: estado || null,
                estado_civil: estadoCivil || null,
                escolaridade: escolaridade || null,
                profissao: profissao.trim() || null,
                contatos_emergencia: contatosEmergencia.filter(c => c.nome.trim() || c.telefone.trim()),
                convenios: convenios.filter(c => c.nome.trim()),
            };

            let patientId = patientToEdit?.id;

            if (patientToEdit) {
                const { error } = await supabase
                    .from("patients" as any)
                    .update(patientData)
                    .eq("id", patientToEdit.id);
                if (error) throw error;
            } else {
                const { data, error } = await supabase
                    .from("patients" as any)
                    .insert(patientData)
                    .select("id")
                    .single();
                if (error) throw error;
                patientId = data.id;
            }

            // Update contact if linked
            if (contactId && patientId) {
                await supabase
                    .from("contacts")
                    .update({ patient: true, patient_id: patientId } as any)
                    .eq("id", contactId);
            }

            queryClient.invalidateQueries({ queryKey: ["patients"] });
            queryClient.invalidateQueries({ queryKey: ["contacts"] });
            toast({ title: patientToEdit ? "Paciente atualizado!" : "Paciente cadastrado!" });
            onOpenChange(false);
        } catch (error: any) {
            toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    const addContatoEmergencia = () => setContatosEmergencia([...contatosEmergencia, { nome: "", telefone: "" }]);
    const removeContatoEmergencia = (index: number) => setContatosEmergencia(contatosEmergencia.filter((_, i) => i !== index));
    const updateContatoEmergencia = (index: number, field: "nome" | "telefone", value: string) => {
        const updated = [...contatosEmergencia];
        updated[index][field] = field === "telefone" ? formatPhone(value) : value;
        setContatosEmergencia(updated);
    };

    const addConvenio = () => setConvenios([...convenios, { nome: "", tipo_plano: "", numero_carteirinha: "", validade: "", carencia: "", acomodacao: "" }]);
    const removeConvenio = (index: number) => setConvenios(convenios.filter((_, i) => i !== index));
    const updateConvenio = (index: number, field: keyof typeof convenios[0], value: string) => {
        const updated = [...convenios];
        updated[index][field] = value;
        setConvenios(updated);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {patientToEdit ? "Editar Paciente" : "Novo Paciente"} - Etapa {step}/4
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Step 1: Dados Pessoais */}
                    {step === 1 && (
                        <div className="space-y-4">
                            <div>
                                <Label>Vincular Contato</Label>
                                <Select value={contactId} onValueChange={handleContactSelect}>
                                    <SelectTrigger><SelectValue placeholder="Selecione um contato..." /></SelectTrigger>
                                    <SelectContent>
                                        {contacts?.map(c => (
                                            <SelectItem key={c.id} value={c.id}>{c.push_name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Nome *</Label>
                                    <Input value={nome} onChange={e => setNome(e.target.value)} />
                                </div>
                                <div>
                                    <Label>Telefone *</Label>
                                    <Input value={telefone} onChange={e => setTelefone(formatPhone(e.target.value))} placeholder="+55 (11) 9 1234-5678" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Email</Label>
                                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
                                </div>
                                <div>
                                    <Label>CPF</Label>
                                    <Input value={cpf} onChange={e => setCpf(formatCPF(e.target.value))} placeholder="000.000.000-00" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>RG</Label>
                                    <Input value={rg} onChange={e => setRg(e.target.value)} />
                                </div>
                                <div>
                                    <Label>Data de Nascimento</Label>
                                    <Input value={dataNascimento} onChange={e => setDataNascimento(formatDate(e.target.value))} placeholder="DD/MM/AAAA" />
                                </div>
                            </div>
                            <div>
                                <Label>Sexo</Label>
                                <RadioGroup value={sexo} onValueChange={setSexo} className="flex gap-4 mt-2">
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="masculino" id="masculino" />
                                        <Label htmlFor="masculino">Masculino</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="feminino" id="feminino" />
                                        <Label htmlFor="feminino">Feminino</Label>
                                    </div>
                                </RadioGroup>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox checked={usaNomeCivil} onCheckedChange={(checked) => setUsaNomeCivil(!!checked)} id="nome-civil" />
                                <Label htmlFor="nome-civil">Usar nome civil diferente</Label>
                            </div>
                            {usaNomeCivil && (
                                <div>
                                    <Label>Nome Civil</Label>
                                    <Input value={nomeCivil} onChange={e => setNomeCivil(e.target.value)} />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 2: Endereço */}
                    {step === 2 && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>CEP</Label>
                                    <Input value={cep} onChange={e => setCep(formatCEP(e.target.value))} placeholder="00000-000" />
                                </div>
                                <div>
                                    <Label>Estado</Label>
                                    <Select value={estado} onValueChange={setEstado}>
                                        <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                                        <SelectContent>
                                            {ESTADOS_BRASIL.map(uf => (
                                                <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div>
                                <Label>Endereço</Label>
                                <Input value={endereco} onChange={e => setEndereco(e.target.value)} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Complemento</Label>
                                    <Input value={complemento} onChange={e => setComplemento(e.target.value)} />
                                </div>
                                <div>
                                    <Label>Bairro</Label>
                                    <Input value={bairro} onChange={e => setBairro(e.target.value)} />
                                </div>
                            </div>
                            <div>
                                <Label>Cidade</Label>
                                <Input value={cidade} onChange={e => setCidade(e.target.value)} />
                            </div>
                        </div>
                    )}

                    {/* Step 3: Dados Complementares */}
                    {step === 3 && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Estado Civil</Label>
                                    <Select value={estadoCivil} onValueChange={setEstadoCivil}>
                                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                        <SelectContent>
                                            {ESTADOS_CIVIS.map(ec => (
                                                <SelectItem key={ec} value={ec}>{ec}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label>Escolaridade</Label>
                                    <Select value={escolaridade} onValueChange={setEscolaridade}>
                                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                        <SelectContent>
                                            {ESCOLARIDADES.map(esc => (
                                                <SelectItem key={esc} value={esc}>{esc}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div>
                                <Label>Profissão</Label>
                                <Input value={profissao} onChange={e => setProfissao(e.target.value)} />
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <Label>Contatos de Emergência</Label>
                                    <Button type="button" variant="outline" size="sm" onClick={addContatoEmergencia}>
                                        <Plus className="w-4 h-4 mr-1" /> Adicionar
                                    </Button>
                                </div>
                                {contatosEmergencia.map((contato, index) => (
                                    <div key={index} className="flex gap-2 mb-2">
                                        <Input
                                            placeholder="Nome"
                                            value={contato.nome}
                                            onChange={e => updateContatoEmergencia(index, "nome", e.target.value)}
                                            className="flex-1"
                                        />
                                        <Input
                                            placeholder="Telefone"
                                            value={contato.telefone}
                                            onChange={e => updateContatoEmergencia(index, "telefone", e.target.value)}
                                            className="flex-1"
                                        />
                                        {contatosEmergencia.length > 1 && (
                                            <Button type="button" variant="ghost" size="icon" onClick={() => removeContatoEmergencia(index)}>
                                                <Trash2 className="w-4 h-4 text-destructive" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 4: Convênios */}
                    {step === 4 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-lg font-semibold">Convênios</Label>
                                <Button type="button" variant="outline" size="sm" onClick={addConvenio}>
                                    <Plus className="w-4 h-4 mr-1" /> Adicionar Convênio
                                </Button>
                            </div>
                            {convenios.map((convenio, index) => (
                                <div key={index} className="border rounded-lg p-4 space-y-3 relative">
                                    {convenios.length > 1 && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="absolute top-2 right-2"
                                            onClick={() => removeConvenio(index)}
                                        >
                                            <Trash2 className="w-4 h-4 text-destructive" />
                                        </Button>
                                    )}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label>Nome do Convênio</Label>
                                            <Input value={convenio.nome} onChange={e => updateConvenio(index, "nome", e.target.value)} />
                                        </div>
                                        <div>
                                            <Label>Tipo de Plano</Label>
                                            <Input value={convenio.tipo_plano} onChange={e => updateConvenio(index, "tipo_plano", e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label>Número da Carteirinha</Label>
                                            <Input value={convenio.numero_carteirinha} onChange={e => updateConvenio(index, "numero_carteirinha", e.target.value)} />
                                        </div>
                                        <div>
                                            <Label>Validade</Label>
                                            <Input value={convenio.validade} onChange={e => updateConvenio(index, "validade", formatDate(e.target.value))} placeholder="DD/MM/AAAA" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label>Carência</Label>
                                            <Input value={convenio.carencia} onChange={e => updateConvenio(index, "carencia", e.target.value)} />
                                        </div>
                                        <div>
                                            <Label>Acomodação</Label>
                                            <Input value={convenio.acomodacao} onChange={e => updateConvenio(index, "acomodacao", e.target.value)} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Navigation */}
                <div className="flex justify-between pt-4 border-t">
                    <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={step === 1}>
                        <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
                    </Button>
                    {step < 4 ? (
                        <Button onClick={() => setStep(s => s + 1)}>
                            Próximo <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                    ) : (
                        <Button onClick={handleSave} disabled={isLoading}>
                            {isLoading ? "Salvando..." : "Salvar Paciente"}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
