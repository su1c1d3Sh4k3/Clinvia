import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ReplyMessage {
  id: string;
  body: string | null;
  sender_name: string | null;
  direction: "inbound" | "outbound";
}

interface ReplyQuoteBoxProps {
  message: ReplyMessage;
  onCancel: () => void;
  className?: string;
}

/**
 * ReplyQuoteBox - Shows above the input when replying to a message
 */
export function ReplyQuoteBox({ message, onCancel, className }: ReplyQuoteBoxProps) {
  const senderName = message.direction === "outbound" ? "Você" : (message.sender_name || "Cliente");
  const displayText = message.body || "[Mídia]";
  const truncatedText = displayText.length > 100 ? displayText.substring(0, 100) + "..." : displayText;

  return (
    <div
      className={cn(
        "flex items-start gap-2 p-2 bg-muted/50 border-l-4 border-primary rounded",
        className
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-primary">
          {senderName}
        </p>
        <p className="text-sm text-muted-foreground truncate">
          {truncatedText}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={onCancel}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface QuotedMessageProps {
  quotedBody: string | null;
  quotedSender: string | null;
  isOutbound: boolean;
  className?: string;
}

/**
 * QuotedMessage - Shows inside a message bubble when it's a reply
 */
export function QuotedMessage({ quotedBody, quotedSender, isOutbound, className }: QuotedMessageProps) {
  if (!quotedBody) return null;
  
  const displayText = quotedBody.length > 80 ? quotedBody.substring(0, 80) + "..." : quotedBody;

  return (
    <div
      className={cn(
        "p-2 mb-2 rounded border-l-4",
        isOutbound 
          ? "bg-white/10 border-white/50" 
          : "bg-primary/10 border-primary/50",
        className
      )}
    >
      <p className={cn(
        "text-xs font-semibold mb-0.5",
        isOutbound ? "text-white/80" : "text-primary"
      )}>
        {quotedSender || "Mensagem"}
      </p>
      <p className={cn(
        "text-xs",
        isOutbound ? "text-white/70" : "text-muted-foreground"
      )}>
        {displayText}
      </p>
    </div>
  );
}
