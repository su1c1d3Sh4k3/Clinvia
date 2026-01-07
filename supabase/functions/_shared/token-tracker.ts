// Token Tracker Utility - Shared across Edge Functions
// Price table in USD per 1M tokens

const PRICE_TABLE: Record<string, { input: number; output: number }> = {
    'gpt-4.1': { input: 2.00, output: 8.00 },
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4-turbo': { input: 10.00, output: 30.00 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
};

export function calculateCost(
    model: string,
    promptTokens: number,
    completionTokens: number
): number {
    const prices = PRICE_TABLE[model] || PRICE_TABLE['gpt-4.1'];
    return (promptTokens * prices.input / 1000000) + (completionTokens * prices.output / 1000000);
}

export interface TokenUsageParams {
    ownerId: string;
    teamMemberId?: string | null;
    functionName: string;
    model: string;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens?: number;
    };
}

export async function trackTokenUsage(
    supabaseAdmin: any,
    params: TokenUsageParams
): Promise<void> {
    const { ownerId, teamMemberId, functionName, model, usage } = params;

    if (!ownerId || !usage?.prompt_tokens) {
        console.log('[token-tracker] Skipping - missing ownerId or usage data');
        return;
    }

    const costUsd = calculateCost(model, usage.prompt_tokens, usage.completion_tokens);

    try {
        const { error } = await supabaseAdmin.rpc('track_token_usage', {
            p_owner_id: ownerId,
            p_team_member_id: teamMemberId || null,
            p_function_name: functionName,
            p_model: model,
            p_prompt_tokens: usage.prompt_tokens,
            p_completion_tokens: usage.completion_tokens,
            p_cost_usd: costUsd
        });

        if (error) {
            console.error('[token-tracker] RPC error:', error);
        } else {
            console.log(`[token-tracker] Tracked ${usage.prompt_tokens + usage.completion_tokens} tokens for ${functionName}`);
        }
    } catch (error) {
        console.error('[token-tracker] Exception:', error);
        // Don't throw - tracking failure shouldn't break main function
    }
}

// Helper to get owner_id from conversation
export async function getOwnerFromConversation(
    supabaseAdmin: any,
    conversationId: string
): Promise<string | null> {
    try {
        const { data, error } = await supabaseAdmin
            .from('conversations')
            .select('user_id')
            .eq('id', conversationId)
            .single();

        if (error || !data) return null;
        return data.user_id;
    } catch {
        return null;
    }
}

// Helper to get team_member_id from auth_user_id
export async function getTeamMemberFromAuthId(
    supabaseAdmin: any,
    authUserId: string
): Promise<string | null> {
    try {
        const { data, error } = await supabaseAdmin
            .from('team_members')
            .select('id')
            .eq('auth_user_id', authUserId)
            .single();

        if (error || !data) return null;
        return data.id;
    } catch {
        return null;
    }
}

// =============================================
// Custom OpenAI Token Functions
// =============================================

export interface OpenAITokenResult {
    token: string;
    isCustom: boolean;
}

// Get OpenAI token for a profile (custom or default)
export async function getOpenAIToken(
    supabaseAdmin: any,
    ownerId: string | null
): Promise<OpenAITokenResult> {
    const defaultToken = Deno.env.get('OPENAI_API_KEY') || '';

    if (!ownerId) {
        return { token: defaultToken, isCustom: false };
    }

    try {
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('openai_token')
            .eq('id', ownerId)
            .single();

        if (profile?.openai_token) {
            return { token: profile.openai_token, isCustom: true };
        }
    } catch (err) {
        console.error('[getOpenAIToken] Error fetching custom token:', err);
    }

    return { token: defaultToken, isCustom: false };
}

// Mark token as invalid and set alert
async function markTokenInvalid(supabaseAdmin: any, ownerId: string): Promise<void> {
    try {
        await supabaseAdmin
            .from('profiles')
            .update({ openai_token_invalid: true })
            .eq('id', ownerId);
        console.log(`[markTokenInvalid] Marked token invalid for profile ${ownerId}`);
    } catch (err) {
        console.error('[markTokenInvalid] Error:', err);
    }
}

// Clear token invalid flag
export async function clearTokenInvalid(supabaseAdmin: any, ownerId: string): Promise<void> {
    try {
        await supabaseAdmin
            .from('profiles')
            .update({ openai_token_invalid: false })
            .eq('id', ownerId);
    } catch (err) {
        console.error('[clearTokenInvalid] Error:', err);
    }
}

export interface OpenAIRequestConfig {
    endpoint: string;
    body: any;
    method?: string;
    isFormData?: boolean;
}

