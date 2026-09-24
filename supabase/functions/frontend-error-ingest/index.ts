// frontend-error-ingest — porta de entrada dos erros do navegador.
//
// É a única function do projeto que aceita chamada anônima de propósito: o erro
// que mais interessa é justamente o que acontece ANTES de o usuário conseguir
// logar (tela branca no boot, falha no Auth). Exigir JWT aqui seria fechar a
// porta exatamente no caso que motivou abrir.
//
// Aceitar chamada anônima cobra três cuidados, e todos estão implementados
// abaixo, não prometidos:
//
//   1. Nada do que chega vira comando. O corpo é só texto, truncado, e vai para
//      `incident_record` como mensagem. Nenhum campo do payload escolhe tabela,
//      severidade ou destinatário.
//   2. Teto de volume no SERVIDOR. O freio do navegador (8 por sessão) não vale
//      nada sozinho: cada aba é uma sessão, e quem quiser abusar não roda o
//      nosso código. Aqui o `request_id` é determinístico — versão + rota +
//      erro + hora — então a mesma falha repetida vira UM evento por hora, por
//      mais vezes que chegue.
//   3. Nada daqui acorda telefone. `front:` entra no catálogo como `baixa` e
//      `somente_painel`, porque não existe medição nenhuma de volume real de
//      erro de front neste projeto — nunca foi coletado. Calibrar com dado, e
//      só então decidir promover, é o oposto de chutar um limiar hoje e
//      descobrir na madrugada que era baixo demais.
//
// Não usa `serveMonitored`: um erro DESTA function virando incidente é o laço
// que o próprio plano manda evitar. Ela reporta o próprio defeito só no log.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/** Corta e normaliza. Campo ausente vira string vazia, nunca `undefined`. */
const texto = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

    try {
        const body = await req.json().catch(() => null);
        if (!body || typeof body !== "object") {
            return json({ success: false, error: "corpo_invalido" }, 400);
        }

        const p = body as Record<string, unknown>;
        const mensagem = texto(p.mensagem, 400);
        if (!mensagem) return json({ success: false, error: "mensagem_vazia" }, 400);

        const versao = texto(p.versao, 60) || "desconhecida";
        const rota = texto(p.rota, 120) || "/";
        const tipo = ["render", "promise", "global"].includes(String(p.tipo)) ? String(p.tipo) : "global";
        const nome = texto(p.nome, 80) || "Error";
        const navegador = texto(p.navegador, 40) || "desconhecido";
        const onde = texto(p.onde, 60);
        const pilha = texto(p.pilha, 2000);

        // Uma linha por (bundle, rota, erro) por hora. É este cálculo — e não o
        // contador do navegador — que segura um loop de render.
        const hora = new Date().toISOString().slice(0, 13);
        const assinatura = await sha1(`${versao}|${rota}|${tipo}|${nome}|${mensagem}`);
        const requestId = `front:${assinatura}:${hora}`;

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );

        const { data, error } = await supabase.rpc("incident_record", {
            p_payload: {
                source: "frontend",
                // O componente é a ROTA, não "o front": saber que quebrou em
                // /crm é acionável, "erro no front" não é.
                component: `front:${rota}`,
                route: tipo === "render" && onde ? `render em ${onde}` : tipo,
                error_name: nome,
                error_message: mensagem,
                error_description: `Navegador: ${navegador}. Bundle: ${versao}.`,
                error_stack: pilha || null,
                request_id: requestId,
                origem: "front",
                context: { versao, rota, tipo, navegador, onde: onde || null },
            },
        });

        if (error) {
            // Regra do plano: o reporter não pode virar o que estamos caçando.
            // Falhou, falhou — mas fica escrito no log desta function.
            console.error("[frontend-error-ingest] incident_record falhou:", error.message);
            return json({ success: false, error: "registro_falhou" }, 200);
        }

        return json({ success: true, skipped: (data as { skipped?: boolean })?.skipped ?? false });
    } catch (e) {
        console.error("[frontend-error-ingest] erro inesperado:", (e as Error)?.message ?? e);
        // 200 de propósito: se esta porta responde 5xx, o navegador do cliente
        // registra um erro de rede que ele tentaria reportar de volta.
        return json({ success: false, error: "erro_inesperado" }, 200);
    }
});

async function sha1(s: string): Promise<string> {
    const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
