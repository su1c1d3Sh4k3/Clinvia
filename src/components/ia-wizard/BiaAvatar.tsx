import { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BiaAvatarProps {
  isTyping?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function BiaAvatar({ isTyping = false, size = 'md' }: BiaAvatarProps) {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (isTyping) {
      setPulse(true);
    } else {
      const t = setTimeout(() => setPulse(false), 300);
      return () => clearTimeout(t);
    }
  }, [isTyping]);

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-7 h-7',
  };

  return (
    <div className="relative flex-shrink-0">
      <div
        className={cn(
          sizeClasses[size],
          'rounded-full flex items-center justify-center',
          'bg-gradient-to-br from-violet-500 to-blue-500',
          'shadow-lg shadow-violet-500/30',
          pulse && 'ring-2 ring-violet-400 ring-offset-1 ring-offset-transparent',
          'transition-all duration-300',
        )}
      >
        <Bot className={cn(iconSizes[size], 'text-white')} />
      </div>
      {isTyping && (
        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-[#0d1b4b] animate-pulse" />
      )}
    </div>
  );
}

export function BiaTypingIndicator() {
  return (
    <div className="flex items-center gap-2 px-4 py-3 rounded-2xl rounded-tl-none bg-white/10 backdrop-blur-sm w-fit">
      <BiaAvatar isTyping size="sm" />
      <div className="flex gap-1.5 items-center">
        <span
          className="w-2 h-2 rounded-full bg-white/70 animate-bounce"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="w-2 h-2 rounded-full bg-white/70 animate-bounce"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="w-2 h-2 rounded-full bg-white/70 animate-bounce"
          style={{ animationDelay: '300ms' }}
        />
      </div>
    </div>
  );
}
