// zz-teste-monitoramento — o teste inverso da Etapa 2, morando no repositorio.
//
// Um monitor so esta provado quando alguem quebrou alguma coisa DE PROPOSITO e
// viu o incidente nascer. Fazer isso derrubando uma function de verdade nao
// serve: alem do risco, o incidente ficaria indistinguivel de um real no painel
// — e a regra desta casa e que ele sempre consiga separar alerta de simulado.
//
// Por isso esta function existe e fica. O componente e `zz-teste:edge-etapa2`,
// que casa com o prefixo `zz-teste:` do catalogo: severidade `baixa` e
// `somente_painel = true`. O despacho so reivindica `critica`/`alta`, entao
// nada daqui chega em telefone nenhum, nem por engano, nem depois.
//
// Nao tem efeito colateral: nao le nem escreve tabela de negocio, nao envia
// mensagem, nao toca em tenant. So provoca os tres caminhos que a Etapa 2
// afirma cobrir e deixa o resto acontecer sozinho.
//
// Exige chave de servico (`x-service-key`) — nao e endpoint aberto.

import { serveMonitored } from "../_shared/serve-monitored.ts";
import { fetchProvider } from "../_shared/provider-errors.ts";
import { reportIncident } from "../_shared/report-incident.ts";

const CHAVE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

serveMonitored("zz-teste:edge-etapa2", async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok");

    if (!CHAVE || req.headers.get("x-service-key") !== CHAVE) {
        return json({ success: false, error: "nao_autorizado" }, 401);
    }

    const caso = new URL(req.url).searchParams.get("caso") ?? "";

    switch (caso) {
        // 1. Excecao que escapa do handler. Prova o `catch` do envelope: sem
        //    ele isto seria um 502 do gateway, sem mensagem e sem incidente.
        case "excecao":
            throw new Error("falha proposital do teste inverso da Etapa 2");

        // 2. Resposta 5xx montada pelo proprio codigo, sem excecao nenhuma.
        //    Prova a mudanca de leitura: o envelope olha a RESPOSTA, entao um
        //    `return 500` escrito a mao — o caso que mais existe em producao —
        //    vira incidente sem ninguem ter lembrado de reportar.
        case "resposta500":
            return json({ success: false, error: "erro_proposital", message: "500 proposital do teste inverso" }, 500);

        // 3. Provedor externo recusando credencial. Prova o `fetchProvider`:
        //    o incidente sai em nome do PROVEDOR (`google:credencial_recusada`,
        //    `media`, so painel), nao desta function, e nasce mesmo com a
        //    function respondendo 200 — que e exatamente o buraco que ele
        //    fecha: terceiro quebrado atras de um fallback que funciona.
        case "provedor": {
            const r = await fetchProvider(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                { headers: { Authorization: "Bearer token-invalido-do-teste-inverso" } },
                { request: req, context: { zz_teste: true, motivo: "teste inverso da Etapa 2" } },
            );
            return json({ success: true, provedor_respondeu: r.status, observacao: "200 de proposito: o incidente do provedor nasce mesmo assim" });
        }

        // 4. Origem descoberta sozinha, sem ninguem passar o `req`. Simula os 77
        //    `dbErrorResponse` que moram em funcoes auxiliares: aqui o report sai
        //    de dentro de outra funcao, que nao recebeu requisicao nenhuma. Com o
        //    contexto valendo, a origem tem que sair DECLARADA (o header
        //    `x-origin` do chamador) e nao `nao_identificada`.
        case "origem-ambiente": {
            const auxiliarQueNaoRecebeuReq = () => {
                reportIncident({
                    route: "teste-origem-ambiente",
                    httpCode: 500,
                    message: "origem descoberta pelo contexto, sem req passado na mão",
                    context: { zz_teste: true },
                });
            };
            await new Promise((r) => setTimeout(r, 5)); // atravessa um await de propósito
            auxiliarQueNaoRecebeuReq();
            return json({ success: true, observacao: "veja origem/origem_inferida do incidente" });
        }

        default:
            return json({ success: false, error: "caso_invalido", casos: ["excecao", "resposta500", "provedor", "origem-ambiente"] }, 400);
    }
});
