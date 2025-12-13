import { useAutoFollowUpProcessor } from "@/hooks/useFollowUp";

/**
 * AutoFollowUpProcessor
 * 
 * This component runs in the background and periodically calls
 * the process-auto-follow-up edge function to send pending
 * automatic follow-up messages.
 * 
 * It should be mounted once in the application, typically in App.tsx
 */
export function AutoFollowUpProcessor() {
    useAutoFollowUpProcessor();
    return null; // This component doesn't render anything
}
