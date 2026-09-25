// Card "Consumo de IA (OpenAI)" do Super Admin, por conta.
//
// Existe porque até aqui o painel só sabia ESTIMAR: a plataforma usava uma chave
// única, então o custo de cada cliente saía de `token_usage_log` (tabela de
// preços × tokens). Quando a conta tem projeto próprio na OpenAI, o número passa
// a ser a fatura real do projeto (Costs API) e o "Gasto Clinbia" é esse custo
// real com a margem da conta aplicada.
//
// Toda a regra de "é estimativa ou é real" mora na RPC
// `admin_get_openai_account_usage` (campo `is_estimated`), não aqui.
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { mensagemDoErroDaFuncao } from "@/lib/functionError";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    AlertTriangle,
    Archive,
    BadgeDollarSign,
    Bot,
    Loader2,
    RefreshCw,
    Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useExchangeRate } from "@/hooks/useExchangeRate";
import { toast } from "sonner";

interface OpenAIAccountUsage {
    key_source: string | null;
    project_id: string | null;
    is_estimated: boolean;
    spend_limit_usd: number | null;
    spend_alert_threshold: number | null;
    spend_alert_level: number | null;
    markup: number | null;
    real_cost_usd: number | null;
    clinbia_cost_usd: number | null;
    input_tokens: number | null;
    input_cached_tokens: number | null;
    output_tokens: number | null;
    num_model_requests: number | null;
    synced_at: string | null;
    provisioned_at: string | null;
    provision_error: string | null;
}

interface OpenAIAccountCardProps {
    profileId: string;
    canEdit: boolean;
    /** Chamado quando o provisionamento/arquivamento muda o estado da chave. */
    onAccountChanged?: () => void;
}

