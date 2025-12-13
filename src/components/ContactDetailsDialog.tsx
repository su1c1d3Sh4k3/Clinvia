import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface ContactDetailsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contact: any; // Using any for simplicity as we have complex types
    onEdit: (contact: any) => void;
}

export const ContactDetailsDialog = ({ open, onOpenChange, contact, onEdit }: ContactDetailsDialogProps) => {
    if (!contact) return null;

    const firstName = contact.push_name?.split(' ')[0] || '';
    const lastName = contact.push_name?.split(' ').slice(1).join(' ') || '';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle className="text-center">Detalhes do Contato</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col items-center space-y-4 py-4">
                    <div className="relative">
                        <Avatar className="w-24 h-24">
                            <AvatarImage src={contact.profile_pic_url} />
                            <AvatarFallback className="text-2xl">{contact.push_name?.[0] || "?"}</AvatarFallback>
                        </Avatar>
                        {/* Status badge could go here if we had one */}
                    </div>

                    <div className="w-full space-y-3">
                        <div className="flex justify-between border-b pb-2">
                            <span className="font-bold text-muted-foreground">Nome:</span>
                            <span className="font-medium">{contact.push_name}</span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                            <span className="font-bold text-muted-foreground">Telefone:</span>
                            <span className="font-medium">{contact.phone || contact.number?.split('@')[0]}</span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                            <span className="font-bold text-muted-foreground">Primeiro Nome:</span>
                            <span className="font-medium">{firstName}</span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                            <span className="font-bold text-muted-foreground">Sobrenome:</span>
                            <span className="font-medium">{lastName}</span>
                        </div>
                        {contact.company && (
                            <div className="flex justify-between border-b pb-2">
                                <span className="font-bold text-muted-foreground">Empresa:</span>
                                <span className="font-medium">{contact.company}</span>
                            </div>
                        )}
                        {contact.email && (
                            <div className="flex justify-between border-b pb-2">
                                <span className="font-bold text-muted-foreground">Email:</span>
                                <span className="font-medium">{contact.email}</span>
                            </div>
                        )}
                        {contact.cpf && (
                            <div className="flex justify-between border-b pb-2">
                                <span className="font-bold text-muted-foreground">CPF:</span>
                                <span className="font-medium">{contact.cpf}</span>
                            </div>
                        )}
                    </div>

                    <Button
                        variant="outline"
                        className="w-full text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        onClick={() => {
                            onOpenChange(false);
                            onEdit(contact);
                        }}
                    >
                        Editar
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
