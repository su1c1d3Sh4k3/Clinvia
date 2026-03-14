import { useEffect, useState, useRef } from 'react';
import { BiaTypingIndicator } from './BiaAvatar';
import { BiaMessageBubble } from './BiaMessageBubble';
import { BiaChatInput } from './BiaChatInput';
import { ChatMessage, WizardStepId, WizardState } from './wizard-state';
import { BIA_MESSAGES } from './bia-messages';

interface BiaStepContainerProps {
  stepId: WizardStepId;
  chatHistory: ChatMessage[];
  state: WizardState;
  ownerId?: string;
  onSendMessage: (message: ChatMessage) => void;
  onBiaResponse: (message: ChatMessage) => void;
  onFillField: (field: string, value: string) => void;
  children: React.ReactNode;
}

export function BiaStepContainer({
  stepId,
  chatHistory,
  state,
  ownerId,
  onSendMessage,
  onBiaResponse,
  onFillField,
  children,
}: BiaStepContainerProps) {
  const messages = BIA_MESSAGES[stepId] ?? [];
  const [visibleCount, setVisibleCount] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const prevStepRef = useRef(stepId);

  // Reset messages when step changes and reveal them one by one
  useEffect(() => {
    if (prevStepRef.current !== stepId) {
      prevStepRef.current = stepId;
      setVisibleCount(0);
      setIsTyping(false);
    }
  }, [stepId]);

  useEffect(() => {
    if (visibleCount >= messages.length) return;

    setIsTyping(true);
    const typingDuration = 600 + messages[visibleCount].length * 8;
    const timer = setTimeout(() => {
      setIsTyping(false);
      setVisibleCount(prev => prev + 1);
    }, Math.min(typingDuration, 2000));

    return () => clearTimeout(timer);
  }, [visibleCount, messages]);

  // Start showing first message on mount
  useEffect(() => {
    if (messages.length > 0 && visibleCount === 0) {
      setIsTyping(true);
      const timer = setTimeout(() => {
        setIsTyping(false);
        setVisibleCount(1);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* Bia scripted messages */}
      <div className="space-y-3">
        {messages.slice(0, visibleCount).map((msg, i) => (
          <BiaMessageBubble
            key={`${stepId}-msg-${i}`}
            message={msg}
            animationDelay={0}
          />
        ))}
        {isTyping && <BiaTypingIndicator />}
      </div>

      {/* Chat with Bia — shown ABOVE form after first message */}
      {visibleCount > 0 && (
        <div className="border border-white/10 rounded-xl p-3 bg-white/3">
          <BiaChatInput
            stepId={stepId}
            chatHistory={chatHistory}
            state={state}
            ownerId={ownerId}
            onSendMessage={onSendMessage}
            onBiaResponse={onBiaResponse}
            onFillField={onFillField}
          />
        </div>
      )}

      {/* Form content — appears after first Bia message */}
      {visibleCount > 0 && (
        <div
          key={`${stepId}-content`}
          className="animate-in slide-in-from-bottom-2 fade-in duration-300"
        >
          {children}
        </div>
      )}
    </div>
  );
}
