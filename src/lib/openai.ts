
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const OPENAI_MODEL = import.meta.env.VITE_OPENAI_MODEL || "gpt-4o-mini";

if (!OPENAI_API_KEY) {
    console.error("❌ VITE_OPENAI_API_KEY is not defined in .env");
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export const openaiApi = {
    generateResponse: async (messages: ChatMessage[]) => {
        console.log('🤖 OpenAI Request:', {
            model: OPENAI_MODEL,
            messageCount: messages.length,
            hasApiKey: !!OPENAI_API_KEY
        });

        if (!OPENAI_API_KEY) {
            throw new Error('OpenAI API Key não configurada. Verifique o arquivo .env');
        }

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: OPENAI_MODEL,
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 1000
                })
            });

            console.log('🤖 OpenAI Response Status:', response.status);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
                console.error('❌ OpenAI API Error:', errorData);
                throw new Error(`OpenAI API Error: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            const content = data.choices[0].message.content;

            console.log('✅ OpenAI Response received:', content?.substring(0, 100) + '...');

            return content;
        } catch (error) {
            console.error("❌ Failed to generate OpenAI response:", error);
            throw error;
        }
    }
};
