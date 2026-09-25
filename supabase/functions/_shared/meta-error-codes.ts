// Tabela unica dos codigos de erro de envio da Meta (WhatsApp Cloud API).
//
// Fonte de verdade para tres decisoes que antes estavam espalhadas:
//   1. reenviar ou nao (grupo "passageiro" x "bloqueio");
//   2. avisar o super admin ou nao (grupo "defeito" x "conta");
//   3. o que o atendente le no inbox (titulo, explicacao, origem).
//
// O gemeo do front e src/lib/metaErrorCodes.ts — os dois precisam andar juntos.
// Editar este arquivo obriga redeploy de TODA function que o importa
// (o bundler do Deno inclui _shared transitivamente).

export type GrupoErroMeta =
    | "passageiro" // falha temporaria: vale reenviar
    | "bloqueio" // regra/limite da Meta ou recusa do destinatario: NUNCA reenviar
    | "defeito" // defeito nosso (payload/template/numero mal montado): avisa
    | "conta" // a conta inteira esta impedida: avisa
    | "desconhecido"; // codigo fora da tabela: conta no resumo, sem alerta

export interface ErroMeta {
    grupo: GrupoErroMeta;
    titulo: string;
    explicacao: string;
    origem: string;
}

// Passageiros: reenviar 3 vezes (30s, 2min, 10min).
export const CODIGOS_PASSAGEIROS = new Set([
    "131000",
    "131016",
    "130429",
    "131056",
]);

// Bloqueio/regra: nunca reenviar.
export const CODIGOS_BLOQUEIO = new Set([
    "131049",
    "131048",
    "131050",
    "131026",
    "131047",
    "131051",
    "131053",
    "130472",
    "130497",
]);

// Defeito nosso: nunca reenviar, e SEMPRE avisa.
export const CODIGOS_DEFEITO = new Set([
    "131008",
    "131009",
    "131021",
    "131045",
]);

// A conta inteira esta impedida: nunca reenviar, e SEMPRE avisa.
export const CODIGOS_CONTA = new Set([
    "131031",
    "131042",
]);

export const TABELA_ERROS_META: Record<string, ErroMeta> = {
    // ---------- passageiros ----------
    "131000": {
        grupo: "passageiro",
        titulo: "Falha temporaria no envio",
        explicacao:
            "A Meta teve um problema momentaneo e nao conseguiu entregar agora. Estamos tentando de novo automaticamente.",
        origem: "instabilidade momentanea da Meta",
    },
    "131016": {
        grupo: "passageiro",
        titulo: "Servico da Meta indisponivel",
        explicacao:
            "O servico de mensagens da Meta ficou fora do ar por alguns instantes. Estamos tentando de novo automaticamente.",
        origem: "servico da Meta fora do ar",
    },
    "130429": {
        grupo: "passageiro",
        titulo: "Limite de velocidade atingido",
        explicacao:
            "Muitas mensagens sairam em pouco tempo e a Meta segurou esta. Estamos reenviando com intervalo maior.",
        origem: "limite de velocidade da Meta",
    },
    "131056": {
        grupo: "passageiro",
        titulo: "Muitas mensagens para o mesmo numero",
        explicacao:
            "A Meta limitou a quantidade de mensagens seguidas para este contato. Estamos tentando de novo automaticamente.",
        origem: "limite por par de numeros da Meta",
    },

    // ---------- bloqueio / regra ----------
    "131049": {
        grupo: "bloqueio",
        titulo: "Envio barrado pela Meta",
        explicacao:
            "A Meta bloqueou esta entrega para preservar a saude do ecossistema — costuma acontecer com muitas mensagens de marketing para o mesmo numero. Tente mais tarde ou fale por outro canal.",
        origem: "regra da Meta para contas comerciais",
    },
    "131048": {
        grupo: "bloqueio",
        titulo: "Envio barrado por qualidade",
        explicacao:
            "O numero da clinica esta com a qualidade baixa no WhatsApp e a Meta limitou os envios. Reduza os disparos em massa por alguns dias.",
        origem: "limite por qualidade do numero",
    },
    "131050": {
        grupo: "bloqueio",
        titulo: "Contato optou por nao receber",
        explicacao:
            "Este contato pediu para nao receber mensagens de marketing da clinica. So e possivel falar se ele escrever primeiro.",
        origem: "preferencia do proprio contato",
    },
    "131026": {
        grupo: "bloqueio",
        titulo: "Numero nao recebe WhatsApp",
        explicacao:
            "O numero nao tem WhatsApp ativo ou nao pode receber esta mensagem. Confira o telefone no cadastro ou use outro canal.",
        origem: "numero do destinatario",
    },
    "131047": {
        grupo: "bloqueio",
        titulo: "Janela de 24 horas fechada",
        explicacao:
            "Passaram-se mais de 24 horas desde a ultima mensagem do contato, entao so e possivel falar por template aprovado.",
        origem: "janela de atendimento do WhatsApp",
    },
    "131051": {
        grupo: "bloqueio",
        titulo: "Tipo de mensagem nao permitido",
        explicacao:
            "A Meta nao aceita este tipo de mensagem para este contato agora. Tente enviar como texto ou por template aprovado.",
        origem: "regra de tipo de mensagem da Meta",
    },
    "131053": {
        grupo: "bloqueio",
        titulo: "Arquivo recusado pela Meta",
        explicacao:
            "A Meta nao conseguiu processar o anexo (formato ou tamanho). Envie o arquivo em outro formato ou reduza o tamanho.",
        origem: "arquivo enviado",
    },
    "130472": {
        grupo: "bloqueio",
        titulo: "Contato fora do experimento",
        explicacao:
            "Este contato faz parte de um grupo de controle da Meta e nao recebe mensagens de marketing. Fale por outro canal.",
        origem: "experimento de usuario da Meta",
    },
    "130497": {
        grupo: "bloqueio",
        titulo: "Mensagem de marketing barrada",
        explicacao:
            "A Meta esta limitando mensagens de marketing para este contato no momento. Tente mais tarde ou fale por outro canal.",
        origem: "limite de marketing da Meta",
    },

    // ---------- defeito nosso ----------
    "131008": {
        grupo: "defeito",
        titulo: "Envio nao concluido",
        explicacao:
            "A mensagem saiu incompleta e a Meta recusou. Ja avisamos o suporte — tente reenviar em alguns minutos.",
        origem: "defeito do sistema",
    },
    "131009": {
        grupo: "defeito",
        titulo: "Envio nao concluido",
        explicacao:
            "Algum dado da mensagem saiu fora do formato aceito pela Meta. Ja avisamos o suporte — tente reenviar em alguns minutos.",
        origem: "defeito do sistema",
    },
    "131021": {
        grupo: "defeito",
        titulo: "Numero de origem e destino iguais",
        explicacao:
            "A mensagem foi enviada do numero da clinica para ele mesmo. Confira o telefone no cadastro do contato.",
        origem: "cadastro do contato",
    },
    "131045": {
        grupo: "defeito",
        titulo: "Envio nao concluido",
        explicacao:
            "O certificado do numero da clinica precisa ser renovado na Meta. Ja avisamos o suporte.",
        origem: "configuracao do numero na Meta",
    },

    // ---------- conta inteira ----------
    "131031": {
        grupo: "conta",
        titulo: "Conta da clinica bloqueada",
        explicacao:
            "A Meta bloqueou a conta de WhatsApp da clinica e nenhuma mensagem sai enquanto isso durar. Ja avisamos o suporte.",
        origem: "bloqueio da conta na Meta",
    },
    "131042": {
        grupo: "conta",
        titulo: "Pagamento pendente na Meta",
        explicacao:
            "A Meta suspendeu os envios por pendencia de pagamento na conta da clinica. Ja avisamos o suporte.",
        origem: "cobranca da conta na Meta",
    },
};

