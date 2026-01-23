import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";

interface PatientNoteModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (note: { data: string; titulo: string; descricao: string }) => void;
}

export const PatientNoteModal = ({ open, onOpenChange, onSave }: PatientNoteModalProps) => {
    const [data, setData] = useState(format(new Date(), "dd-MM-yyyy"));
    const [titulo, setTitulo] = useState("");
    const [descricao, setDescricao] = useState("");

    const handleSave = () => {
        if (!titulo.trim()) return;
        onSave({ data, titulo: titulo.trim(), descricao: descricao.trim() });
        setTitulo("");
        setDescricao("");
        setData(format(new Date(), "dd-MM-yyyy"));
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Nova Nota</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div>
                        <Label>Data</Label>
                        <Input value={data} onChange={(e) => setData(e.target.value)} />
                    </div>
                    <div>
                        <Label>Título *</Label>
                        <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título da nota" />
                    </div>
                    <div>
                        <Label>Descrição</Label>
                        <Textarea
                            value={descricao}
                            onChange={(e) => setDescricao(e.target.value)}
                            placeholder="Descrição da nota..."
                            rows={4}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={handleSave} disabled={!titulo.trim()}>Salvar Nota</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
