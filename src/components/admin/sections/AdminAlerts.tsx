// @ts-nocheck - tabelas/RPCs de monitoramento não estão nos types gerados
//
// Painel de Alertas (/admin?tab=alertas).
//
// Lê SÓ por RPC: as 5 tabelas de monitoramento não têm grant para `authenticated`
// (migration 20260923100000, seção 9), então um `.from("incidents")` aqui voltaria
// vazio sem erro. Toda leitura passa por admin_* com admin_can('alertas') no corpo.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    AlertTriangle,
    BellOff,
    Check,
    ChevronDown,
    Clock,
    Eye,
    FlaskConical,
    RefreshCw,
    Search,
    Send,
    Siren,
    Wallet,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const SEV = {
    critica: { label: "Crítica", dot: "bg-red-500", text: "text-red-400", border: "border-red-500/40" },
    alta: { label: "Alta", dot: "bg-orange-500", text: "text-orange-400", border: "border-orange-500/40" },
    media: { label: "Média", dot: "bg-yellow-500", text: "text-yellow-400", border: "border-yellow-500/40" },
    baixa: { label: "Baixa", dot: "bg-sky-500", text: "text-sky-400", border: "border-sky-500/40" },
};

const sev = (s) => SEV[s] ?? { label: "Sem análise", dot: "bg-gray-500", text: "text-gray-400", border: "border-gray-700" };

const quando = (iso) =>
    iso ? format(new Date(iso), "dd/MM HH:mm", { locale: ptBR }) : "—";

function Counter({ label, value, tone = "text-white", hint }) {
    return (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
            <p className={`text-2xl font-bold ${tone}`}>{value ?? 0}</p>
            {hint && <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p>}
        </div>
    );
}

function Campo({ titulo, children }) {
    if (!children) return null;
    return (
        <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-500">{titulo}</p>
            <p className="text-sm text-gray-200 whitespace-pre-wrap">{children}</p>
        </div>
    );
}

