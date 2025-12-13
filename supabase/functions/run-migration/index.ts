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

        const { sql } = await req.json();

        if (!sql) {
            return new Response(JSON.stringify({ error: "No SQL provided" }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const result = await client.queryArray(sql);
        await client.end();

        return new Response(JSON.stringify({ success: true, data: result.rows }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
