import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileText, ImageUp, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
    HEADER_MAX_BYTES,
    HEADER_RECOMMENDED_HEIGHT,
    HEADER_RECOMMENDED_WIDTH,
} from "@/lib/orcamentoPdf";

/** Caminho fixo por conta: subir de novo substitui, sem deixar arquivo órfão. */
const objectPath = (ownerId: string) => `${ownerId}/orcamento-header.png`;

interface Props {
    canEdit: boolean;
}

/**
 * Cabeçalho (PNG) e rodapé (texto) do orçamento em PDF.
 * Grava em `profiles` do DONO da conta — o escopo é a empresa, não quem está
 * logado —, por isso não usa o `updateCompany` da página (que salva no
 * `user.id` da sessão).
 */
export function OrcamentoBrandingCard({ canEdit }: Props) {
    const { data: ownerId } = useOwnerId();
    const queryClient = useQueryClient();
    const fileRef = useRef<HTMLInputElement>(null);

    const [loaded, setLoaded] = useState(false);
    const [headerUrl, setHeaderUrl] = useState<string | null>(null);
    const [footerText, setFooterText] = useState("");
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!ownerId) return;
        (async () => {
            const { data, error } = await supabase
                .from("profiles")
                .select("orcamento_header_url, orcamento_footer_text")
                .eq("id", ownerId)
                .maybeSingle();
            if (error) {
                toast.error("Não foi possível carregar o cabeçalho do orçamento.");
                return;
            }
            const row = (data || {}) as Record<string, string | null>;
            setHeaderUrl(row.orcamento_header_url ?? null);
            setFooterText(row.orcamento_footer_text ?? "");
            setLoaded(true);
        })();
    }, [ownerId]);

    const persist = async (patch: Record<string, string | null>) => {
        const { error } = await supabase.from("profiles").update(patch as any).eq("id", ownerId!);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ["orcamento-branding"] });
    };

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file || !ownerId) return;

        if (file.type !== "image/png") {
            toast.error("O cabeçalho precisa ser um arquivo PNG.");
            return;
        }
        if (file.size > HEADER_MAX_BYTES) {
            toast.error("A imagem passa de 2 MB. Reduza o arquivo e tente de novo.");
            return;
        }

        setUploading(true);
        try {
            const path = objectPath(ownerId);
            const { error: upErr } = await supabase.storage
                .from("company-branding")
                .upload(path, file, { upsert: true, contentType: "image/png" });
            if (upErr) throw upErr;

            const { data: pub } = supabase.storage.from("company-branding").getPublicUrl(path);
            // Sobrescrever mantém a URL: o sufixo força o navegador/CDN a baixar a nova.
            const url = `${pub.publicUrl}?v=${Date.now()}`;
            await persist({ orcamento_header_url: url });
            setHeaderUrl(url);
            toast.success("Cabeçalho atualizado!");
        } catch (err: any) {
            toast.error(err?.message || "Erro ao enviar o cabeçalho.");
        } finally {
            setUploading(false);
        }
    };

    const handleRemove = async () => {
        if (!ownerId) return;
        setUploading(true);
        try {
            await supabase.storage.from("company-branding").remove([objectPath(ownerId)]);
            await persist({ orcamento_header_url: null });
            setHeaderUrl(null);
            toast.success("Cabeçalho removido. O PDF volta a usar o nome da empresa.");
        } catch (err: any) {
            toast.error(err?.message || "Erro ao remover o cabeçalho.");
        } finally {
            setUploading(false);
        }
    };

    const handleSaveFooter = async () => {
        setSaving(true);
        try {
            await persist({ orcamento_footer_text: footerText.trim() || null });
            toast.success("Rodapé salvo!");
        } catch (err: any) {
            toast.error(err?.message || "Erro ao salvar o rodapé.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card data-tour="orcamento-branding">
            <CardHeader className="p-4 md:p-6">
                <CardTitle className="text-base md:text-lg flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    Orçamento em PDF
                </CardTitle>
                <CardDescription className="text-xs md:text-sm">
                    Personalize o documento que o paciente recebe ao exportar um orçamento.
                </CardDescription>
            </CardHeader>

            <CardContent className="p-4 md:p-6 pt-0 md:pt-0 space-y-6">
                <div className="space-y-3">
                    <Label>Cabeçalho (PNG)</Label>

                    {!loaded ? (
                        <Skeleton className="h-24 w-full rounded-lg" />
                    ) : headerUrl ? (
                        <div className="rounded-lg border overflow-hidden bg-white">
                            <img src={headerUrl} alt="Cabeçalho do orçamento" className="w-full object-contain" />
                        </div>
                    ) : (
                        <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                            Nenhum cabeçalho enviado. O PDF sai com uma faixa azul contendo o nome e o
                            telefone da empresa.
                        </div>
                    )}

                    <input
                        ref={fileRef}
                        type="file"
                        accept="image/png"
                        className="hidden"
                        onChange={handleFile}
                        disabled={!canEdit}
                    />

                    <div className="flex flex-wrap gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            disabled={!canEdit || uploading}
                            onClick={() => fileRef.current?.click()}
                        >
                            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageUp className="w-3.5 h-3.5" />}
                            {headerUrl ? "Trocar imagem" : "Enviar imagem"}
                        </Button>

                        <Button size="sm" variant="outline" className="gap-1.5" asChild>
                            <a href="/modelo-cabecalho-orcamento.png" download>
                                <Download className="w-3.5 h-3.5" /> Baixar modelo
                            </a>
                        </Button>

                        {headerUrl && canEdit && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 text-destructive hover:bg-destructive/10"
                                disabled={uploading}
                                onClick={handleRemove}
                            >
                                <Trash2 className="w-3.5 h-3.5" /> Remover
                            </Button>
                        )}
                    </div>

                    <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                        <p className="font-medium text-foreground">Como fazer um cabeçalho bonito</p>
                        <p>
                            Tamanho ideal: <strong>{HEADER_RECOMMENDED_WIDTH} × {HEADER_RECOMMENDED_HEIGHT} pixels</strong>{" "}
                            (proporção 6:1) — é a faixa que ocupa a largura inteira do topo da folha A4. Arquivo
                            PNG de até 2 MB.
                        </p>
                        <p>
                            Deixe uma margem de respiro de ~40 px nas bordas e evite texto muito pequeno: a logo
                            de um lado e os dados da clínica (CNPJ, endereço, telefone, e-mail) do outro já
                            deixam o documento profissional.
                        </p>
                        <p>
                            Fundo transparente funciona, mas o PDF é impresso em branco — texto branco some.
                            Baixe o modelo acima e substitua a logo e os dados pelos da sua clínica.
                        </p>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="orcamentoFooter">Rodapé do orçamento</Label>
                    <Textarea
                        id="orcamentoFooter"
                        rows={4}
                        value={footerText}
                        onChange={(e) => setFooterText(e.target.value)}
                        disabled={!canEdit || !loaded}
                        placeholder={"Ex.: Formas de pagamento: PIX, dinheiro ou cartão em até 10x.\nOs valores deste orçamento são válidos até a data indicada.\nCNPJ 00.000.000/0001-00 — Av. Exemplo, 1000, Sala 12."}
                    />
                    <p className="text-xs text-muted-foreground">
                        Texto livre impresso no fim do PDF: condições de pagamento, política de validade,
                        CNPJ, endereço. Deixe em branco para não imprimir nada.
                    </p>
                </div>
            </CardContent>

            {canEdit && (
                <CardFooter className="p-4 md:p-6 pt-0 md:pt-0">
                    <Button onClick={handleSaveFooter} disabled={saving || !loaded} className="ml-auto">
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Salvar rodapé
                    </Button>
                </CardFooter>
            )}
        </Card>
    );
}
