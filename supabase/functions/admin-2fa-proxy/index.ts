import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { action, code } = await req.json()

        let webhookUrl = ""
        let body: BodyInit | null = null

        if (action === "generate") {
            webhookUrl = "https://webhooks.clinvia.com.br/webhook/generate-code"
        } else if (action === "validate") {
            webhookUrl = "https://webhooks.clinvia.com.br/webhook/validade-code"
            body = JSON.stringify({ code })
        } else {
            return new Response(
                JSON.stringify({ error: "Invalid action" }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: body,
        })

        const text = await response.text()

        return new Response(
            JSON.stringify({ success: response.ok, response: text }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error"
        return new Response(
            JSON.stringify({ error: message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
    }
})
