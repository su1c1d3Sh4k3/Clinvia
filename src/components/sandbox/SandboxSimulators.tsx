import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronDown, Loader2, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_UAZAPI_BODIES } from "../../../supabase/functions/_shared/uazapi-automation-messages";
import type { SandboxContact } from "@/hooks/useSandbox";
import type { CatalogoConvenio, CatalogoSala, CatalogoServico } from "./useSandboxCatalog";

/**
 * Simuladores do sandbox.
 *
 * Cada botão aqui grava direto nas tabelas `sandbox_*` e injeta no chat a
 * mensagem que o paciente teria recebido — daí em diante é só responder e ver
 * como a IA conduz. Nada é enviado por WhatsApp e nenhum template é consumido.
 *
 * O template de confirmação chega SEM botões de propósito: o objetivo é ver a
 * IA interpretando a resposta escrita do paciente.
 */

interface SandboxSimulatorsProps {
    sessionId: string;
    ownerId: string;
    conversationId: string;
    contato: SandboxContact;
    salas: CatalogoSala[];
    servicos: CatalogoServico[];
    convenios: CatalogoConvenio[];
    clinicaNome: string;
    onDone: () => void;
}

/** datetime-local é sempre lido como horário de São Paulo (-03:00). */
const spToIso = (valor: string) => new Date(`${valor}:00-03:00`).toISOString();

const emXHoras = (horas: number) => {
    const d = new Date(Date.now() + horas * 3600_000);
    const sp = new Date(d.getTime() - 3 * 3600_000);
    return sp.toISOString().slice(0, 16);
};

