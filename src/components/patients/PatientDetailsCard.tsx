import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Image, StickyNote, Upload, Plus, X, Calendar, Phone, Mail, MapPin, Briefcase, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { PatientNoteModal } from "./PatientNoteModal";
import type { Patient } from "@/pages/Patients";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// Helper para extrair nome do arquivo da URL
const getFileNameFromUrl = (url: string): string => {
    try {
        const path = decodeURIComponent(new URL(url).pathname);
        const parts = path.split("/");
        const fileName = parts[parts.length - 1];
        // Remove o timestamp do início (formato: 1234567890123-filename.ext)
        const match = fileName.match(/^\d+-(.+)$/);
        return match ? match[1].replace(/_/g, " ") : fileName.replace(/_/g, " ");
    } catch {
        return "Arquivo";
    }
};

interface PatientDetailsCardProps {
    patient: Patient | null;
    onClose: () => void;
}

export const PatientDetailsCard = ({ patient, onClose }: PatientDetailsCardProps) => {
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    if (!patient) return null;

    const handleFileUpload = async (type: "docs" | "photos") => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = type === "photos" ? "image/*" : "*";
        input.multiple = true;

        input.onchange = async (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (!files?.length) return;

            setIsUploading(true);
            const bucket = type === "docs" ? "patients-docs" : "patients-photos";
            const newUrls: string[] = [];

            try {
                for (const file of Array.from(files)) {
                    // Sanitizar nome do arquivo: remover espaços e caracteres especiais
                    const sanitizedName = file.name
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "") // Remove acentos
                        .replace(/[^a-zA-Z0-9.-]/g, "_") // Substitui caracteres especiais por _
                        .replace(/_+/g, "_"); // Remove underscores duplicados

                    const fileName = `${patient.id}/${Date.now()}-${sanitizedName}`;
                    const { error: uploadError } = await supabase.storage
                        .from(bucket)
                        .upload(fileName, file);

                    if (uploadError) throw uploadError;

                    const { data: urlData } = supabase.storage
                        .from(bucket)
                        .getPublicUrl(fileName);

                    newUrls.push(urlData.publicUrl);
                }

                const currentArray = patient[type] || [];
                await supabase
                    .from("patients" as any)
                    .update({ [type]: [...currentArray, ...newUrls] })
                    .eq("id", patient.id);

                queryClient.invalidateQueries({ queryKey: ["patients"] });
                toast({ title: `${type === "docs" ? "Documento(s)" : "Foto(s)"} anexado(s) com sucesso!` });
            } catch (error: any) {
                toast({ title: "Erro ao fazer upload", description: error.message, variant: "destructive" });
            } finally {
                setIsUploading(false);
            }
        };

        input.click();
    };

    const handleAddNote = async (note: { data: string; titulo: string; descricao: string }) => {
        try {
            const currentNotes = patient.notes || [];
            await supabase
                .from("patients" as any)
                .update({ notes: [...currentNotes, note] })
                .eq("id", patient.id);

            queryClient.invalidateQueries({ queryKey: ["patients"] });
            toast({ title: "Nota adicionada com sucesso!" });
        } catch (error: any) {
            toast({ title: "Erro ao adicionar nota", description: error.message, variant: "destructive" });
        }
    };

    const formatPhone = (phone?: string) => {
        if (!phone) return "-";
        const cleaned = phone.replace(/\D/g, "");
        if (cleaned.length === 13) {
            return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 5)} ${cleaned.slice(5, 9)}-${cleaned.slice(9)}`;
        }
        return phone;
    };

    return (
        <>
            <Sheet open={!!patient} onOpenChange={(open) => !open && onClose()}>
                <SheetContent className="w-full sm:max-w-xl overflow-y-auto overflow-x-hidden">
                    <SheetHeader>
                        <div className="flex items-center gap-4">
                            <Avatar className="h-16 w-16">
                                <AvatarImage src={patient.profile_pic_url || patient.contacts?.profile_pic_url} />
                                <AvatarFallback className="text-xl">{patient.nome?.[0]}</AvatarFallback>
                            </Avatar>
                            <div>
                                <SheetTitle className="text-xl">{patient.nome}</SheetTitle>
                                {patient.nome_civil && (
                                    <p className="text-sm text-muted-foreground">Nome civil: {patient.nome_civil}</p>
                                )}
                            </div>
                        </div>
                    </SheetHeader>

                    <ScrollArea className="mt-6 h-[calc(100vh-200px)]" disableOverflowX>
                        <div className="space-y-6 pr-4 min-w-0">
                            {/* Action Buttons */}
                            <div className="flex gap-2 flex-wrap">
                                <Button variant="outline" size="sm" onClick={() => handleFileUpload("docs")} disabled={isUploading}>
                                    <FileText className="w-4 h-4 mr-2" />
                                    {isUploading ? "Enviando..." : "Anexar Documentos"}
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => setIsNoteModalOpen(true)}>
                                    <StickyNote className="w-4 h-4 mr-2" />
                                    Anexar Notas
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => handleFileUpload("photos")} disabled={isUploading}>
                                    <Image className="w-4 h-4 mr-2" />
                                    Anexar Fotos
                                </Button>
                            </div>

                            <Separator />

                            {/* Contact Info */}
                            <div className="space-y-3">
                                <h3 className="font-semibold">Informações de Contato</h3>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div className="flex items-center gap-2">
                                        <Phone className="w-4 h-4 text-muted-foreground" />
                                        <span>{formatPhone(patient.telefone)}</span>
                                    </div>
                                    {patient.email && (
                                        <div className="flex items-center gap-2">
                                            <Mail className="w-4 h-4 text-muted-foreground" />
                                            <span>{patient.email}</span>
                                        </div>
                                    )}
                                    {patient.data_nascimento && (
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-4 h-4 text-muted-foreground" />
                                            <span>{format(new Date(patient.data_nascimento), "dd/MM/yyyy")}</span>
                                        </div>
                                    )}
                                    {patient.sexo && (
                                        <div>
                                            <Badge variant="outline">{patient.sexo}</Badge>
                                        </div>
                                    )}
                                </div>
                                {patient.cpf && <p className="text-sm"><strong>CPF:</strong> {patient.cpf}</p>}
                                {patient.rg && <p className="text-sm"><strong>RG:</strong> {patient.rg}</p>}
                            </div>

                            <Separator />

                            {/* Address */}
                            {(patient.endereco || patient.cidade) && (
                                <>
                                    <div className="space-y-2">
                                        <h3 className="font-semibold flex items-center gap-2">
                                            <MapPin className="w-4 h-4" /> Endereço
                                        </h3>
                                        <p className="text-sm">
                                            {[patient.endereco, patient.complemento, patient.bairro, patient.cidade, patient.estado, patient.cep]
                                                .filter(Boolean)
                                                .join(", ")}
                                        </p>
                                    </div>
                                    <Separator />
                                </>
                            )}

                            {/* Professional Info */}
                            {(patient.profissao || patient.escolaridade || patient.estado_civil) && (
                                <>
                                    <div className="space-y-2">
                                        <h3 className="font-semibold flex items-center gap-2">
                                            <Briefcase className="w-4 h-4" /> Dados Complementares
                                        </h3>
                                        <div className="text-sm space-y-1">
                                            {patient.profissao && <p><strong>Profissão:</strong> {patient.profissao}</p>}
                                            {patient.escolaridade && <p><strong>Escolaridade:</strong> {patient.escolaridade}</p>}
                                            {patient.estado_civil && <p><strong>Estado Civil:</strong> {patient.estado_civil}</p>}
                                        </div>
                                    </div>
                                    <Separator />
                                </>
                            )}

                            {/* Emergency Contacts */}
                            {patient.contatos_emergencia && patient.contatos_emergencia.length > 0 && patient.contatos_emergencia[0].nome && (
                                <>
                                    <div className="space-y-2">
                                        <h3 className="font-semibold">Contatos de Emergência</h3>
                                        {patient.contatos_emergencia.map((contato, i) => (
                                            <div key={i} className="text-sm">
                                                {contato.nome} - {formatPhone(contato.telefone)}
                                            </div>
                                        ))}
                                    </div>
                                    <Separator />
                                </>
                            )}

                            {/* Convenios */}
                            {patient.convenios && patient.convenios.length > 0 && patient.convenios[0].nome && (
                                <>
                                    <div className="space-y-2">
                                        <h3 className="font-semibold">Convênios</h3>
                                        {patient.convenios.map((conv, i) => (
                                            <div key={i} className="border rounded p-3 text-sm space-y-1">
                                                <p><strong>{conv.nome}</strong> - {conv.tipo_plano}</p>
                                                <p>Carteirinha: {conv.numero_carteirinha}</p>
                                                {conv.validade && <p>Validade: {conv.validade}</p>}
                                                {conv.acomodacao && <p>Acomodação: {conv.acomodacao}</p>}
                                            </div>
                                        ))}
                                    </div>
                                    <Separator />
                                </>
                            )}

                            {/* Abas para Documentos, Notas e Fotos */}
                            <Tabs defaultValue="documentos" className="w-full overflow-hidden">
                                <TabsList className="grid w-full grid-cols-3">
                                    <TabsTrigger value="documentos" className="text-xs">
                                        <FileText className="w-3 h-3 mr-1" />
                                        Docs ({patient.docs?.length || 0})
                                    </TabsTrigger>
                                    <TabsTrigger value="notas" className="text-xs">
                                        <StickyNote className="w-3 h-3 mr-1" />
                                        Notas ({patient.notes?.length || 0})
                                    </TabsTrigger>
                                    <TabsTrigger value="fotos" className="text-xs">
                                        <Image className="w-3 h-3 mr-1" />
                                        Fotos ({patient.photos?.length || 0})
                                    </TabsTrigger>
                                </TabsList>

                                <TabsContent value="documentos" className="mt-4 overflow-hidden">
                                    {patient.docs && patient.docs.length > 0 ? (
                                        <div className="space-y-2 overflow-hidden">
                                            {patient.docs.map((doc, i) => (
                                                <a
                                                    key={i}
                                                    href={doc}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-2 p-2 border rounded hover:bg-muted transition-colors w-full"
                                                >
                                                    <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                                                    <span
                                                        className="text-sm truncate flex-1 min-w-0"
                                                        title={getFileNameFromUrl(doc)}
                                                    >
                                                        {getFileNameFromUrl(doc)}
                                                    </span>
                                                    <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                                </a>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground text-center py-4">
                                            Nenhum documento anexado
                                        </p>
                                    )}
                                </TabsContent>

                                <TabsContent value="notas" className="mt-4">
                                    {patient.notes && patient.notes.length > 0 ? (
                                        <div className="space-y-2">
                                            {patient.notes.map((note, i) => (
                                                <div key={i} className="border rounded p-3 text-sm">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <strong>{note.titulo}</strong>
                                                        <span className="text-xs text-muted-foreground">{note.data}</span>
                                                    </div>
                                                    <p className="text-muted-foreground">{note.descricao}</p>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground text-center py-4">
                                            Nenhuma nota anexada
                                        </p>
                                    )}
                                </TabsContent>

                                <TabsContent value="fotos" className="mt-4">
                                    {patient.photos && patient.photos.length > 0 ? (
                                        <div className="space-y-2">
                                            {patient.photos.map((photo, i) => (
                                                <a
                                                    key={i}
                                                    href={photo}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="block"
                                                >
                                                    <div className="border rounded overflow-hidden">
                                                        <img
                                                            src={photo}
                                                            alt={getFileNameFromUrl(photo)}
                                                            className="w-full h-40 object-cover"
                                                        />
                                                        <div className="p-2 flex items-center gap-2 bg-muted/50">
                                                            <Image className="w-3 h-3 text-muted-foreground" />
                                                            <span className="text-xs truncate flex-1">{getFileNameFromUrl(photo)}</span>
                                                            <ExternalLink className="w-3 h-3 text-muted-foreground" />
                                                        </div>
                                                    </div>
                                                </a>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground text-center py-4">
                                            Nenhuma foto anexada
                                        </p>
                                    )}
                                </TabsContent>
                            </Tabs>
                        </div>
                    </ScrollArea>
                </SheetContent>
            </Sheet>

            <PatientNoteModal
                open={isNoteModalOpen}
                onOpenChange={setIsNoteModalOpen}
                onSave={handleAddNote}
            />
        </>
    );
};