const usd = (v: number | null | undefined) =>
    `US$ ${(Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const int = (v: number | null | undefined) => (Number(v) || 0).toLocaleString("pt-BR");

const dateTime = (iso: string | null) =>
    iso
        ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
        : null;

const OpenAIAccountCard = ({ profileId, canEdit, onAccountChanged }: OpenAIAccountCardProps) => {
    const { convertToReal } = useExchangeRate();
    const [usage, setUsage] = useState<OpenAIAccountUsage | null>(null);
    const [loading, setLoading] = useState(true);
    const [provisioning, setProvisioning] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [savingLimit, setSavingLimit] = useState(false);
    const [archiving, setArchiving] = useState(false);
    const [limitInput, setLimitInput] = useState("");
    const [confirmArchive, setConfirmArchive] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await (supabase.rpc as any)("admin_get_openai_account_usage", {
                p_profile_id: profileId,
            });
            if (error) throw error;
            const row = Array.isArray(data) ? data[0] : data;
            setUsage((row as OpenAIAccountUsage) ?? null);
            setLimitInput(row?.spend_limit_usd ? String(row.spend_limit_usd) : "");
        } catch (err: any) {
            setUsage(null);
            toast.error("Erro ao carregar o consumo da OpenAI: " + err.message);
        } finally {
            setLoading(false);
        }
    }, [profileId]);

    useEffect(() => {
        load();
    }, [load]);

    /** As 4 ações de projeto passam pela mesma edge function (guard de admin + service role). */
    const callAccountAction = async (body: Record<string, unknown>) => {
        const { data, error } = await supabase.functions.invoke("admin-openai-account", { body: { profileId, ...body } });
        if (error) throw new Error(await mensagemDoErroDaFuncao(error, "Falha na operação"));
        if (!data?.success) throw new Error(data?.error || "Falha na operação");
        return data;
    };

    const handleProvision = async () => {
        setProvisioning(true);
        try {
            const data = await callAccountAction({ action: "provision" });
            toast.success(
                data.status === "already_provisioned"
                    ? "A conta já tinha projeto na OpenAI."
                    : `Projeto criado: ${data.project_name}`,
            );
            (data.warnings || []).forEach((w: string) => toast.warning(w));
            await load();
            onAccountChanged?.();
        } catch (err: any) {
            toast.error("Erro ao provisionar: " + err.message);
        } finally {
            setProvisioning(false);
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        try {
            await callAccountAction({ action: "sync" });
            toast.success("Consumo atualizado.");
            await load();
        } catch (err: any) {
            toast.error("Erro ao sincronizar: " + err.message);
        } finally {
            setSyncing(false);
        }
    };

    const handleSaveLimit = async () => {
        // Campo vazio REMOVE o teto — é o padrão da conta desde 22/09/2026
        // (sem corte de consumo; o controle é por alerta).
        const clearing = String(limitInput).trim() === "";
        const limitUsd = clearing ? null : Number(String(limitInput).replace(",", "."));
        if (!clearing && (!Number.isFinite(limitUsd as number) || (limitUsd as number) <= 0)) {
            toast.error("Informe um limite em dólares maior que zero, ou deixe vazio para não ter teto.");
            return;
        }
        setSavingLimit(true);
        try {
            const data = await callAccountAction({ action: "set_spend_limit", limitUsd });
            if (data.warning) toast.warning(data.warning);
            else if (clearing) toast.success("Teto removido: a conta passa a consumir sem corte.");
            else toast.success("Limite aplicado no projeto da OpenAI.");
            await load();
        } catch (err: any) {
            toast.error("Erro ao salvar o limite: " + err.message);
        } finally {
            setSavingLimit(false);
        }
    };

    const handleArchive = async () => {
        setArchiving(true);
        try {
            const data = await callAccountAction({ action: "archive_project", confirm: true });
            toast.success(data.message || "Projeto arquivado.");
            setConfirmArchive(false);
            await load();
            onAccountChanged?.();
        } catch (err: any) {
            toast.error("Erro ao arquivar: " + err.message);
        } finally {
            setArchiving(false);
        }
    };

    const sourceBadge = () => {
        if (usage?.key_source === "platform") {
            return <Badge className="bg-emerald-600 hover:bg-emerald-600">projeto da plataforma</Badge>;
        }
        if (usage?.key_source === "customer") {
            return <Badge className="bg-blue-600 hover:bg-blue-600">chave do cliente</Badge>;
        }
        return <Badge variant="outline" className="border-gray-600 text-gray-300">chave compartilhada</Badge>;
    };

    const syncedAt = dateTime(usage?.synced_at ?? null);
    const limit = Number(usage?.spend_limit_usd) || 0;
    const real = Number(usage?.real_cost_usd) || 0;
    const ratio = limit > 0 ? real / limit : 0;
    const threshold = Number(usage?.spend_alert_threshold) || 0.8;
    const cachedPct =
        Number(usage?.input_tokens) > 0
            ? Math.round((Number(usage?.input_cached_tokens) / Number(usage?.input_tokens)) * 100)
            : 0;

    return (
        <Card className="bg-gray-900 border-gray-700">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg text-white flex items-center gap-2 flex-wrap">
                    <Bot className="w-5 h-5 text-emerald-500" />
                    Consumo de IA (OpenAI)
                    {!loading && sourceBadge()}
                    <span className="text-xs font-normal text-gray-500">mês corrente</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {loading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
                    </div>
                ) : !usage ? (
                    <p className="text-sm text-gray-400">Sem dados de consumo para esta conta.</p>
                ) : (
                    <>
                        {usage.provision_error && (
                            <Alert className="bg-red-900/50 border-red-700">
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                                <AlertDescription className="text-red-300 ml-2">
                                    Último provisionamento falhou: {usage.provision_error}
                                </AlertDescription>
                            </Alert>
                        )}

                        {usage.is_estimated ? (
                            <Alert className="bg-amber-900/40 border-amber-700">
                                <Sparkles className="h-4 w-4 text-amber-500" />
                                <AlertDescription className="text-amber-200 ml-2 space-y-2">
                                    <p>
                                        {usage.key_source === "customer"
                                            ? "A conta usa a chave do próprio cliente: a fatura é dele, não da Clinbia. O número acima é estimativa por tokens."
                                            : "A conta ainda roda na chave compartilhada da plataforma, então não existe fatura separada dela. O valor mostrado em “Consumo de Tokens” é estimativa por tokens."}
                                    </p>
                                    {canEdit && usage.key_source !== "customer" && (
                                        <Button
                                            onClick={handleProvision}
                                            disabled={provisioning}
                                            size="sm"
                                            className="bg-emerald-600 hover:bg-emerald-700"
                                        >
                                            {provisioning ? (
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            ) : (
                                                <Sparkles className="w-4 h-4 mr-2" />
                                            )}
                                            Provisionar projeto OpenAI
                                        </Button>
                                    )}
                                </AlertDescription>
                            </Alert>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="rounded-lg bg-gray-800 border border-gray-700 p-3">
                                        <p className="text-xs text-gray-400 flex items-center gap-1.5">
                                            <BadgeDollarSign className="w-3.5 h-3.5 text-emerald-500" />
                                            Gasto Clinbia
                                            {Number(usage.markup) > 0 && (
                                                <span className="text-gray-500">
                                                    (custo + {Math.round(Number(usage.markup) * 100)}%)
                                                </span>
                                            )}
                                            {Number(usage.markup) === 0 && <span className="text-gray-500">(sem margem)</span>}
                                        </p>
                                        <p className="text-xl font-semibold text-emerald-400">{usd(usage.clinbia_cost_usd)}</p>
                                        <p className="text-xs text-gray-500">{convertToReal(Number(usage.clinbia_cost_usd) || 0)}</p>
                                    </div>
                                    <div className="rounded-lg bg-gray-800 border border-gray-700 p-3">
                                        <p className="text-xs text-gray-400">Gasto real na OpenAI</p>
                                        <p className="text-xl font-semibold text-white">{usd(usage.real_cost_usd)}</p>
                                        <p className="text-xs text-gray-500">{convertToReal(real)}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                                    <div>
                                        <p className="text-xs text-gray-400">Entrada</p>
                                        <p className="text-white font-medium">{int(usage.input_tokens)}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400">Em cache</p>
                                        <p className="text-white font-medium">
                                            {int(usage.input_cached_tokens)} <span className="text-gray-500">({cachedPct}%)</span>
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400">Saída</p>
                                        <p className="text-white font-medium">{int(usage.output_tokens)}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400">Requisições</p>
                                        <p className="text-white font-medium">{int(usage.num_model_requests)}</p>
                                    </div>
                                </div>

                                {limit > 0 && (
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-gray-400">
                                                Limite mensal {usd(limit)} — {Math.round(ratio * 100)}% consumido
                                            </span>
                                            {usage.spend_alert_level !== null && (
                                                <span className="text-amber-400">
                                                    alerta de {Math.round(Number(usage.spend_alert_level) * 100)}% já disparado
                                                </span>
                                            )}
                                        </div>
                                        <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                                            <div
                                                className={`h-full ${ratio >= 1 ? "bg-red-500" : ratio >= threshold ? "bg-amber-500" : "bg-emerald-500"}`}
                                                style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-gray-500">
                                    <span>
                                        {syncedAt ? `Atualizado em ${syncedAt}` : "Nunca sincronizado"}
                                        {usage.project_id && <> · projeto <span className="font-mono">{usage.project_id}</span></>}
                                    </span>
                                    <Button
                                        onClick={handleSync}
                                        disabled={syncing}
                                        size="sm"
                                        variant="outline"
                                        className="border-gray-600 text-gray-300 hover:bg-gray-700"
                                    >
                                        {syncing ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <RefreshCw className="w-3.5 h-3.5" />
                                        )}
                                        <span className="ml-1.5">Sincronizar agora</span>
                                    </Button>
                                </div>

                                {canEdit && (
                                    <div className="flex items-end gap-2 flex-wrap pt-2 border-t border-gray-700">
                                        <div className="space-y-1">
                                            <label className="text-xs text-gray-400">
                                                Limite mensal (US$) — vazio = sem teto
                                            </label>
                                            <Input
                                                value={limitInput}
                                                onChange={(e) => setLimitInput(e.target.value)}
                                                inputMode="decimal"
                                                placeholder="sem teto"
                                                className="bg-gray-800 border-gray-700 text-white w-32 h-9"
                                            />
                                        </div>
                                        <Button
                                            onClick={handleSaveLimit}
                                            disabled={savingLimit}
                                            size="sm"
                                            className="bg-blue-600 hover:bg-blue-700 h-9"
                                        >
                                            {savingLimit ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar limite"}
                                        </Button>
                                        <Button
                                            onClick={() => setConfirmArchive(true)}
                                            disabled={archiving}
                                            size="sm"
                                            variant="destructive"
                                            className="h-9 ml-auto"
                                        >
                                            <Archive className="w-4 h-4 mr-1.5" />
                                            Arquivar projeto
                                        </Button>
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </CardContent>

            <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
                <AlertDialogContent className="bg-gray-900 border-gray-700">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">Arquivar o projeto na OpenAI?</AlertDialogTitle>
                        <AlertDialogDescription className="text-gray-400">
                            A chave da conta deixa de funcionar na hora e a conta volta para a chave compartilhada da
                            plataforma (o painel mostra “estimado” de novo). O consumo já coletado continua no histórico.
                            A credencial dessa conta no n8n precisa ser trocada de volta.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700">
                            Cancelar
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                handleArchive();
                            }}
                            disabled={archiving}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {archiving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            Arquivar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
};

export default OpenAIAccountCard;