/** `true` para a familia 1320xx inteira (erros de template), que nunca se reenvia. */
export function ehFamiliaTemplate(codigo: string): boolean {
    return /^1320\d{2}$/.test(codigo);
}

const ERRO_TEMPLATE: ErroMeta = {
    grupo: "bloqueio",
    titulo: "Template recusado pela Meta",
    explicacao:
        "A Meta recusou o modelo de mensagem usado (pode estar sem aprovacao, pausado ou com variaveis fora do formato). Escolha outro template ou fale pelo chat normal.",
    origem: "modelo de mensagem da Meta",
};

const ERRO_DESCONHECIDO: ErroMeta = {
    grupo: "desconhecido",
    titulo: "Envio nao concluido",
    explicacao:
        "A Meta nao aceitou esta mensagem e nao informou um motivo que saibamos traduzir. Tente enviar de novo; se repetir, fale com o suporte.",
    origem: "resposta da Meta",
};

/** Traducao do codigo para o inbox. Codigo fora da tabela cai no texto generico. */
export function descreverErroMeta(codigo: string | number | null | undefined): ErroMeta {
    const c = codigo == null ? "" : String(codigo).trim();
    if (!c) return ERRO_DESCONHECIDO;
    const achado = TABELA_ERROS_META[c];
    if (achado) return achado;
    if (ehFamiliaTemplate(c)) return ERRO_TEMPLATE;
    return ERRO_DESCONHECIDO;
}

export function grupoDoErroMeta(
    codigo: string | number | null | undefined,
    httpStatus?: number | null,
): GrupoErroMeta {
    const c = codigo == null ? "" : String(codigo).trim();
    if (CODIGOS_PASSAGEIROS.has(c)) return "passageiro";
    if (CODIGOS_DEFEITO.has(c)) return "defeito";
    if (CODIGOS_CONTA.has(c)) return "conta";
    if (CODIGOS_BLOQUEIO.has(c) || ehFamiliaTemplate(c)) return "bloqueio";
    // 5xx do proprio Graph tambem e passageiro, mesmo sem codigo de aplicacao.
    if (httpStatus != null && httpStatus >= 500 && httpStatus <= 599) return "passageiro";
    return "desconhecido";
}

/** Reenvio automatico so para o grupo passageiro. */
export function devoReenviar(
    codigo: string | number | null | undefined,
    httpStatus?: number | null,
): boolean {
    return grupoDoErroMeta(codigo, httpStatus) === "passageiro";
}

/** Espera de cada tentativa, em segundos: 30s, 2min, 10min. */
export const ESPERA_REENVIO_SEG = [30, 120, 600];
export const MAX_REENVIOS = ESPERA_REENVIO_SEG.length;

export function esperaDoReenvio(tentativa: number): number | null {
    if (tentativa < 1 || tentativa > MAX_REENVIOS) return null;
    return ESPERA_REENVIO_SEG[tentativa - 1];
}
