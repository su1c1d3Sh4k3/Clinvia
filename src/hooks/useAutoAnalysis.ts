import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { openaiApi } from "@/lib/openai";

export const useAutoAnalysis = (conversationId?: string, isGroup: boolean = false) => {
    const [satisfactionScore, setSatisfactionScore] = useState<number>(5);
    const [speedScore, setSpeedScore] = useState<number>(10);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    const [lastClientMessageTime, setLastClientMessageTime] = useState<Date | null>(null);

    // 2. Main Effect: Fetch Initial Score, Analyze Messages, and Realtime Subscription
    useEffect(() => {
        if (!conversationId || isGroup) return;

        // Carregar score salvo inicialmente
        const fetchSavedScore = async () => {
            const { data } = await supabase
                .from("ai_analysis")
                .select("sentiment_score, last_updated")
                .eq("conversation_id", conversationId)
                .maybeSingle();

            const typedData = data as any;
            if (typedData?.sentiment_score) {
                setSatisfactionScore(typedData.sentiment_score);
            }
            if (typedData?.last_updated) {
                setLastUpdated(typedData.last_updated);
            }
        };

        fetchSavedScore();

        // Função para buscar mensagens e calcular scores de velocidade
        const analyzeMessages = async () => {
            const { data: messages } = await supabase
                .from("messages")
                .select("*")
                .eq("conversation_id", conversationId)
                .order("created_at", { ascending: true });

            const typedMessages = (messages || []) as any[];

            if (!typedMessages || typedMessages.length === 0) return;

            // Calcular tempos de resposta
            const responseTimes: number[] = [];
            let inboundCount = 0;

            for (let i = 0; i < typedMessages.length; i++) {
                if (typedMessages[i].direction === 'inbound') {
                    inboundCount++;
                }
            }

            for (let i = 0; i < typedMessages.length - 1; i++) {
                if (typedMessages[i].direction === 'inbound') {
                    for (let j = i + 1; j < typedMessages.length; j++) {
                        if (typedMessages[j].direction === 'outbound') {
                            const clientTime = new Date(typedMessages[i].created_at);
                            const agentTime = new Date(typedMessages[j].created_at);
                            const diffMinutes = (agentTime.getTime() - clientTime.getTime()) / 1000 / 60;
                            responseTimes.push(diffMinutes);
                            break;
                        }
                    }
                }
            }

            // Se ainda aguardando resposta
            if (typedMessages.length > 0 && typedMessages[typedMessages.length - 1].direction === 'inbound') {
                const lastClientTime = new Date(typedMessages[typedMessages.length - 1].created_at);
                setLastClientMessageTime(lastClientTime);

                const currentDiff = (new Date().getTime() - lastClientTime.getTime()) / 1000 / 60;
                responseTimes.push(currentDiff);
            } else {
                setLastClientMessageTime(null);
            }

            // Calcular média
            if (responseTimes.length > 0) {
                const avgMinutes = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

                let speed = 10;
                if (avgMinutes <= 3) speed = 10;
                else if (avgMinutes <= 6) speed = 8;
                else if (avgMinutes <= 10) speed = 4;
                else if (avgMinutes <= 15) speed = 2;
                else speed = 0;

                setSpeedScore(speed);
            }

            return inboundCount;
        };

        analyzeMessages();

        // Inscrever para mudanças em tempo real (APENAS PARA ATUALIZAR UI)
        const channelName = `auto-analysis-${conversationId}-${Date.now()}`;

        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `conversation_id=eq.${conversationId}`
                },
                async (payload) => {
                    await analyzeMessages(); // Recalculate speed
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPSERT',
                    schema: 'public',
                    table: 'ai_analysis',
                    filter: `conversation_id=eq.${conversationId}`
                },
                (payload) => {
                    if (payload.new && 'sentiment_score' in payload.new) {
                        const newScore = (payload.new as any).sentiment_score;
                        setSatisfactionScore(newScore);
                        setLastUpdated(new Date().toISOString());
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [conversationId, isGroup]);

    // 3. Timer Effect for Speed Score
    useEffect(() => {
        if (!lastClientMessageTime) return;

        const interval = setInterval(() => {
            const now = new Date();
            const diffMinutes = (now.getTime() - lastClientMessageTime.getTime()) / 1000 / 60;

            let speed = 10;
            if (diffMinutes <= 3) speed = 10;
            else if (diffMinutes <= 6) speed = 8;
            else if (diffMinutes <= 10) speed = 4;
            else if (diffMinutes <= 15) speed = 2;
            else speed = 0;

            setSpeedScore(speed);
        }, 10000); // Atualizar a cada 10s

        return () => clearInterval(interval);
    }, [lastClientMessageTime]);

    return { satisfactionScore, speedScore, lastUpdated };
};
