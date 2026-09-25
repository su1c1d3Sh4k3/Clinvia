// Gemeo de front de supabase/functions/_shared/meta-error-codes.ts.
// Os dois arquivos precisam andar juntos: o back decide reenvio/alerta,
// o front usa a MESMA tabela para escrever o aviso no inbox.
//
// Regra do inbox: nunca mostrar texto cru da Meta, JSON ou stack.

export type GrupoErroMeta =
    | "passageiro"
    | "bloqueio"
    | "defeito"
    | "conta"
    | "desconhecido";

export interface ErroMeta {
    grupo: GrupoErroMeta;
    titulo: string;
    explicacao: string;
    origem: string;
}

export const CODIGOS_PASSAGEIROS = new Set(["131000", "131016", "130429", "131056"]);

export const TABELA_ERROS_META: Record<string, ErroMeta> = {
    "131000": {
        grupo: "passageiro",
        titulo: "Falha temporária no envio",
        explicacao:
            "A Meta teve um problema momentâneo e não conseguiu entregar agora. Estamos tentando de novo automaticamente.",
        origem: "instabilidade momentânea da Meta",
    },
    "131016": {
        grupo: "passageiro",
        titulo: "Serviço da Meta indisponível",
        explicacao:
            "O serviço de mensagens da Meta ficou fora do ar por alguns instantes. Estamos tentando de novo automaticamente.",
        origem: "serviço da Meta fora do ar",
    },
    "130429": {
        grupo: "passageiro",
        titulo: "Limite de velocidade atingido",
        explicacao:
            "Muitas mensagens saíram em pouco tempo e a Meta segurou esta. Estamos reenviando com intervalo maior.",
        origem: "limite de velocidade da Meta",
    },
    "131056": {
        grupo: "passageiro",
        titulo: "Muitas mensagens para o mesmo número",
        explicacao:
            "A Meta limitou a quantidade de mensagens seguidas para este contato. Estamos tentando de novo automaticamente.",
        origem: "limite por par de números da Meta",
    },

    "131049": {
        grupo: "bloqueio",
        titulo: "Envio barrado pela Meta",
        explicacao:
            "A Meta bloqueou esta entrega para preservar a saúde do ecossistema — costuma acontecer com muitas mensagens de marketing para o mesmo número. Tente mais tarde ou fale por outro canal.",
        origem: "regra da Meta para contas comerciais",
    },
    "131048": {
        grupo: "bloqueio",
        titulo: "Envio barrado por qualidade",
        explicacao:
            "O número da clínica está com a qualidade baixa no WhatsApp e a Meta limitou os envios. Reduza os disparos em massa por alguns dias.",
        origem: "limite por qualidade do número",
    },
    "131050": {
        grupo: "bloqueio",
        titulo: "Contato optou por não receber",
        explicacao:
            "Este contato pediu para não receber mensagens de marketing da clínica. Só é possível falar se ele escrever primeiro.",
        origem: "preferência do próprio contato",
    },
    "131026": {
        grupo: "bloqueio",
        titulo: "Número não recebe WhatsApp",
        explicacao:
            "O número não tem WhatsApp ativo ou não pode receber esta mensagem. Confira o telefone no cadastro ou use outro canal.",
        origem: "número do destinatário",
    },
    "131047": {
        grupo: "bloqueio",
        titulo: "Janela de 24 horas fechada",
        explicacao:
            "Passaram-se mais de 24 horas desde a última mensagem do contato, então só é possível falar por template aprovado.",
        origem: "janela de atendimento do WhatsApp",
    },
    "131051": {
        grupo: "bloqueio",
        titulo: "Tipo de mensagem não permitido",
        explicacao:
            "A Meta não aceita este tipo de mensagem para este contato agora. Tente enviar como texto ou por template aprovado.",
        origem: "regra de tipo de mensagem da Meta",
    },
    "131053": {
        grupo: "bloqueio",
        titulo: "Arquivo recusado pela Meta",
        explicacao:
            "A Meta não conseguiu processar o anexo (formato ou tamanho). Envie o arquivo em outro formato ou reduza o tamanho.",
        origem: "arquivo enviado",
    },
    "130472": {
        grupo: "bloqueio",
        titulo: "Contato fora do experimento",
        explicacao:
            "Este contato faz parte de um grupo de controle da Meta e não recebe mensagens de marketing. Fale por outro canal.",
        origem: "experimento de usuário da Meta",
    },
    "130497": {
        grupo: "bloqueio",
        titulo: "Mensagem de marketing barrada",
        explicacao:
            "A Meta está limitando mensagens de marketing para este contato no momento. Tente mais tarde ou fale por outro canal.",
        origem: "limite de marketing da Meta",
    },

    "131008": {
        grupo: "defeito",
        titulo: "Envio não concluído",
        explicacao:
            "A mensagem saiu incompleta e a Meta recusou. Já avisamos o suporte — tente reenviar em alguns minutos.",
        origem: "defeito do sistema",
    },
    "131009": {
        grupo: "defeito",
        titulo: "Envio não concluído",
        explicacao:
            "Algum dado da mensagem saiu fora do formato aceito pela Meta. Já avisamos o suporte — tente reenviar em alguns minutos.",
        origem: "defeito do sistema",
    },
    "131021": {
        grupo: "defeito",
        titulo: "Número de origem e destino iguais",
        explicacao:
            "A mensagem foi enviada do número da clínica para ele mesmo. Confira o telefone no cadastro do contato.",
        origem: "cadastro do contato",
    },
    "131045": {
        grupo: "defeito",
        titulo: "Envio não concluído",
        explicacao:
            "O certificado do número da clínica precisa ser renovado na Meta. Já avisamos o suporte.",
        origem: "configuração do número na Meta",
    },

    "131031": {
        grupo: "conta",
        titulo: "Conta da clínica bloqueada",
        explicacao:
            "A Meta bloqueou a conta de WhatsApp da clínica e nenhuma mensagem sai enquanto isso durar. Já avisamos o suporte.",
        origem: "bloqueio da conta na Meta",
    },
    "131042": {
        grupo: "conta",
        titulo: "Pagamento pendente na Meta",
        explicacao:
            "A Meta suspendeu os envios por pendência de pagamento na conta da clínica. Já avisamos o suporte.",
        origem: "cobrança da conta na Meta",
    },
};

