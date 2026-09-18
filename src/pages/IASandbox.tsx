import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FlaskConical, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { useUserRole } from "@/hooks/useUserRole";
import { startSuporteTour } from "@/lib/suporteTours";
import {
    useSandboxActions,
    useSandboxMessages,
    useSandboxPanels,
    useSandboxSession,
} from "@/hooks/useSandbox";
import { useSandboxCatalog } from "@/components/sandbox/useSandboxCatalog";
import { SandboxTokenBar } from "@/components/sandbox/SandboxTokenBar";
import { SandboxTonePanel } from "@/components/sandbox/SandboxTonePanel";
import { SandboxChat } from "@/components/sandbox/SandboxChat";
import {
    SandboxAgendaCard,
    SandboxCrmCardPanel,
    SandboxLogsCard,
    SandboxPacienteCard,
} from "@/components/sandbox/SandboxPanels";
import { SandboxSimulators } from "@/components/sandbox/SandboxSimulators";

/**
 * Ambiente Sandbox da IA (/ia-sandbox).
 *
 * Aqui o cliente conversa com a própria IA sem nada sair por WhatsApp: as
 * mensagens, os agendamentos, o CRM e as vendas vivem nas tabelas `sandbox_*`.
 * O fluxo do n8n é o MESMO de produção — só as chamadas de API trocam para as
 * versões `-sandbox`, que só enxergam este ambiente.
 *
 * A IA responde de forma assíncrona, então o chat entra em polling curto
 * enquanto a resposta não chega (`aguardando`).
 */

/** Limite gentil: acima disso avisamos o custo, mas não bloqueamos o teste. */
const AVISO_MENSAGENS = 50;

