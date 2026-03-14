import { useState, useRef, useEffect } from 'react';
import { Send, CheckCircle, X, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatMessage, WizardStepId, WizardState } from './wizard-state';
import { BiaMessageBubble } from './BiaMessageBubble';
import { BiaTypingIndicator } from './BiaAvatar';
import { supabase } from '@/integrations/supabase/client';
import { buildBiaSystemPrompt } from './bia-system-prompt';

interface PendingFill {
  field: string;
  value: string;
  label: string;
}

interface BiaChatInputProps {
  stepId: WizardStepId;
  chatHistory: ChatMessage[];
  state: WizardState;
  ownerId?: string;
  onSendMessage: (message: ChatMessage) => void;
  onBiaResponse: (message: ChatMessage) => void;
  onFillField: (field: string, value: string) => void;
}

function parseBiaResponse(text: string): { cleanText: string; fills: PendingFill[] } {
  const fills: PendingFill[] = [];
  const fillRegex = /---FILL---\s*([\s\S]*?)\s*---END---/g;

  const cleanText = text
    .replace(fillRegex, (_, jsonStr) => {
      try {
        const parsed = JSON.parse(jsonStr.trim());
        if (parsed.field && parsed.value !== undefined) {
          fills.push({
            field: parsed.field,
            value: String(parsed.value),
            label: parsed.label || parsed.field,
          });
        }
      } catch {
        // ignore parse errors
      }
      return '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { cleanText, fills };
}

export function BiaChatInput({
  stepId,
  chatHistory,
  state,
  ownerId,
  onSendMessage,
  onBiaResponse,
  onFillField,
}: BiaChatInputProps) {
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [pendingFills, setPendingFills] = useState<PendingFill[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, isThinking, pendingFills]);

  useEffect(() => {
    setPendingFills([]);
  }, [stepId]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isThinking) return;

    const userMsg: ChatMessage = {
      id: Math.random().toString(36).slice(2),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    onSendMessage(userMsg);
    setInput('');
    setIsThinking(true);

    try {
      const systemPrompt = buildBiaSystemPrompt(stepId, state);

      // Build conversation history for the edge function
      const conversationHistory = [
        ...chatHistory.map(msg => ({
          role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: msg.content,
        })),
        { role: 'user' as const, content: text },
      ];

      const { data, error: fnError } = await supabase.functions.invoke('ai-copilot-chat', {
        body: {
          message: text,
          systemPrompt,
          conversationHistory,
          ownerId: ownerId || undefined,
        },
      });

      if (fnError) throw fnError;
      if (!data?.response) throw new Error('Resposta vazia da IA');

      const rawResponse: string = data.response;
      const { cleanText, fills } = parseBiaResponse(rawResponse);

      const biaMsg: ChatMessage = {
        id: Math.random().toString(36).slice(2),
        role: 'bia',
        content: cleanText || rawResponse,
        timestamp: new Date(),
      };
      onBiaResponse(biaMsg);

      if (fills.length > 0) {
        setPendingFills(prev => {
          // Replace existing fills for the same field, add new ones
          const existingFields = fills.map(f => f.field);
          const kept = prev.filter(p => !existingFields.includes(p.field));
          return [...kept, ...fills];
        });
      }
    } catch (err) {
      console.error('[BiaChatInput] OpenAI error:', err);
      const errorMsg: ChatMessage = {
        id: Math.random().toString(36).slice(2),
        role: 'bia',
        content: 'Desculpe, não consegui processar sua mensagem agora. Verifique sua conexão e tente novamente.',
        timestamp: new Date(),
      };
      onBiaResponse(errorMsg);
    } finally {
      setIsThinking(false);
    }
  };

  const handleAcceptFill = (fill: PendingFill) => {
    onFillField(fill.field, fill.value);
    setPendingFills(prev => prev.filter(f => f.field !== fill.field));

    const confirmMsg: ChatMessage = {
      id: Math.random().toString(36).slice(2),
      role: 'bia',
      content: `✅ Preenchi o campo **${fill.label}** para você! Revise o conteúdo e faça ajustes se necessário.`,
      timestamp: new Date(),
    };
    onBiaResponse(confirmMsg);
  };

  const handleDeclineFill = (fill: PendingFill) => {
    setPendingFills(prev => prev.filter(f => f.field !== fill.field));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="space-y-2">
      {/* Label */}
      <p className="text-xs text-white/40 text-center">
        {chatHistory.length === 0
          ? 'Tem dúvidas? Peça para a Bia preencher um campo para você:'
          : 'Conversa com a Bia:'}
      </p>

      {/* Chat history */}
      {chatHistory.length > 0 && (
        <div
          ref={scrollRef}
          className={cn(
            'max-h-52 overflow-y-auto space-y-2 pr-1',
            'scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent',
          )}
        >
          {chatHistory.map(msg => (
            <BiaMessageBubble
              key={msg.id}
              message={msg.content}
              isUser={msg.role === 'user'}
              animationDelay={0}
            />
          ))}
          {isThinking && <BiaTypingIndicator />}
        </div>
      )}
      {chatHistory.length === 0 && isThinking && <BiaTypingIndicator />}

      {/* Pending fill suggestions */}
      {pendingFills.map(fill => (
        <div
          key={fill.field}
          className="rounded-xl bg-violet-500/10 border border-violet-500/30 p-3 space-y-2 animate-in slide-in-from-bottom-2 fade-in duration-300"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
            <p className="text-xs font-semibold text-violet-300">Sugestão: {fill.label}</p>
          </div>
          <p className="text-xs text-white/70 leading-relaxed line-clamp-4">{fill.value}</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleAcceptFill(fill)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-500 hover:bg-violet-400 text-white transition-colors duration-200"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Aceitar sugestão
            </button>
            <button
              onClick={() => handleDeclineFill(fill)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors duration-200"
            >
              <X className="w-3.5 h-3.5" />
              Recusar
            </button>
          </div>
        </div>
      ))}

      {/* Input field */}
      <div className="flex gap-2 items-center">
        <input
          className={cn(
            'flex-1 px-4 py-2.5 rounded-xl text-sm',
            'bg-white/10 border border-white/20 text-white placeholder:text-white/40',
            'focus:outline-none focus:ring-1 focus:ring-violet-400/60 focus:border-violet-400/60',
            'transition-all duration-200',
          )}
          placeholder="Ex: Crie uma descrição para minha empresa..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isThinking}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isThinking}
          className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
            'bg-violet-500 hover:bg-violet-400 disabled:opacity-40 disabled:cursor-not-allowed',
            'transition-all duration-200',
          )}
        >
          <Send className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  );
}
