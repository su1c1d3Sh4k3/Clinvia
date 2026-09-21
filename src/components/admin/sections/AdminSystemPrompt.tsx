// @ts-nocheck - system_prompts ainda não está nos types gerados
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileCode2, Loader2, Copy, Check } from "lucide-react";

/**
 * Prompts da PLATAFORMA (linha única em system_prompts), lidos pelos fluxos do
 * n8n através da edge fn `get-system-prompt`. Editar aqui vale para todos os
 * fluxos de uma vez — não existe prompt por cliente nesta tela.
 */
const SLOTS = [
    {
        column: "base_prompt",
        apiKey: "base",
        label: "Prompt Base",
        hint: "Instruções gerais da assistente — usadas em todos os fluxos.",
    },
    {
        column: "qualificacao_prompt",
        apiKey: "campanhas_qualificacao",
        label: "Campanhas de Qualificação",
        hint: "Prompt do fluxo que qualifica os contatos de campanha.",
    },
    {
        column: "agendamento_prompt",
        apiKey: "campanhas_agendamento",
        label: "Campanhas de Agendamento",
        hint: "Prompt do fluxo que leva o contato de campanha até o agendamento.",
    },
    {
        column: "instagram_prompt",
        apiKey: "instagram",
        label: "Prompt Instagram",
        hint: "Prompt do fluxo que atende as conversas do Instagram Direct — onde o contato não tem telefone e o link de agendamento pede identificação.",
    },
] as const;

const EMPTY = {
    base_prompt: "",
    qualificacao_prompt: "",
    agendamento_prompt: "",
    instagram_prompt: "",
};

export default function AdminSystemPrompt({ canEdit }: { canEdit: boolean }) {
    const queryClient = useQueryClient();
    const [draft, setDraft] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ["admin-system-prompts"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("system_prompts" as any)
                .select("base_prompt, qualificacao_prompt, agendamento_prompt, instagram_prompt, updated_at")
                .eq("id", true)
                .maybeSingle();
            if (error) throw error;
            return data;
        },
    });

    useEffect(() => {
        if (!data) return;
        setDraft({
            base_prompt: data.base_prompt || "",
            qualificacao_prompt: data.qualificacao_prompt || "",
            agendamento_prompt: data.agendamento_prompt || "",
            instagram_prompt: data.instagram_prompt || "",
        });
    }, [data]);

    const dirty =
        !!data && SLOTS.some((s) => draft[s.column] !== (data[s.column] || ""));

    const handleSave = async () => {
        setSaving(true);
        try {
            const { data: auth } = await supabase.auth.getUser();
            const { error } = await supabase
                .from("system_prompts" as any)
                .update({
                    ...draft,
                    updated_at: new Date().toISOString(),
                    updated_by: auth?.user?.id ?? null,
                })
                .eq("id", true);
            if (error) throw error;
            await queryClient.invalidateQueries({ queryKey: ["admin-system-prompts"] });
            toast.success("Prompts salvos. Os fluxos do n8n já pegam a versão nova na próxima execução.");
        } catch (e: any) {
            toast.error("Erro ao salvar: " + (e?.message || "tente novamente"));
        } finally {
            setSaving(false);
        }
    };

    // O client do Supabase é criado com a URL fixa do projeto (client.ts), então
    // não dá para ler de uma env aqui.
    const endpoint = "https://swfshqvvbohnahdyndch.supabase.co/functions/v1/get-system-prompt";

    const copyEndpoint = async () => {
        try {
            await navigator.clipboard.writeText(endpoint);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Não foi possível copiar. Selecione o endereço e copie manualmente.");
        }
    };

    if (isLoading) {
        return <div className="text-center py-12 text-gray-400">Carregando...</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <h3 className="text-lg font-semibold text-blue-400 flex items-center gap-2">
                    <FileCode2 className="w-5 h-5" />
                    System Prompt
                </h3>
                {canEdit && (
                    <Button
                        onClick={handleSave}
                        disabled={!dirty || saving}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Salvar
                    </Button>
                )}
            </div>

            <p className="text-sm text-gray-400">
                Estes prompts valem para a plataforma inteira: o n8n busca o texto aqui em
                vez de guardar uma cópia em cada fluxo, então mudar neste painel muda todos
                os fluxos ao mesmo tempo.
            </p>

            {/* Como o n8n consome */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
                <Label className="text-gray-200">Como buscar no n8n</Label>
                <div className="flex items-center gap-2 flex-wrap">
                    <code className="flex-1 min-w-0 truncate rounded bg-gray-900 border border-gray-700 px-3 py-2 text-xs text-gray-300">
                        GET {endpoint}
                    </code>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={copyEndpoint}
                        className="border-gray-600 bg-gray-900 text-gray-200 hover:bg-gray-700 hover:text-white shrink-0"
                    >
                        {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                        {copied ? "Copiado" : "Copiar"}
                    </Button>
                </div>
                <p className="text-xs text-gray-400">
                    Envie o header <code className="text-gray-200">x-api-key</code> com a chave da API
                    de agendamento (a mesma das outras chamadas do n8n). A resposta traz{" "}
                    <code className="text-gray-200">prompts.base</code>,{" "}
                    <code className="text-gray-200">prompts.campanhas_qualificacao</code>,{" "}
                    <code className="text-gray-200">prompts.campanhas_agendamento</code> e{" "}
                    <code className="text-gray-200">prompts.instagram</code>.
                </p>
                {data?.updated_at && (
                    <p className="text-xs text-gray-500">
                        Última alteração:{" "}
                        {new Date(data.updated_at).toLocaleString("pt-BR", {
                            timeZone: "America/Sao_Paulo",
                        })}
                    </p>
                )}
            </div>

            {/* Um bloco por prompt */}
            <div className="space-y-4">
                {SLOTS.map((slot) => (
                    <div
                        key={slot.column}
                        className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-2"
                    >
                        <div className="flex items-baseline justify-between gap-3 flex-wrap">
                            <Label htmlFor={slot.column} className="text-gray-200">
                                {slot.label}
                            </Label>
                            <code className="text-[11px] text-gray-500">
                                prompts.{slot.apiKey}
                            </code>
                        </div>
                        <p className="text-xs text-gray-400">{slot.hint}</p>
                        <Textarea
                            id={slot.column}
                            value={draft[slot.column]}
                            onChange={(e) =>
                                setDraft((d) => ({ ...d, [slot.column]: e.target.value }))
                            }
                            disabled={!canEdit}
                            rows={14}
                            spellCheck={false}
                            placeholder="Cole aqui o prompt..."
                            className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-600 font-mono text-xs leading-relaxed"
                        />
                        <p className="text-[11px] text-gray-500">
                            {draft[slot.column].length.toLocaleString("pt-BR")} caracteres
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}
