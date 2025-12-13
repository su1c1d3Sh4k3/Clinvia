import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const dbUrl = Deno.env.get('SUPABASE_DB_URL');

        if (!dbUrl) {
            return new Response(JSON.stringify({ error: "SUPABASE_DB_URL not found" }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const client = new Client(dbUrl);
        await client.connect();

        const sql = `
      -- Corrigir status 'resolved' para 'resolvido'
      UPDATE conversations SET status = 'resolvido' WHERE status = 'resolved';
      
      -- Corrigir status 'pending' para 'pendente'
      UPDATE conversations SET status = 'pendente' WHERE status = 'pending';
      
      -- Corrigir status 'open' para 'aberto'
      UPDATE conversations SET status = 'aberto' WHERE status = 'open';
      
      -- Garantir que status nulos virem pendente (se não atribuído) ou aberto (se atribuído)
      UPDATE conversations SET status = 'pendente' WHERE (status IS NULL OR status = '') AND assigned_agent_id IS NULL;
      UPDATE conversations SET status = 'aberto' WHERE (status IS NULL OR status = '') AND assigned_agent_id IS NOT NULL;
    `;

        await client.queryArray(sql);
        await client.end();

        return new Response(JSON.stringify({ success: true, message: "Data fixed successfully" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
