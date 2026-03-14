import { cn } from '@/lib/utils';
import { BiaAvatar } from './BiaAvatar';

interface BiaMessageBubbleProps {
  message: string;
  isUser?: boolean;
  animationDelay?: number;
}

// Simple markdown bold: **text** → <strong>text</strong>
function renderMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

// Handle newlines in message text
function renderContent(message: string) {
  return message.split('\n').map((line, i) => (
    <span key={i}>
      {renderMarkdown(line)}
      {i < message.split('\n').length - 1 && <br />}
    </span>
  ));
}

export function BiaMessageBubble({ message, isUser = false, animationDelay = 0 }: BiaMessageBubbleProps) {
  if (isUser) {
    return (
      <div
        className="flex justify-end animate-in slide-in-from-right-2 fade-in duration-300"
        style={{ animationDelay: `${animationDelay}ms`, animationFillMode: 'both' }}
      >
        <div className={cn(
          'max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tr-none',
          'bg-violet-500/80 text-white text-sm leading-relaxed',
          'shadow-lg',
        )}>
          {renderContent(message)}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-start gap-3 animate-in slide-in-from-left-2 fade-in duration-300"
      style={{ animationDelay: `${animationDelay}ms`, animationFillMode: 'both' }}
    >
      <BiaAvatar size="sm" />
      <div className={cn(
        'max-w-[85%] px-4 py-2.5 rounded-2xl rounded-tl-none',
        'bg-white/10 backdrop-blur-sm text-white/90 text-sm leading-relaxed',
        'border border-white/10',
        'shadow-lg',
      )}>
        {renderContent(message)}
      </div>
    </div>
  );
}