export interface OpenAIRequestResult {
    response: Response;
    usedCustomToken: boolean;
}

// Make OpenAI request with automatic fallback
export async function makeOpenAIRequest(
    supabaseAdmin: any,
    ownerId: string | null,
    config: OpenAIRequestConfig
): Promise<OpenAIRequestResult> {
    const { token: customToken, isCustom } = await getOpenAIToken(supabaseAdmin, ownerId);
    const defaultToken = Deno.env.get('OPENAI_API_KEY') || '';

    // Prepare headers based on content type
    const makeHeaders = (token: string) => {
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${token}`,
        };
        if (!config.isFormData) {
            headers['Content-Type'] = 'application/json';
        }
        return headers;
    };

    // Prepare body
    const getBody = () => {
        if (config.isFormData) {
            return config.body; // FormData
        }
        return JSON.stringify(config.body);
    };

    // Try custom token first if available
    if (isCustom && customToken && ownerId) {
        try {
            const response = await fetch(config.endpoint, {
                method: config.method || 'POST',
                headers: makeHeaders(customToken),
                body: getBody(),
            });

            if (response.ok) {
                // Clear any previous invalid flag
                await clearTokenInvalid(supabaseAdmin, ownerId);
                return { response, usedCustomToken: true };
            }

            // If 401 (unauthorized) or 429 (quota exceeded), mark invalid and fallback
            if (response.status === 401 || response.status === 429) {
                console.warn(`[makeOpenAIRequest] Custom token failed (${response.status}), marking invalid and falling back`);
                await markTokenInvalid(supabaseAdmin, ownerId);
            } else {
                // Other errors (4xx, 5xx) - still return custom response
                return { response, usedCustomToken: true };
            }
        } catch (err) {
            console.error('[makeOpenAIRequest] Custom token request failed:', err);
            await markTokenInvalid(supabaseAdmin, ownerId);
        }
    }

    // Use default token
    const response = await fetch(config.endpoint, {
        method: config.method || 'POST',
        headers: makeHeaders(defaultToken),
        body: getBody(),
    });

    return { response, usedCustomToken: false };
}

// =============================================
// Audio Cost Tracking
// =============================================

// Audio price table in USD
const AUDIO_PRICE_TABLE: Record<string, { perMinute?: number; perKCharacters?: number }> = {
    'whisper-1': { perMinute: 0.006 },          // Transcrição: $0.006 per minute
    'tts-1': { perKCharacters: 0.015 },         // TTS padrão: $0.015 per 1K characters
    'tts-1-hd': { perKCharacters: 0.030 },      // TTS HD: $0.030 per 1K characters
};

export function calculateAudioCost(
    model: string,
    durationSeconds?: number,
    characters?: number
): number {
    const prices = AUDIO_PRICE_TABLE[model];
    if (!prices) {
        console.warn(`[audio-tracker] Unknown model: ${model}, using default pricing`);
        return 0;
    }

    if (prices.perMinute && durationSeconds) {
        // Whisper transcrição
        return (durationSeconds / 60) * prices.perMinute;
    }

    if (prices.perKCharacters && characters) {
        // TTS
        return (characters / 1000) * prices.perKCharacters;
    }

    return 0;
}

export interface AudioUsageParams {
    ownerId: string;
    teamMemberId?: string | null;
    functionName: string;
    model: string;
    durationSeconds?: number;
    characters?: number;
    costUsd?: number; // Override calculated cost
}

export async function trackAudioUsage(
    supabaseAdmin: any,
    params: AudioUsageParams
): Promise<void> {
    const { ownerId, teamMemberId, functionName, model, durationSeconds, characters, costUsd } = params;

    if (!ownerId) {
        console.log('[audio-tracker] Skipping - missing ownerId');
        return;
    }

    const cost = costUsd ?? calculateAudioCost(model, durationSeconds, characters);

    try {
        const { error } = await supabaseAdmin.rpc('track_audio_usage', {
            p_owner_id: ownerId,
            p_team_member_id: teamMemberId || null,
            p_function_name: functionName,
            p_model: model,
            p_audio_duration_seconds: durationSeconds || 0,
            p_characters_processed: characters || 0,
            p_cost_usd: cost
        });

        if (error) {
            console.error('[audio-tracker] RPC error:', error);
        } else {
            console.log(`[audio-tracker] Tracked audio cost $${cost.toFixed(6)} for ${functionName}`);
        }
    } catch (error) {
        console.error('[audio-tracker] Exception:', error);
    }
}