export default function IASandbox() {
    const navigate = useNavigate();
    const { data: userRole } = useUserRole();
    const { data: ownerId } = useOwnerId();
    const [searchParams, setSearchParams] = useSearchParams();

    const { data: sandbox, isLoading: carregandoSessao, error: erroSessao } = useSandboxSession();
    const sessionId = sandbox?.session.id;
    const contato = sandbox?.contact;
    const conversationId = sandbox?.conversationId;

    const [aguardando, setAguardando] = useState(false);
    const respostasVistas = useRef(0);
    const avisouVolume = useRef(false);

    const { data: mensagens, isLoading: carregandoMsgs } = useSandboxMessages(
        sessionId,
        contato?.ia_context_reset_at,
        aguardando,
    );
    const { logs, crm, agenda, vendas, tokens } = useSandboxPanels(sessionId, aguardando);
    const { data: catalogo } = useSandboxCatalog();
    const { enviar, alterarAgenda, salvarPaciente, resetar, invalidar } =
        useSandboxActions(sessionId);

    // Nome da clínica para renderizar as variáveis dos templates automáticos
    const { data: clinicaNome } = useQuery({
        queryKey: ["sandbox", "clinica", ownerId],
        enabled: !!ownerId,
        staleTime: 5 * 60 * 1000,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("ia_config" as any)
                .select("name")
                .eq("user_id", ownerId!)
                .maybeSingle();
            if (error) throw error;
            return ((data as any)?.name as string) || "a clínica";
        },
    });

    // Só admin e supervisor mexem no ambiente de teste da IA
    useEffect(() => {
        if (userRole && userRole !== "admin" && userRole !== "supervisor") {
            navigate("/", { replace: true });
        }
    }, [userRole, navigate]);

    // Tour guiado vindo da página Suporte (?tour=sandbox-testar)
    const tourId = searchParams.get("tour");
    useEffect(() => {
        if (!tourId || carregandoSessao) return;
        const t = setTimeout(() => {
            startSuporteTour(tourId);
            setSearchParams({}, { replace: true });
        }, 400);
        return () => clearTimeout(t);
    }, [tourId, carregandoSessao, setSearchParams]);

    // A resposta da IA chega pelo polling: quando aparece uma nova, para de esperar
    const totalRespostas = useMemo(
        () => (mensagens || []).filter((m) => m.role === "assistant").length,
        [mensagens],
    );
    useEffect(() => {
        if (aguardando && totalRespostas > respostasVistas.current) {
            setAguardando(false);
        }
        respostasVistas.current = totalRespostas;
    }, [totalRespostas, aguardando]);

    useEffect(() => {
        if (avisouVolume.current) return;
        if ((mensagens || []).length >= AVISO_MENSAGENS) {
            avisouVolume.current = true;
            toast.warning(
                "Este teste já passou de 50 mensagens. Se terminou, use Resetar ambiente para não continuar consumindo.",
            );
        }
    }, [mensagens]);

    const onEnviar = (texto: string) => {
        setAguardando(true);
        enviar.mutate(
            { text: texto },
            {
                onError: (e: any) => {
                    setAguardando(false);
                    toast.error(e?.message || "Não foi possível enviar a mensagem.");
                },
            },
        );
    };

    const onLimpar = () => {
        enviar.mutate(
            { text: "LIMPAR", resetContext: true },
            {
                onSuccess: () => toast.success("Memória da IA limpa. A conversa recomeça do zero."),
                onError: (e: any) =>
                    toast.error(e?.message || "Não foi possível limpar a memória da IA."),
            },
        );
    };

    const onTrocarAgenda = (modo: "real" | "livre") => {
        alterarAgenda.mutate(modo, {
            onSuccess: () =>
                toast.success(
                    modo === "real"
                        ? "A IA passa a respeitar a agenda real da clínica."
                        : "Agenda liberada: a IA oferece qualquer horário dentro do expediente.",
                ),
            onError: () => toast.error("Não foi possível trocar o modo da agenda."),
        });
    };

    const onResetar = () => {
        resetar.mutate(undefined, {
            onSuccess: () => {
                respostasVistas.current = 0;
                avisouVolume.current = false;
                setAguardando(false);
                toast.success("Ambiente de teste zerado.");
            },
            onError: () => toast.error("Não foi possível resetar o ambiente de teste."),
        });
    };

    if (carregandoSessao) {
        return (
            <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Preparando o ambiente de teste...
            </div>
        );
    }

    if (erroSessao || !sandbox || !sessionId || !contato || !conversationId) {
        return (
            <div className="w-full p-4 md:p-8">
                <div className="rounded-2xl border-2 border-dashed p-10 text-center">
                    <p className="font-medium">Não foi possível abrir o ambiente de teste</p>
                    <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                        Recarregue a página. Se continuar assim, fale com o suporte pelo botão de
                        ajuda no canto da tela.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full space-y-4 p-4 md:space-y-6 md:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="flex items-center gap-2 text-xl font-bold">
                        <FlaskConical className="h-5 w-5 text-primary" /> Ambiente de teste da IA
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Converse com a sua IA sem enviar nada por WhatsApp. Tudo aqui é de mentira:
                        paciente, agenda, vendas e CRM vivem só neste ambiente.
                    </p>
                </div>

                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="outline" disabled={resetar.isPending}>
                            {resetar.isPending
                                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                : <RotateCcw className="mr-2 h-4 w-4" />}
                            Resetar ambiente
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Apagar tudo do ambiente de teste?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Some do banco a conversa, o paciente fictício, os agendamentos, as
                                vendas, o CRM, as campanhas simuladas e o histórico de consumo deste
                                teste. Um ambiente novo e vazio é criado no lugar. A sua conta de
                                verdade não é afetada — e isso não tem volta.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={onResetar}>
                                Apagar e recomeçar
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>

            <SandboxTokenBar totais={tokens.data} />

            <SandboxTonePanel sessionId={sessionId} savedSettings={sandbox.session.tone_settings} />

            <div className="grid gap-4 lg:grid-cols-5">
                <div className="lg:col-span-3">
                    <SandboxChat
                        mensagens={mensagens || []}
                        carregando={carregandoMsgs}
                        aguardandoResposta={aguardando}
                        enviando={enviar.isPending}
                        agendaMode={sandbox.session.agenda_mode}
                        onEnviar={onEnviar}
                        onLimpar={onLimpar}
                        onTrocarAgenda={onTrocarAgenda}
                        pacienteNome={contato.push_name}
                    />
                </div>

                <div className="space-y-4 lg:col-span-2">
                    <SandboxPacienteCard
                        contato={contato}
                        convenios={catalogo?.convenios || []}
                        salvando={salvarPaciente.isPending}
                        onSalvar={(patch) =>
                            salvarPaciente.mutate(
                                { contactId: contato.id, patch },
                                {
                                    onSuccess: () => toast.success("Paciente de teste atualizado."),
                                    onError: () =>
                                        toast.error("Não foi possível salvar o paciente de teste."),
                                },
                            )
                        }
                    />
                    <SandboxLogsCard logs={logs.data || []} />
                    <SandboxCrmCardPanel
                        cards={crm.data?.cards || []}
                        historico={crm.data?.historico || []}
                    />
                    <SandboxAgendaCard
                        agendamentos={agenda.data || []}
                        vendas={vendas.data || []}
                        salas={catalogo?.salas || []}
                        servicos={catalogo?.servicos || []}
                    />
                </div>
            </div>

            <SandboxSimulators
                sessionId={sessionId}
                ownerId={sandbox.session.user_id}
                conversationId={conversationId}
                contato={contato}
                salas={catalogo?.salas || []}
                servicos={catalogo?.servicos || []}
                convenios={catalogo?.convenios || []}
                clinicaNome={clinicaNome || "a clínica"}
                onDone={invalidar}
            />
        </div>
    );
}
