import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { token, ip } = await req.json()

        if (!token) {
            return new Response(
                JSON.stringify({ error: 'Token is required' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        // Verify with Cloudflare
        const turnstileSecret = Deno.env.get('TURNSTILE_SECRET_KEY');
        if (!turnstileSecret) {
            console.error('[verify-turnstile] TURNSTILE_SECRET_KEY not set in environment');
            return new Response(
                JSON.stringify({ error: 'Server configuration error' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
            )
        }

        const formData = new FormData()
        formData.append('secret', turnstileSecret)
        formData.append('response', token)
        if (ip) formData.append('remoteip', ip)

        const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            body: formData,
        })

        const outcome = await result.json()

        return new Response(
            JSON.stringify(outcome),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
    }
})
