import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

interface QRCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qrCode: string | null;
  instanceName: string;
}

export const QRCodeDialog = ({ open, onOpenChange, qrCode, instanceName }: QRCodeDialogProps) => {
  const [timeLeft, setTimeLeft] = useState(120); // 2 minutos

  useEffect(() => {
    if (!open) {
      setTimeLeft(120);
      return;
    }

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [open]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar WhatsApp</DialogTitle>
          <DialogDescription>
            Escaneie o QR Code com seu WhatsApp para conectar
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col items-center gap-4 py-4">
          {qrCode ? (
            <>
              <div className="bg-white p-4 rounded-lg">
                <img 
                  src={`data:image/png;base64,${qrCode}`} 
                  alt="QR Code"
                  className="w-64 h-64"
                />
              </div>
              
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Instância: <span className="font-mono">{instanceName}</span>
                </p>
                <p className="text-sm font-medium">
                  Tempo restante: {formatTime(timeLeft)}
                </p>
                {timeLeft === 0 && (
                  <p className="text-sm text-destructive">
                    QR Code expirado. Feche e tente novamente.
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Gerando QR Code...
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
