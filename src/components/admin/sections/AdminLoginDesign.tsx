// @ts-nocheck - login_design ainda não está nos types gerados
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Image as ImageIcon, Upload, Trash2, Link2, Loader2 } from "lucide-react";
import { useLoginDesign, LOGIN_BANNER_SIZE, LOGIN_BANNER_SIZE_LABEL } from "@/hooks/useLoginDesign";

const MAX_BYTES = 3 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

export default function AdminLoginDesign({ canEdit }: { canEdit: boolean }) {
    const queryClient = useQueryClient();
    const { data, isLoading } = useLoginDesign();
    const fileRef = useRef<HTMLInputElement>(null);

    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [linkUrl, setLinkUrl] = useState("");
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!data) return;
        setImageUrl(data.image_url);
        setLinkUrl(data.link_url || "");
    }, [data]);

    const dirty =
        !!data && (imageUrl !== data.image_url || linkUrl.trim() !== (data.link_url || ""));

    const handleUpload = async (file: File) => {
        if (!ACCEPTED.includes(file.type)) {
            toast.error("Use uma imagem PNG, JPG ou WebP.");
            return;
        }
        if (file.size > MAX_BYTES) {
            toast.error("A imagem precisa ter no máximo 3 MB.");
            return;
        }
        setUploading(true);
        try {
            const ext = file.name.split(".").pop()?.toLowerCase() || "png";
            const path = `banner/${Date.now()}.${ext}`;
            const { error: upErr } = await supabase.storage
                .from("login-design")
                .upload(path, file, { cacheControl: "3600", upsert: false });
            if (upErr) throw upErr;
            const { data: pub } = supabase.storage.from("login-design").getPublicUrl(path);
            setImageUrl(pub.publicUrl);
            toast.success("Imagem carregada. Clique em Salvar para publicar.");
        } catch (e: any) {
            toast.error("Erro no upload: " + (e?.message || "tente novamente"));
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = "";
        }
    };

    const handleSave = async () => {
        const link = linkUrl.trim();
        if (link && !/^https?:\/\//i.test(link)) {
            toast.error("O link precisa começar com http:// ou https://");
            return;
        }
        setSaving(true);
        try {
            const { data: auth } = await supabase.auth.getUser();
            const { error } = await supabase
                .from("login_design" as any)
                .update({
                    image_url: imageUrl,
                    link_url: link || null,
                    updated_at: new Date().toISOString(),
                    updated_by: auth?.user?.id ?? null,
                })
                .eq("id", true);
            if (error) throw error;
            await queryClient.invalidateQueries({ queryKey: ["login-design"] });
            toast.success("Tela de login atualizada.");
        } catch (e: any) {
            toast.error("Erro ao salvar: " + (e?.message || "tente novamente"));
        } finally {
            setSaving(false);
        }
    };

    if (isLoading) {
        return <div className="text-center py-12 text-gray-400">Carregando...</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <h3 className="text-lg font-semibold text-blue-400 flex items-center gap-2">
                    <ImageIcon className="w-5 h-5" />
                    Design de Login
                </h3>
                {canEdit && (
                    <Button
                        onClick={handleSave}
                        disabled={!dirty || saving || uploading}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Salvar
                    </Button>
                )}
            </div>

            <p className="text-sm text-gray-400">
                Com uma imagem publicada, a tela de acesso fica dividida ao meio: banner à
                esquerda e a caixa de login à direita. Sem imagem, a caixa continua
                centralizada como hoje.
            </p>

            <div className="grid gap-4 lg:grid-cols-2">
                {/* Imagem */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
                    <div>
                        <Label className="text-gray-200">Imagem do banner</Label>
                        <p className="text-xs text-gray-400 mt-1">
                            Formato ideal: <strong className="text-gray-200">{LOGIN_BANNER_SIZE_LABEL}</strong>{" "}
                            (retrato, proporção 3:4). PNG, JPG ou WebP de até 3 MB. A imagem é
                            recortada para preencher a metade da tela — deixe o conteúdo
                            importante no centro.
                        </p>
                    </div>

                    <div
                        className="relative w-full overflow-hidden rounded-lg border border-gray-700 bg-gray-900"
                        style={{ aspectRatio: `${LOGIN_BANNER_SIZE.width} / ${LOGIN_BANNER_SIZE.height}`, maxHeight: 320 }}
                    >
                        {imageUrl ? (
                            <img src={imageUrl} alt="Banner da tela de login" className="w-full h-full object-cover" />
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 gap-2">
                                <ImageIcon className="w-10 h-10" />
                                <span className="text-xs">Nenhuma imagem publicada</span>
                            </div>
                        )}
                    </div>

                    {canEdit && (
                        <div className="flex flex-wrap gap-2">
                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                className="hidden"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleUpload(f);
                                }}
                            />
                            <Button
                                variant="outline"
                                onClick={() => fileRef.current?.click()}
                                disabled={uploading}
                                className="border-gray-600 bg-gray-900 text-gray-200 hover:bg-gray-700 hover:text-white"
                            >
                                {uploading ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <Upload className="w-4 h-4 mr-2" />
                                )}
                                {imageUrl ? "Trocar imagem" : "Enviar imagem"}
                            </Button>
                            {imageUrl && (
                                <Button
                                    variant="outline"
                                    onClick={() => setImageUrl(null)}
                                    className="border-red-900 bg-gray-900 text-red-400 hover:bg-red-950 hover:text-red-300"
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Remover
                                </Button>
                            )}
                        </div>
                    )}
                </div>

                {/* Link + prévia do layout */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="login-link" className="text-gray-200">
                            Link do banner (opcional)
                        </Label>
                        <div className="relative">
                            <Link2 className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
                            <Input
                                id="login-link"
                                type="url"
                                placeholder="https://www.exemplo.com.br/promocao"
                                value={linkUrl}
                                onChange={(e) => setLinkUrl(e.target.value)}
                                disabled={!canEdit}
                                className="pl-9 bg-gray-900 border-gray-700 text-white placeholder:text-gray-600"
                            />
                        </div>
                        <p className="text-xs text-gray-400">
                            Com link preenchido, clicar na imagem abre o endereço em uma nova
                            aba. Deixe em branco para a imagem ficar estática.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-gray-200">Prévia do layout</Label>
                        <div className="flex gap-1 h-28 rounded-lg overflow-hidden border border-gray-700">
                            {imageUrl && (
                                <div className="w-1/2 bg-gray-900 overflow-hidden">
                                    <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                                </div>
                            )}
                            <div className={`${imageUrl ? "w-1/2" : "w-full"} bg-gray-900 flex items-center justify-center`}>
                                <div className="w-3/4 rounded bg-white/90 py-3 flex flex-col items-center gap-1.5">
                                    <div className="h-1.5 w-10 rounded bg-[#1668C1]" />
                                    <div className="h-1 w-16 rounded bg-[#1668C1]/30" />
                                    <div className="h-1 w-16 rounded bg-[#1668C1]/30" />
                                    <div className="h-1.5 w-16 rounded bg-[#1668C1]" />
                                </div>
                            </div>
                        </div>
                        <p className="text-xs text-gray-400">
                            Em celulares o banner não é exibido — a caixa de login ocupa a tela
                            inteira.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
