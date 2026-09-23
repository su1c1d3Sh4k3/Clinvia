// api-keys — uma chave por origem.
//
// POR QUE ISTO EXISTE
// Ate 23/09/2026 havia UMA chave (`SCHEDULING_API_KEY`) compartilhada pelo n8n,
// por chamada interna entre edge functions e por integracao de terceiro. Duas
// consequencias ruins, que a lista abaixo fecha de uma vez:
//
// 1. ATRIBUICAO. Como a chave nao dizia quem era, `report-incident` se recusava
//    — com razao — a inferir `ia_n8n` a partir dela. Medido em 23/09/2026: 39 de
//    41 incidentes sairam com `origem_inferida = true`. Chave por origem torna a
//    origem DECLARADA: o chamador se identifica no mesmo gesto em que se
//    autentica, sem header extra e sem editar um unico no do n8n.
// 2. SEGURANCA. Girar a chave unica obrigava a mexer em todos os consumidores no
//    mesmo minuto. Com uma chave por origem, cada uma gira sozinha.
//
// A CHAVE LEGADA CONTINUA VALENDO. Derrubar o n8n para arrumar rotulo seria a
// troca errada. Ela e lida como `ia_n8n` POR ELIMINACAO — os chamadores que nos
// controlamos ja migraram para chave propria — e por isso viaja marcada
// `declarada: false`, ou seja, `origem_inferida = true` no incidente. No dia em
// que os nos do n8n passarem a mandar API_KEY_N8N, a inferencia some sozinha e
// a legada pode ser removida daqui sem tocar em mais nada.
//
// ORDEM IMPORTA: a primeira chave que casar vence. A legada e SEMPRE a ultima,
// para que um valor duplicado por engano seja atribuido a origem especifica e
// nao a eliminacao.

/** Subconjunto de `IncidentOrigem` que uma chave de API pode declarar. */
export type OrigemDaChave = "ia_n8n" | "cron" | "edge_interna" | "integracao_externa";

export interface ChaveRegistrada {
    /** nome do segredo nos Edge Function Secrets */
    env: string;
    origem: OrigemDaChave;
    /**
     * `true` = a chave pertence a UMA origem, logo a origem e declarada.
     * `false` = deducao (hoje so a legada), e o incidente sai como inferido.
     */
    declarada: boolean;
}

const REGISTRO: readonly ChaveRegistrada[] = [
    { env: "API_KEY_N8N", origem: "ia_n8n", declarada: true },
    { env: "API_KEY_CRON", origem: "cron", declarada: true },
    { env: "API_KEY_EDGE", origem: "edge_interna", declarada: true },
    { env: "API_KEY_INTEGRACAO", origem: "integracao_externa", declarada: true },
    { env: "SCHEDULING_API_KEY", origem: "ia_n8n", declarada: false },
];

export interface ChaveConfigurada extends ChaveRegistrada {
    valor: string;
}

/**
 * As chaves que existem NESTE ambiente. Lida a cada chamada de proposito: trocar
 * um segredo no Supabase reinicia o isolate, mas cachear em modulo faria um
 * deploy parcial servir a lista velha por tempo indeterminado — e o custo de
 * quatro `Deno.env.get` e desprezivel ao lado disso.
 */
export function chavesConfiguradas(): ChaveConfigurada[] {
    const saida: ChaveConfigurada[] = [];
    for (const c of REGISTRO) {
        const valor = Deno.env.get(c.env);
        if (valor && valor.trim()) saida.push({ ...c, valor });
    }
    return saida;
}

/** A chave apresentada no `x-api-key`, se for uma das conhecidas. */
export function chaveDaRequisicao(req?: Request): ChaveConfigurada | null {
    if (!req) return null;
    const apresentada = req.headers.get("x-api-key");
    if (!apresentada) return null;
    return chavesConfiguradas().find((c) => c.valor === apresentada) ?? null;
}
