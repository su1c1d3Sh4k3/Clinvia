import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const url = new URL(req.url);
        const imageUrl = url.searchParams.get("url");

        if (!imageUrl) {
            return new Response("Missing url parameter", {
                status: 400,
                headers: corsHeaders
            });
        }

        // Validar que é uma URL do WhatsApp
        if (!imageUrl.includes("pps.whatsapp.net")) {
            return new Response("Invalid URL - only WhatsApp images allowed", {
                status: 400,
                headers: corsHeaders
            });
        }

        // Fazer fetch da imagem
        const imageResponse = await fetch(imageUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; Clinvia/1.0)",
            }
        });

        if (!imageResponse.ok) {
            console.error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
            return new Response("Failed to fetch image", {
                status: imageResponse.status,
                headers: corsHeaders
            });
        }

        const imageBlob = await imageResponse.blob();
        const contentType = imageResponse.headers.get("Content-Type") || "image/jpeg";

        // Retornar imagem com headers corretos
        return new Response(imageBlob, {
            headers: {
                ...corsHeaders,
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=3600", // Cache de 1 hora
            },
        });
    } catch (error: any) {
        console.error("Error proxying image:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 500,
                headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json"
                }
            }
        );
    }
});