function Detalhe({ incidentId }) {
    const { data, isLoading } = useQuery({
        queryKey: ["admin-incident-detail", incidentId],
        queryFn: async () => {
            const { data, error } = await supabase.rpc("admin_incident_detail", {
                p_incident_id: incidentId,
            });
            if (error) throw error;
            return data;
        },
    });

    if (isLoading) return <p className="text-sm text-gray-500">Carregando histórico…</p>;

    const eventos = data?.eventos ?? [];
    const envios = data?.envios ?? [];

    return (
        <div className="grid gap-4 md:grid-cols-2">
            <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                    Últimos eventos ({eventos.length})
                </p>
                {eventos.length === 0 ? (
                    <p className="text-sm text-gray-600">Nenhum evento registrado.</p>
                ) : (
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                        {eventos.map((e, i) => (
                            <div key={i} className="bg-gray-900 border border-gray-800 rounded p-2">
                                <p className="text-[11px] text-gray-500">
                                    {quando(e.received_at)} · {e.source} · {e.error_name || "sem nome"}
                                </p>
                                <p className="text-xs text-gray-300 break-words">{e.error_message}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                    Envios ({envios.length})
                </p>
                {envios.length === 0 ? (
                    <p className="text-sm text-gray-600">Nenhuma tentativa de envio.</p>
                ) : (
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                        {envios.map((n, i) => (
                            <div key={i} className="bg-gray-900 border border-gray-800 rounded p-2">
                                <p className="text-[11px] text-gray-500">
                                    {quando(n.sent_at)} · {n.destinatario} ·{" "}
                                    <span className={n.status === "sent" ? "text-green-400" : "text-red-400"}>
                                        {n.status}
                                    </span>
                                    {n.template_name ? ` · ${n.template_name}` : " · texto livre"}
                                </p>
                                {n.error_message && (
                                    <p className="text-xs text-red-300 break-words">
                                        {n.error_code}: {n.error_message}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function AdminAlerts({ canEdit }: { canEdit: boolean }) {
    const qc = useQueryClient();
    const [status, setStatus] = useState("open");
    const [severidade, setSeveridade] = useState("todas");
    const [busca, setBusca] = useState("");
    const [buscaAtiva, setBuscaAtiva] = useState("");
    const [aberto, setAberto] = useState<string | null>(null);
    const [novoSaldo, setNovoSaldo] = useState("");

    const counters = useQuery({
        queryKey: ["admin-incident-counters"],
        refetchInterval: 60_000,
        queryFn: async () => {
            const { data, error } = await supabase.rpc("admin_incident_counters");
            if (error) throw error;
            return data;
        },
    });

    const lista = useQuery({
        queryKey: ["admin-incidents", status, severidade, buscaAtiva],
        refetchInterval: 60_000,
        queryFn: async () => {
            const { data, error } = await supabase.rpc("admin_list_incidents", {
                p_status: status,
                p_severity: severidade,
                p_search: buscaAtiva || null,
                p_limit: 200,
            });
            if (error) throw error;
            return data ?? [];
        },
    });

    const settings = useQuery({
        queryKey: ["admin-alert-settings"],
        queryFn: async () => {
            const { data, error } = await supabase.rpc("admin_alert_settings");
            if (error) throw error;
            return data;
        },
    });

    const mudarStatus = useMutation({
        mutationFn: async ({ id, novo }) => {
            const { error } = await supabase.rpc("admin_set_incident_status", {
                p_incident_id: id,
                p_status: novo,
                p_notes: null,
            });
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Incidente atualizado");
            qc.invalidateQueries({ queryKey: ["admin-incidents"] });
            qc.invalidateQueries({ queryKey: ["admin-incident-counters"] });
        },
        onError: (e) => toast.error(e.message),
    });

    const mudarChave = useMutation({
        mutationFn: async ({ key, value }) => {
            const { error } = await supabase.rpc("admin_set_alert_setting", {
                p_key: key,
                p_value: String(value),
            });
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Configuração salva");
            qc.invalidateQueries({ queryKey: ["admin-alert-settings"] });
        },
        onError: (e) => toast.error(e.message),
    });

    // Simular NAO tem caminho de envio proprio: grava um incidente de verdade
    // pela mesma funcao que o varredor usa. Um botao que falasse direto com a
    // Meta provaria um caminho que nao e o que falhou em 22/09.
    const simular = useMutation({
        mutationFn: async () => {
            const { data, error } = await supabase.rpc("admin_simulate_incident", {
                p_severity: "critica",
            });
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            toast.success(
                "Incidente crítico criado. O despachante roda a cada minuto — o resultado aparece no próprio incidente.",
            );
            qc.invalidateQueries({ queryKey: ["admin-incidents"] });
            qc.invalidateQueries({ queryKey: ["admin-incident-counters"] });
            // o envio sai no proximo minuto; recarrega sozinho para ele nao
            // precisar ficar clicando em Atualizar para ver se chegou.
            setTimeout(() => {
                qc.invalidateQueries({ queryKey: ["admin-incidents"] });
                qc.invalidateQueries({ queryKey: ["admin-incident-counters"] });
            }, 70_000);
        },
        onError: (e) => toast.error(e.message),
    });

    const salvarSaldo = useMutation({
        mutationFn: async ({ saldo, autoRecarga }) => {
            const { error } = await supabase.rpc("admin_set_openai_credit", {
                p_saldo_usd: saldo,
                p_auto_recharge: autoRecarga,
            });
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Saldo registrado");
            qc.invalidateQueries({ queryKey: ["admin-alert-settings"] });
            qc.invalidateQueries({ queryKey: ["admin-incidents"] });
        },
        onError: (e) => toast.error(e.message),
    });

    const testar = useMutation({
        mutationFn: async () => {
            const { data, error } = await supabase.functions.invoke("alert-notify", {
                body: { action: "test", message: "disparo de teste pelo painel de alertas" },
            });
            if (error) throw error;
            return data;
        },
        onSuccess: (d) => {
            const r = d?.resultados?.[0];
            if (r?.status === "sent") toast.success(`Alerta de teste enviado (${r.via})`);
            else toast.error(`Não enviou: ${r?.erro ?? r?.status ?? "motivo desconhecido"}`);
        },
        onError: (e) => toast.error(e.message),
    });

    const c = counters.data ?? {};
    const cfg = settings.data?.config ?? {};
    const destinatarios = settings.data?.destinatarios ?? [];
    const incidentes = lista.data ?? [];

    const saldo = settings.data?.saldo ?? {};

    const canalMudo = !cfg.alert_notify_enabled;
    const enviosFalhando = (c.envios_falhos_24h ?? 0) > 0;
    // Grave, aberto, ja tentou e nao conseguiu avisar NENHUMA vez: e este o
    // estado em que ele nao pode contar com o WhatsApp.
    const mudoDeFato = (c.criticos_sem_aviso ?? 0) > 0;
    // Grave, aberto e ainda nem tentado. Se nao zerar em poucos minutos, quem
    // parou foi o despachante — nao a Meta.
    const parado = (c.aguardando_despacho ?? 0) > 0;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-lg font-semibold text-red-400 flex items-center gap-2">
                    <Siren className="w-5 h-5" />
                    Alertas
                </h3>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            counters.refetch();
                            lista.refetch();
                        }}
                        className="border-gray-700 text-gray-300 hover:text-white"
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Atualizar
                    </Button>
                    {canEdit && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => simular.mutate()}
                            disabled={simular.isPending}
                            className="border-red-500/40 text-red-300 hover:text-white hover:bg-red-600"
                        >
                            <FlaskConical className="w-4 h-4 mr-2" />
                            {simular.isPending ? "Criando…" : "Simular incidente crítico"}
                        </Button>
                    )}
                    {canEdit && (
                        <Button
                            size="sm"
                            onClick={() => testar.mutate()}
                            disabled={testar.isPending}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            <Send className="w-4 h-4 mr-2" />
                            {testar.isPending ? "Enviando…" : "Disparar teste"}
                        </Button>
                    )}
                </div>
            </div>

            {canalMudo && (
                <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/40 rounded-lg px-3 py-2">
                    <BellOff className="w-4 h-4 text-yellow-400 shrink-0" />
                    <p className="text-sm text-yellow-200">
                        O envio por WhatsApp está desligado. Os incidentes continuam sendo gravados e
                        aparecem aqui — só o aviso não sai.
                    </p>
                </div>
            )}

            {mudoDeFato && (
                <div className="flex items-start gap-2 bg-red-500/15 border-2 border-red-500 rounded-lg px-3 py-2.5">
                    <BellOff className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div className="text-sm text-red-100">
                        <p className="font-semibold">
                            Canal mudo: {c.criticos_sem_aviso} incidente(s) grave(s) sem conseguir avisar.
                        </p>
                        <p className="text-red-200/90 mt-0.5">
                            O incidente está gravado, mas nenhuma mensagem chegou ao WhatsApp. Motivo da
                            última falha: <span className="font-mono">{c.ultima_falha_envio ?? "—"}</span>
                            {c.proxima_tentativa && ` · próxima tentativa ${quando(c.proxima_tentativa)}`}
                        </p>
                        <p className="text-red-200/70 text-[11px] mt-0.5">
                            Enquanto os templates não forem aprovados, o aviso depende da janela de 24h da
                            Meta. A tentativa se repete sozinha (2, 5, 15 e depois 30 em 30 min), então o
                            aviso sai assim que você mandar qualquer mensagem para o número remetente.
                        </p>
                    </div>
                </div>
            )}

            {parado && (
                <div className="flex items-start gap-2 bg-orange-500/10 border border-orange-500/40 rounded-lg px-3 py-2">
                    <Clock className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-orange-200">
                        {c.aguardando_despacho} incidente(s) grave(s) na fila de aviso, ainda sem tentativa.
                        O despachante roda a cada minuto — se este número não zerar, foi ele que parou.
                        {c.ultimo_envio_ok && ` Último envio bem-sucedido: ${quando(c.ultimo_envio_ok)}.`}
                    </p>
                </div>
            )}

            {enviosFalhando && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/40 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <p className="text-sm text-red-200">
                        {c.envios_falhos_24h} envio(s) falharam nas últimas 24h. Abra o incidente e veja
                        o motivo em "Envios" — se for template recusado, o canal está dependendo da
                        janela de 24h.
                    </p>
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <Counter label="Abertos" value={c.abertos} tone="text-white" />
                <Counter label="Críticos" value={c.criticos} tone="text-red-400" />
                <Counter label="Altos" value={c.altos} tone="text-orange-400" />
                <Counter label="Sem análise" value={c.sem_analise} tone="text-gray-300" />
                <Counter label="Resolvidos 24h" value={c.resolvidos_24h} tone="text-green-400" />
                <Counter
                    label="Avisos enviados"
                    value={c.envios_ok_1h}
                    tone="text-sky-400"
                    hint={`teto ${cfg.alert_max_per_hour ?? 10}/h`}
                />
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="w-[170px] bg-gray-800 border-gray-700 text-gray-200">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="open">Abertos</SelectItem>
                        <SelectItem value="acknowledged">Reconhecidos</SelectItem>
                        <SelectItem value="resolved">Resolvidos</SelectItem>
                        <SelectItem value="todos">Todos</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={severidade} onValueChange={setSeveridade}>
                    <SelectTrigger className="w-[170px] bg-gray-800 border-gray-700 text-gray-200">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="todas">Todas as gravidades</SelectItem>
                        <SelectItem value="critica">Crítica</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="baixa">Baixa</SelectItem>
                    </SelectContent>
                </Select>

                <div className="flex items-center gap-2">
                    <Input
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && setBuscaAtiva(busca.trim())}
                        placeholder="Componente ou mensagem…"
                        className="w-[240px] bg-gray-800 border-gray-700 text-gray-200"
                    />
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setBuscaAtiva(busca.trim())}
                        className="border-gray-700 text-gray-300 hover:text-white"
                    >
                        <Search className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {lista.isLoading ? (
                <div className="text-center py-12 text-gray-400">Carregando…</div>
            ) : incidentes.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                    <Siren className="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p>Nenhum incidente com esses filtros.</p>
                    <p className="text-xs mt-1">
                        Silêncio aqui só é boa notícia depois que a instrumentação estiver no ar —
                        até lá, ninguém está reportando.
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {incidentes.map((i) => {
                        const s = sev(i.ai_severity);
                        const expandido = aberto === i.id;
                        return (
                            <div
                                key={i.id}
                                className={`bg-gray-800 border rounded-lg ${expandido ? s.border : "border-gray-700"}`}
                            >
                                <button
                                    onClick={() => setAberto(expandido ? null : i.id)}
                                    className="w-full flex items-start gap-3 p-4 text-left"
                                >
                                    <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${s.dot}`} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-medium text-white">{i.component}</span>
                                            <Badge variant="outline" className={`${s.text} border-gray-600`}>
                                                {s.label}
                                            </Badge>
                                            <Badge variant="outline" className="text-gray-400 border-gray-600">
                                                {i.source}
                                            </Badge>
                                            {i.status !== "open" && (
                                                <Badge variant="outline" className="text-gray-400 border-gray-600">
                                                    {i.status === "resolved" ? "Resolvido" : "Reconhecido"}
                                                </Badge>
                                            )}
                                            {i.envios_falhos > 0 && (
                                                <Badge variant="outline" className="text-red-400 border-red-500/40">
                                                    {i.envios_falhos} envio(s) falho(s)
                                                </Badge>
                                            )}
                                            {i.canal_mudo && (
                                                <Badge className="bg-red-600 text-white border-0">
                                                    <BellOff className="w-3 h-3 mr-1" />
                                                    não avisado
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-300 mt-1 truncate">
                                            {i.ai_summary || "Análise ainda não concluída."}
                                        </p>
                                        <p className="text-[11px] text-gray-500 mt-1">
                                            {i.event_count}x · de {quando(i.first_seen)} a {quando(i.last_seen)} ·{" "}
                                            {i.conta}
                                            {i.contas_afetadas > 1 && ` (+${i.contas_afetadas - 1} contas)`}
                                        </p>
                                        {/* a recorrência tem que ser legível SEM abrir o incidente:
                                            é ela que explica por que só chegou uma mensagem. */}
                                        <p className="text-[11px] text-gray-500">
                                            análise IA:{" "}
                                            {i.analyzed_at ? quando(i.analyzed_at) : "ainda não"}
                                            {i.analise_reaproveitada && " (reaproveitada)"} ·{" "}
                                            {i.notified_count > 0
                                                ? `${i.notified_count} aviso(s), último ${quando(i.last_notified_at)}`
                                                : "nunca avisado"}
                                            {i.ocorrencias_desde_ultimo_aviso > 0 &&
                                                i.notified_count > 0 &&
                                                ` · +${i.ocorrencias_desde_ultimo_aviso} desde o último aviso`}
                                        </p>
                                        {/* por que este incidente não avisou, na linha do próprio
                                            incidente: sem isso o "não avisado" seria só um rótulo. */}
                                        {i.notify_failed_count > 0 && (
                                            <p className="text-[11px] text-red-300 mt-1 break-words">
                                                {i.notify_failed_count} tentativa(s) sem sucesso
                                                {i.notify_next_attempt_at &&
                                                    ` · próxima ${quando(i.notify_next_attempt_at)}`}
                                                {i.notify_last_error && ` · ${i.notify_last_error}`}
                                            </p>
                                        )}
                                    </div>
                                    <ChevronDown
                                        className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${expandido ? "rotate-180" : ""}`}
                                    />
                                </button>

                                {expandido && (
                                    <div className="px-4 pb-4 space-y-4 border-t border-gray-700 pt-3">
                                        <div className="grid gap-3 md:grid-cols-2">
                                            <Campo titulo="Causa provável">{i.ai_probable_cause}</Campo>
                                            <Campo titulo="Origem">{i.ai_origin}</Campo>
                                            <Campo titulo="Impacto">{i.ai_impact}</Campo>
                                            <Campo titulo="O que fazer no sistema">{i.ai_fix_system}</Campo>
                                            <Campo titulo="O que fazer no n8n">{i.ai_fix_n8n}</Campo>
                                            <Campo titulo="Anotações">{i.notes}</Campo>
                                        </div>

                                        <Detalhe incidentId={i.id} />

                                        {canEdit && i.status !== "resolved" && (
                                            <div className="flex gap-2">
                                                {i.status === "open" && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="border-gray-700 text-gray-300 hover:text-white"
                                                        onClick={() =>
                                                            mudarStatus.mutate({ id: i.id, novo: "acknowledged" })
                                                        }
                                                    >
                                                        <Eye className="w-4 h-4 mr-2" />
                                                        Reconhecer
                                                    </Button>
                                                )}
                                                <Button
                                                    size="sm"
                                                    className="bg-green-600 hover:bg-green-700 text-white"
                                                    onClick={() =>
                                                        mudarStatus.mutate({ id: i.id, novo: "resolved" })
                                                    }
                                                >
                                                    <Check className="w-4 h-4 mr-2" />
                                                    Resolver
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Saldo da OpenAI ─────────────────────────────────────────────────
                A OpenAI não expõe saldo por API: o número é o que ele digita
                depois de cada recarga. A tela mostra a IDADE desse número em vez
                de fingir precisão — âncora vencida esconde a projeção. */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-4">
                <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-gray-400" />
                    <p className="text-sm font-semibold text-gray-200">Saldo da conta OpenAI</p>
                </div>

                {saldo.tem_ancora === false ? (
                    <p className="text-sm text-gray-400">
                        {saldo.motivo ??
                            "Saldo nunca informado. Preencha abaixo depois da próxima recarga."}
                    </p>
                ) : (
                    <>
                        {saldo.ancora_vencida && (
                            <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/40 rounded px-3 py-2">
                                <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                                <p className="text-sm text-yellow-200">
                                    O saldo informado tem {saldo.dias_desde_ancora} dia(s) — mais que o
                                    limite de {saldo.limite_dias_ancora}. A projeção está escondida de
                                    propósito: atualize o valor abaixo para voltar a ver o saldo estimado.
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <Counter
                                label="Saldo estimado"
                                value={
                                    saldo.saldo_estimado_usd != null
                                        ? `US$ ${saldo.saldo_estimado_usd}`
                                        : "—"
                                }
                                tone={
                                    saldo.saldo_estimado_usd == null
                                        ? "text-gray-500"
                                        : saldo.saldo_estimado_usd < saldo.limite_critico_usd
                                            ? "text-red-400"
                                            : saldo.saldo_estimado_usd < saldo.limite_aviso_usd
                                                ? "text-orange-400"
                                                : "text-green-400"
                                }
                                hint={`crítico abaixo de US$ ${saldo.limite_critico_usd}`}
                            />
                            <Counter
                                label="Informado"
                                value={`US$ ${saldo.saldo_informado_usd}`}
                                tone="text-gray-200"
                                hint={`em ${quando(saldo.informado_em)} · ${saldo.dias_desde_ancora}d atrás`}
                            />
                            <Counter
                                label="Gasto desde então"
                                value={`US$ ${saldo.gasto_desde_ancora_usd}`}
                                tone="text-gray-200"
                                hint={`queima US$ ${saldo.queima_dia_usd}/dia`}
                            />
                            <Counter
                                label="Dias restantes"
                                value={saldo.dias_restantes ?? "—"}
                                tone={
                                    saldo.dias_restantes != null && saldo.dias_restantes < 7
                                        ? "text-red-400"
                                        : "text-gray-200"
                                }
                                hint={
                                    saldo.recarga_automatica
                                        ? "recarga automática ligada"
                                        : "recarga automática DESLIGADA"
                                }
                            />
                        </div>

                        <p className="text-[11px] text-gray-500">
                            Base do cálculo: {saldo.base_do_calculo}. O custo cobrado embute a margem do
                            sistema, então a queima é superestimada — o alerta chega antes da hora, nunca
                            depois.
                        </p>
                    </>
                )}

                {canEdit && (
                    <div className="flex flex-wrap items-end gap-3 border-t border-gray-700 pt-3">
                        <div>
                            <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                                Saldo atual (US$)
                            </p>
                            <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={novoSaldo}
                                onChange={(e) => setNovoSaldo(e.target.value)}
                                placeholder={String(saldo.saldo_informado_usd ?? "0.00")}
                                className="w-32 bg-gray-900 border-gray-700 text-gray-200"
                            />
                        </div>
                        <Button
                            size="sm"
                            disabled={!novoSaldo || salvarSaldo.isPending}
                            onClick={() =>
                                salvarSaldo.mutate(
                                    { saldo: Number(novoSaldo), autoRecarga: null },
                                    { onSuccess: () => setNovoSaldo("") },
                                )
                            }
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            Registrar saldo
                        </Button>
                        <label className="flex items-center gap-2 ml-auto">
                            <span className="text-sm text-gray-300">
                                Recarga automática na OpenAI
                                <span className="block text-[11px] text-gray-500">
                                    Desligada, saldo abaixo de US$ {saldo.limite_aviso_usd ?? 50} vira
                                    crítico na hora.
                                </span>
                            </span>
                            <Switch
                                checked={!!saldo.recarga_automatica}
                                disabled={!saldo.tem_ancora || salvarSaldo.isPending}
                                onCheckedChange={(v) =>
                                    salvarSaldo.mutate({
                                        saldo: saldo.saldo_informado_usd,
                                        autoRecarga: v,
                                    })
                                }
                            />
                        </label>
                    </div>
                )}
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-4">
                <p className="text-sm font-semibold text-gray-200">Canal de alerta</p>

                <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-300">
                            Avisar por WhatsApp
                            <span className="block text-[11px] text-gray-500">
                                Desligar nunca para a gravação do incidente.
                            </span>
                        </span>
                        <Switch
                            checked={!!cfg.alert_notify_enabled}
                            disabled={!canEdit}
                            onCheckedChange={(v) =>
                                mudarChave.mutate({ key: "alert_notify_enabled", value: v })
                            }
                        />
                    </label>

                    <label className="flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-300">
                            Resumo agrupado
                            <span className="block text-[11px] text-gray-500">
                                Junta média e baixa a cada 2h em uma mensagem só.
                            </span>
                        </span>
                        <Switch
                            checked={!!cfg.alert_summary_enabled}
                            disabled={!canEdit}
                            onCheckedChange={(v) =>
                                mudarChave.mutate({ key: "alert_summary_enabled", value: v })
                            }
                        />
                    </label>

                    <label className="flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-300">
                            Analisar com IA
                            <span className="block text-[11px] text-gray-500">
                                Modelo {cfg.alert_analyze_model ?? "—"}; custo interno da plataforma.
                            </span>
                        </span>
                        <Switch
                            checked={!!cfg.alert_analyze_enabled}
                            disabled={!canEdit}
                            onCheckedChange={(v) =>
                                mudarChave.mutate({ key: "alert_analyze_enabled", value: v })
                            }
                        />
                    </label>

                    <label className="flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-300">
                            Varrer falhas do banco
                            <span className="block text-[11px] text-gray-500">
                                Filas e crons que falharam viram incidente sozinhos.
                            </span>
                        </span>
                        <Switch
                            checked={!!cfg.incident_db_scan_enabled}
                            disabled={!canEdit}
                            onCheckedChange={(v) =>
                                mudarChave.mutate({ key: "incident_db_scan_enabled", value: v })
                            }
                        />
                    </label>

                    <label className="flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-300">
                            Teto por hora
                            <span className="block text-[11px] text-gray-500">
                                O excedente vira uma mensagem de resumo, não some.
                            </span>
                        </span>
                        <Input
                            type="number"
                            min={1}
                            max={100}
                            defaultValue={cfg.alert_max_per_hour ?? 10}
                            disabled={!canEdit}
                            onBlur={(e) =>
                                mudarChave.mutate({ key: "alert_max_per_hour", value: e.target.value })
                            }
                            className="w-20 bg-gray-900 border-gray-700 text-gray-200"
                        />
                    </label>

                    <label className="flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-300">
                            Silêncio após avisar (min)
                            <span className="block text-[11px] text-gray-500">
                                Na janela o erro repetido só conta. Depois sai UMA mensagem de
                                recorrência, sem nova análise.
                            </span>
                        </span>
                        <Input
                            type="number"
                            min={0}
                            max={10080}
                            defaultValue={cfg.incident_notify_cooldown_min ?? 60}
                            disabled={!canEdit}
                            onBlur={(e) =>
                                mudarChave.mutate({
                                    key: "incident_notify_cooldown_min",
                                    value: e.target.value,
                                })
                            }
                            className="w-20 bg-gray-900 border-gray-700 text-gray-200"
                        />
                    </label>

                    <label className="flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-300">
                            Reaproveitar análise (min)
                            <span className="block text-[11px] text-gray-500">
                                Erro idêntico que volta nesse prazo copia a análise. Se você tinha
                                dado por resolvido, a IA analisa de novo.
                            </span>
                        </span>
                        <Input
                            type="number"
                            min={0}
                            max={10080}
                            defaultValue={cfg.incident_analyze_cooldown_min ?? 60}
                            disabled={!canEdit}
                            onBlur={(e) =>
                                mudarChave.mutate({
                                    key: "incident_analyze_cooldown_min",
                                    value: e.target.value,
                                })
                            }
                            className="w-20 bg-gray-900 border-gray-700 text-gray-200"
                        />
                    </label>

                    <label className="flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-300">
                            Avisar sobre saldo da OpenAI
                            <span className="block text-[11px] text-gray-500">
                                Desligar não desliga o 429 "sem crédito": esse sai sempre.
                            </span>
                        </span>
                        <Switch
                            checked={!!cfg.openai_balance_alert_enabled}
                            disabled={!canEdit}
                            onCheckedChange={(v) =>
                                mudarChave.mutate({ key: "openai_balance_alert_enabled", value: v })
                            }
                        />
                    </label>

                    <label className="flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-300">
                            Saldo vira aviso em (US$)
                            <span className="block text-[11px] text-gray-500">
                                Abaixo disso o incidente entra como alta.
                            </span>
                        </span>
                        <Input
                            type="number"
                            min={0}
                            step="1"
                            defaultValue={cfg.openai_balance_warn_usd ?? 50}
                            disabled={!canEdit}
                            onBlur={(e) =>
                                mudarChave.mutate({
                                    key: "openai_balance_warn_usd",
                                    value: e.target.value,
                                })
                            }
                            className="w-20 bg-gray-900 border-gray-700 text-gray-200"
                        />
                    </label>

                    <label className="flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-300">
                            Saldo vira crítico em (US$)
                            <span className="block text-[11px] text-gray-500">
                                Abaixo disso, ou com recarga automática desligada, é crítico.
                            </span>
                        </span>
                        <Input
                            type="number"
                            min={0}
                            step="1"
                            defaultValue={cfg.openai_balance_critical_usd ?? 20}
                            disabled={!canEdit}
                            onBlur={(e) =>
                                mudarChave.mutate({
                                    key: "openai_balance_critical_usd",
                                    value: e.target.value,
                                })
                            }
                            className="w-20 bg-gray-900 border-gray-700 text-gray-200"
                        />
                    </label>

                    <label className="flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-300">
                            Saldo informado vence em (dias)
                            <span className="block text-[11px] text-gray-500">
                                Passou disso, a tela esconde a projeção em vez de fingir precisão.
                            </span>
                        </span>
                        <Input
                            type="number"
                            min={1}
                            max={90}
                            defaultValue={cfg.openai_credit_stale_days ?? 7}
                            disabled={!canEdit}
                            onBlur={(e) =>
                                mudarChave.mutate({
                                    key: "openai_credit_stale_days",
                                    value: e.target.value,
                                })
                            }
                            className="w-20 bg-gray-900 border-gray-700 text-gray-200"
                        />
                    </label>
                </div>

                <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                        Quem recebe
                    </p>
                    {destinatarios.length === 0 ? (
                        <p className="text-sm text-gray-600">Nenhum destinatário cadastrado.</p>
                    ) : (
                        <div className="space-y-1">
                            {destinatarios.map((d) => (
                                <div
                                    key={d.id}
                                    className="flex items-center gap-2 text-sm text-gray-300 bg-gray-900 border border-gray-800 rounded px-3 py-2"
                                >
                                    <span className={`w-2 h-2 rounded-full ${d.is_active ? "bg-green-500" : "bg-gray-600"}`} />
                                    <span className="font-medium">{d.nome}</span>
                                    <span className="text-gray-500">{d.telefone}</span>
                                    <span className="text-gray-600">·</span>
                                    <span className="text-gray-500">
                                        {sev(d.min_severity).label} ou pior · {d.janela} · {d.instancia}
                                    </span>
                                    <span className="ml-auto text-[11px] text-gray-500">
                                        último: {quando(d.ultimo_envio)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