export function SandboxSimulators({
    sessionId,
    ownerId,
    conversationId,
    contato,
    salas,
    servicos,
    convenios,
    clinicaNome,
    onDone,
}: SandboxSimulatorsProps) {
    const inserirMensagem = async (content: string, messageType: string) => {
        const { error } = await supabase.from("sandbox_messages" as any).insert({
            session_id: sessionId,
            user_id: ownerId,
            conversation_id: conversationId,
            role: "assistant",
            content,
            message_type: messageType,
        });
        if (error) throw error;
    };

    const registrarLog = async (label: string) => {
        await supabase.from("sandbox_api_logs" as any).insert({
            session_id: sessionId,
            user_id: ownerId,
            function_name: "simulador",
            label,
        });
    };

    return (
        <Collapsible defaultOpen={false}>
            <Card data-tour="sandbox-simuladores">
                <CollapsibleTrigger className="group w-full text-left">
                    <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                        <div className="min-w-0">
                            <CardTitle className="text-base">Simuladores</CardTitle>
                            <CardDescription className="mt-1.5">
                                Coloque o paciente fictício na situação que você quer testar. A
                                mensagem aparece no chat como se ele tivesse recebido e você
                                responde no lugar dele.
                            </CardDescription>
                        </div>
                        <ChevronDown className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                    </CardHeader>
                </CollapsibleTrigger>

                <CollapsibleContent>
                <CardContent>
                    <Tabs defaultValue="campanha">
                        <TabsList className="flex-nowrap overflow-x-auto">
                            <TabsTrigger value="campanha" className="shrink-0">Campanha</TabsTrigger>
                            <TabsTrigger value="recorrencia" className="shrink-0">Recorrência</TabsTrigger>
                            <TabsTrigger value="confirmacao" className="shrink-0">Confirmação</TabsTrigger>
                            <TabsTrigger value="venda" className="shrink-0">Venda</TabsTrigger>
                            <TabsTrigger value="convenio" className="shrink-0">Convênio</TabsTrigger>
                        </TabsList>

                        <TabsContent value="campanha" className="pt-4">
                            <CampanhaSim
                                modo="manual"
                                sessionId={sessionId}
                                ownerId={ownerId}
                                salas={salas}
                                servicos={servicos}
                                inserirMensagem={inserirMensagem}
                                registrarLog={registrarLog}
                                onDone={onDone}
                            />
                        </TabsContent>

                        <TabsContent value="recorrencia" className="pt-4">
                            <CampanhaSim
                                modo="recurrence"
                                sessionId={sessionId}
                                ownerId={ownerId}
                                salas={salas}
                                servicos={servicos}
                                inserirMensagem={inserirMensagem}
                                registrarLog={registrarLog}
                                onDone={onDone}
                            />
                        </TabsContent>

                        <TabsContent value="confirmacao" className="pt-4">
                            <ConfirmacaoSim
                                sessionId={sessionId}
                                ownerId={ownerId}
                                contato={contato}
                                salas={salas}
                                servicos={servicos}
                                clinicaNome={clinicaNome}
                                inserirMensagem={inserirMensagem}
                                registrarLog={registrarLog}
                                onDone={onDone}
                            />
                        </TabsContent>

                        <TabsContent value="venda" className="pt-4">
                            <VendaSim
                                sessionId={sessionId}
                                ownerId={ownerId}
                                contato={contato}
                                servicos={servicos}
                                registrarLog={registrarLog}
                                onDone={onDone}
                            />
                        </TabsContent>

                        <TabsContent value="convenio" className="pt-4">
                            <ConvenioSim
                                contato={contato}
                                convenios={convenios}
                                registrarLog={registrarLog}
                                onDone={onDone}
                            />
                        </TabsContent>
                    </Tabs>
                </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}

// ── Campanha / Recorrência ───────────────────────────────────────────────────

const RECORRENCIA_LABEL: Record<string, string> = {
    "1": "1ª mensagem — lembrete do retorno",
    "2": "2ª mensagem — reforço com condição",
    "3": "3ª mensagem — última tentativa",
};

function CampanhaSim({
    modo,
    sessionId,
    ownerId,
    salas,
    servicos,
    inserirMensagem,
    registrarLog,
    onDone,
}: {
    modo: "manual" | "recurrence";
    sessionId: string;
    ownerId: string;
    salas: CatalogoSala[];
    servicos: CatalogoServico[];
    inserirMensagem: (content: string, tipo: string) => Promise<void>;
    registrarLog: (label: string) => Promise<void>;
    onDone: () => void;
}) {
    const recorrencia = modo === "recurrence";
    const [nome, setNome] = useState(recorrencia ? "Recorrência de teste" : "Campanha de teste");
    const [tag, setTag] = useState("");
    const [objetivo, setObjetivo] = useState("");
    const [prompt, setPrompt] = useState("");
    const [mensagem, setMensagem] = useState("");
    const [servicoIds, setServicoIds] = useState<string[]>([]);
    const [salaIds, setSalaIds] = useState<string[]>([]);
    const [desconto, setDesconto] = useState("");
    const [msgNumero, setMsgNumero] = useState("1");

    const disparar = useMutation({
        mutationFn: async () => {
            const texto = mensagem.trim();
            if (!texto) throw new Error("Escreva a mensagem que o paciente vai receber.");

            // Só uma campanha ativa por vez: o payload sempre leva a mais recente
            const { error: offError } = await supabase
                .from("sandbox_campaigns" as any)
                .update({ is_active: false })
                .eq("session_id", sessionId)
                .eq("is_active", true);
            if (offError) throw offError;

            const { error } = await supabase.from("sandbox_campaigns" as any).insert({
                session_id: sessionId,
                user_id: ownerId,
                name: nome.trim() || (recorrencia ? "Recorrência de teste" : "Campanha de teste"),
                campaign_tag: tag.trim() || null,
                objective: recorrencia ? null : (objetivo.trim() || null),
                ai_prompt: recorrencia ? null : (prompt.trim() || null),
                initial_message: texto,
                services: servicoIds
                    .map((id) => servicos.find((s) => s.id === id)?.label)
                    .filter(Boolean),
                professionals: salaIds
                    .map((id) => salas.find((s) => s.id === id)?.name)
                    .filter(Boolean),
                discount_pct: desconto ? Number(desconto) : null,
                ia_enabled: true,
                source_type: recorrencia ? "recurrence" : "manual",
                recurrence_msg_number: recorrencia ? Number(msgNumero) : null,
                is_active: true,
            });
            if (error) throw error;

            await inserirMensagem(texto, "campaign");
            await registrarLog(
                recorrencia
                    ? `Recorrência simulada (${msgNumero}ª mensagem) enviada ao paciente`
                    : `Campanha "${nome}" simulada e enviada ao paciente`,
            );
        },
        onSuccess: () => {
            onDone();
            toast.success("Mensagem entregue no chat. Responda como o paciente responderia.");
        },
        onError: (e: any) => toast.error(e?.message || "Não foi possível simular a campanha."),
    });

    return (
        <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                    <Label className="text-xs">Nome</Label>
                    <Input value={nome} onChange={(e) => setNome(e.target.value)} />
                </div>
                {recorrencia
                    ? (
                        <div className="space-y-1.5">
                            <Label className="text-xs">Etapa da recorrência</Label>
                            <Select value={msgNumero} onValueChange={setMsgNumero}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {["1", "2", "3"].map((n) => (
                                        <SelectItem key={n} value={n}>
                                            {RECORRENCIA_LABEL[n]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )
                    : (
                        <div className="space-y-1.5">
                            <Label className="text-xs">Etiqueta da campanha</Label>
                            <Input
                                value={tag}
                                onChange={(e) => setTag(e.target.value)}
                                placeholder="Ex.: Botox Setembro"
                            />
                        </div>
                    )}
            </div>

            {!recorrencia && (
                <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs">Objetivo</Label>
                        <Textarea
                            rows={2}
                            value={objetivo}
                            onChange={(e) => setObjetivo(e.target.value)}
                            placeholder="O que a IA precisa conseguir nesta campanha."
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Instrução extra para a IA</Label>
                        <Textarea
                            rows={2}
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="Opcional: como conduzir a conversa."
                        />
                    </div>
                </div>
            )}

            {recorrencia && (
                <p className="text-xs text-muted-foreground">
                    Objetivo e instrução da recorrência são fixos por etapa, igual à produção. Só o
                    desconto e a mensagem inicial mudam.
                </p>
            )}

            <div className="space-y-1.5">
                <Label className="text-xs">Mensagem que o paciente recebe</Label>
                <Textarea
                    rows={3}
                    value={mensagem}
                    onChange={(e) => setMensagem(e.target.value)}
                    placeholder="Texto livre, do jeito que você mandaria de verdade."
                />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
                <MultiBadgeSelect
                    label="Procedimentos da campanha"
                    opcoes={servicos.map((s) => ({ id: s.id, nome: s.label }))}
                    valor={servicoIds}
                    onChange={setServicoIds}
                />
                <MultiBadgeSelect
                    label="Salas liberadas"
                    opcoes={salas.map((s) => ({ id: s.id, nome: s.name }))}
                    valor={salaIds}
                    onChange={setSalaIds}
                />
                <div className="space-y-1.5">
                    <Label className="text-xs">Desconto (%)</Label>
                    <Input
                        type="number"
                        min={0}
                        max={100}
                        value={desconto}
                        onChange={(e) => setDesconto(e.target.value)}
                    />
                </div>
            </div>

            <Button onClick={() => disparar.mutate()} disabled={disparar.isPending}>
                {disparar.isPending
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Play className="mr-2 h-4 w-4" />}
                Enviar ao paciente
            </Button>
        </div>
    );
}

// ── Confirmação de agendamento ───────────────────────────────────────────────

const FLUXOS = [
    { id: "sys_confirm_24h_v1", label: "Confirmação (véspera)", horas: 24 },
    { id: "sys_reminder_2h_v1", label: "Lembrete (2h antes)", horas: 2 },
    { id: "sys_feedback_24h_v1", label: "Feedback (dia seguinte)", horas: -24 },
];

function ConfirmacaoSim({
    sessionId,
    ownerId,
    contato,
    salas,
    servicos,
    clinicaNome,
    inserirMensagem,
    registrarLog,
    onDone,
}: {
    sessionId: string;
    ownerId: string;
    contato: SandboxContact;
    salas: CatalogoSala[];
    servicos: CatalogoServico[];
    clinicaNome: string;
    inserirMensagem: (content: string, tipo: string) => Promise<void>;
    registrarLog: (label: string) => Promise<void>;
    onDone: () => void;
}) {
    const [fluxo, setFluxo] = useState(FLUXOS[0].id);
    const [servicoId, setServicoId] = useState("");
    const [salaId, setSalaId] = useState("");
    const [quando, setQuando] = useState(emXHoras(24));

    const simular = useMutation({
        mutationFn: async () => {
            const servico = servicos.find((s) => s.id === servicoId);
            if (!servico) throw new Error("Escolha o procedimento do agendamento.");
            if (!salaId) throw new Error("Escolha a sala do agendamento.");

            const inicio = spToIso(quando);
            const duracao = servico.duration_minutes || 30;
            const fim = new Date(new Date(inicio).getTime() + duracao * 60_000).toISOString();
            const passado = new Date(inicio).getTime() < Date.now();

            const { error } = await supabase.from("sandbox_appointments" as any).insert({
                session_id: sessionId,
                user_id: ownerId,
                contact_id: contato.id,
                professional_id: salaId,
                service_id: servico.id,
                title: servico.label,
                start_time: inicio,
                end_time: fim,
                status: passado ? "completed" : "confirmed",
            });
            if (error) throw error;

            // Corpo editado pelo cliente (se houver) ou o texto padrão do sistema
            const { data: custom } = await supabase
                .from("uazapi_automation_messages" as any)
                .select("body")
                .eq("user_id", ownerId)
                .eq("template_name", fluxo)
                .maybeSingle();

            const horario = new Intl.DateTimeFormat("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "America/Sao_Paulo",
            }).format(new Date(inicio));

            const corpo = ((custom as any)?.body || DEFAULT_UAZAPI_BODIES[fluxo] || "")
                .replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m: string, chave: string) => {
                    const valores: Record<string, string> = {
                        nome_cliente: contato.push_name,
                        horario,
                        horarios: horario,
                        clinica: clinicaNome,
                        servico: servico.label,
                        agendamentos: `${horario} — ${servico.label}`,
                    };
                    return valores[chave] ?? m;
                });

            await inserirMensagem(corpo, "template");
            await registrarLog(
                `Mensagem automática simulada: ${
                    FLUXOS.find((f) => f.id === fluxo)?.label
                } para ${servico.label}`,
            );
        },
        onSuccess: () => {
            onDone();
            toast.success("Mensagem enviada ao paciente. Responda e veja a IA interpretar.");
        },
        onError: (e: any) => toast.error(e?.message || "Não foi possível simular a mensagem."),
    });

    return (
        <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
                O template chega sem os botões de propósito: no teste o que importa é ver a IA
                entender a resposta escrita do paciente.
            </p>

            <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                    <Label className="text-xs">Mensagem automática</Label>
                    <Select
                        value={fluxo}
                        onValueChange={(v) => {
                            setFluxo(v);
                            const f = FLUXOS.find((x) => x.id === v);
                            if (f) setQuando(emXHoras(f.horas));
                        }}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {FLUXOS.map((f) => (
                                <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Horário do agendamento</Label>
                    <Input
                        type="datetime-local"
                        value={quando}
                        onChange={(e) => setQuando(e.target.value)}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Procedimento</Label>
                    <Select value={servicoId} onValueChange={setServicoId}>
                        <SelectTrigger>
                            <SelectValue placeholder="Escolha" />
                        </SelectTrigger>
                        <SelectContent>
                            {servicos.map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Sala</Label>
                    <Select value={salaId} onValueChange={setSalaId}>
                        <SelectTrigger>
                            <SelectValue placeholder="Escolha" />
                        </SelectTrigger>
                        <SelectContent>
                            {salas.map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Button onClick={() => simular.mutate()} disabled={simular.isPending}>
                {simular.isPending
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Play className="mr-2 h-4 w-4" />}
                Enviar ao paciente
            </Button>
        </div>
    );
}

// ── Venda ────────────────────────────────────────────────────────────────────

function VendaSim({
    sessionId,
    ownerId,
    contato,
    servicos,
    registrarLog,
    onDone,
}: {
    sessionId: string;
    ownerId: string;
    contato: SandboxContact;
    servicos: CatalogoServico[];
    registrarLog: (label: string) => Promise<void>;
    onDone: () => void;
}) {
    const [servicoId, setServicoId] = useState("");
    const [valor, setValor] = useState("");
    const [pagamento, setPagamento] = useState("cash");

    const lancar = useMutation({
        mutationFn: async () => {
            const servico = servicos.find((s) => s.id === servicoId);
            if (!servico) throw new Error("Escolha o procedimento vendido.");

            const { error } = await supabase.from("sandbox_sales" as any).insert({
                session_id: sessionId,
                user_id: ownerId,
                contact_id: contato.id,
                service_client_id: servico.id,
                service_name: servico.label,
                value: valor ? Number(valor) : (servico.price ?? 0),
                payment_type: pagamento,
            });
            if (error) throw error;

            await registrarLog(
                `Venda de ${servico.label} lançada sem agendamento (a IA vai oferecer o horário)`,
            );
        },
        onSuccess: () => {
            onDone();
            toast.success("Venda lançada. A IA já sabe que o paciente tem esse procedimento pago.");
        },
        onError: (e: any) => toast.error(e?.message || "Não foi possível lançar a venda."),
    });

    return (
        <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
                A venda entra sem agendamento: é assim que a IA descobre que o paciente já pagou um
                procedimento e ainda precisa marcar o horário.
            </p>

            <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                    <Label className="text-xs">Procedimento</Label>
                    <Select
                        value={servicoId}
                        onValueChange={(v) => {
                            setServicoId(v);
                            const s = servicos.find((x) => x.id === v);
                            setValor(s?.price != null ? String(s.price) : "");
                        }}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Escolha" />
                        </SelectTrigger>
                        <SelectContent>
                            {servicos.map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Valor (R$)</Label>
                    <Input
                        type="number"
                        min={0}
                        value={valor}
                        onChange={(e) => setValor(e.target.value)}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Pagamento</Label>
                    <Select value={pagamento} onValueChange={setPagamento}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="cash">À vista</SelectItem>
                            <SelectItem value="installment">Parcelado</SelectItem>
                            <SelectItem value="pending">Em aberto</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Button onClick={() => lancar.mutate()} disabled={lancar.isPending}>
                {lancar.isPending
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Play className="mr-2 h-4 w-4" />}
                Lançar venda
            </Button>
        </div>
    );
}

// ── Convênio ─────────────────────────────────────────────────────────────────

function ConvenioSim({
    contato,
    convenios,
    registrarLog,
    onDone,
}: {
    contato: SandboxContact;
    convenios: CatalogoConvenio[];
    registrarLog: (label: string) => Promise<void>;
    onDone: () => void;
}) {
    const [selecionados, setSelecionados] = useState<string[]>(contato.convenio_ids || []);

    const salvar = useMutation({
        mutationFn: async () => {
            const { error } = await supabase
                .from("sandbox_contacts" as any)
                .update({ convenio_ids: selecionados, updated_at: new Date().toISOString() })
                .eq("id", contato.id);
            if (error) throw error;

            const nomes = selecionados
                .map((id) => convenios.find((c) => c.id === id)?.nome)
                .filter(Boolean);
            await registrarLog(
                nomes.length
                    ? `Paciente passou a ter os convênios: ${nomes.join(", ")}`
                    : "Paciente voltou a ser particular (sem convênio)",
            );
        },
        onSuccess: () => {
            onDone();
            toast.success("Convênios atualizados no paciente fictício.");
        },
        onError: (e: any) => toast.error(e?.message || "Não foi possível salvar os convênios."),
    });

    if (convenios.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                Nenhum convênio cadastrado. Crie em Equipe &gt; Convênios para testar preços e
                horários dedicados.
            </p>
        );
    }

    return (
        <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
                Marque os convênios que o paciente fictício possui. A IA passa a oferecer o preço e
                os horários dedicados de cada um.
            </p>

            <div className="flex flex-wrap gap-2">
                {convenios.map((c) => {
                    const marcado = selecionados.includes(c.id);
                    return (
                        <Badge
                            key={c.id}
                            variant={marcado ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() =>
                                setSelecionados(
                                    marcado
                                        ? selecionados.filter((id) => id !== c.id)
                                        : [...selecionados, c.id],
                                )}
                        >
                            {c.nome}
                        </Badge>
                    );
                })}
            </div>

            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
                {salvar.isPending
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Play className="mr-2 h-4 w-4" />}
                Aplicar ao paciente
            </Button>
        </div>
    );
}

// ── Seleção múltipla em badges ───────────────────────────────────────────────

function MultiBadgeSelect({
    label,
    opcoes,
    valor,
    onChange,
}: {
    label: string;
    opcoes: { id: string; nome: string }[];
    valor: string[];
    onChange: (v: string[]) => void;
}) {
    return (
        <div className="space-y-1.5">
            <Label className="text-xs">{label}</Label>
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                {opcoes.length === 0 && (
                    <span className="text-xs text-muted-foreground">Nada cadastrado.</span>
                )}
                {opcoes.map((o) => {
                    const marcado = valor.includes(o.id);
                    return (
                        <Badge
                            key={o.id}
                            variant={marcado ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() =>
                                onChange(
                                    marcado
                                        ? valor.filter((id) => id !== o.id)
                                        : [...valor, o.id],
                                )}
                        >
                            {o.nome}
                        </Badge>
                    );
                })}
            </div>
        </div>
    );
}