export function ehFamiliaTemplate(codigo: string): boolean {
    return /^1320\d{2}$/.test(codigo);
}

const ERRO_TEMPLATE: ErroMeta = {
    grupo: "bloqueio",
    titulo: "Template recusado pela Meta",
    explicacao:
        "A Meta recusou o modelo de mensagem usado (pode estar sem aprovação, pausado ou com variáveis fora do formato). Escolha outro template ou fale pelo chat normal.",
    origem: "modelo de mensagem da Meta",
};

const ERRO_DESCONHECIDO: ErroMeta = {
    grupo: "desconhecido",
    titulo: "Envio não concluído",
    explicacao:
        "A Meta não aceitou esta mensagem e não informou um motivo que saibamos traduzir. Tente enviar de novo; se repetir, fale com o suporte.",
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

export const MAX_REENVIOS = 3;

/**
 * Enquanto o reenvio automatico esta em andamento o inbox mostra so um relogio
 * cinza — a caixa vermelha aparece somente quando a falha e FINAL.
 */
export function reenvioEmAndamento(
    codigo: string | number | null | undefined,
    retryCount: number | null | undefined,
): boolean {
    const c = codigo == null ? "" : String(codigo).trim();
    if (!CODIGOS_PASSAGEIROS.has(c)) return false;
    return (retryCount ?? 0) < MAX_REENVIOS;
}

/** Rodape do cartao: "Origem: <origem> · Código <numero>". */
export function rodapeDoErro(codigo: string | number | null | undefined): string {
    const c = codigo == null ? "" : String(codigo).trim();
    const { origem } = descreverErroMeta(c);
    return c ? `Origem: ${origem} · Código ${c}` : `Origem: ${origem}`;
}
