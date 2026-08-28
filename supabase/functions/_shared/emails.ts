/** Fonte única dos e-mails transacionais da Clinbia.
 *
 *  Layout em tabelas (o único HTML que Gmail/Outlook/Apple Mail renderizam igual),
 *  cabeçalho escuro porque a logo completa é branca (mesma da tela de login),
 *  e uma versão em texto puro por template — sem ela o Gmail marca como spam.
 *
 *  Todo texto voltado ao cliente é em português (pt-BR). */

const APP_URL = Deno.env.get("APP_PUBLIC_URL") ?? "https://app.clinbia.ai";
const LOGO_URL = `${APP_URL}/clinvia-logo-full.png`;

const C = {
    ink: "#0F172A",
    body: "#334155",
    muted: "#64748B",
    line: "#E2E8F0",
    page: "#EEF3F9",
    primary: "#2564FF",
    cyan: "#00BFFF",
    softBlue: "#F1F6FF",
    green: "#0F9D58",
    softGreen: "#EEF9F2",
    amber: "#B45309",
    softAmber: "#FEF6E7",
    red: "#B91C1C",
    softRed: "#FEF2F2",
};

/* ------------------------------------------------------------------ helpers */

export function esc(v: unknown): string {
    return String(v ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function brl(n: number): string {
    return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function int(n: number): string {
    return (Number(n) || 0).toLocaleString("pt-BR");
}

const p = (html: string, extra = "") =>
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${C.body};${extra}">${html}</p>`;

const strong = (t: string) => `<strong style="color:${C.ink};font-weight:600">${t}</strong>`;

/** Botão de ação. Usa tabela porque <a> com padding quebra no Outlook. */
const button = (label: string, href: string) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px">
  <tr><td align="center" bgcolor="${C.primary}" style="border-radius:8px">
    <a href="${esc(href)}" target="_blank"
       style="display:inline-block;padding:14px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px">${esc(label)}</a>
  </td></tr>
</table>`;

/** Caixa de destaque colorida à esquerda. */
const callout = (html: string, tone: "blue" | "green" | "amber" | "red" = "blue") => {
    const map = {
        blue: [C.softBlue, C.primary], green: [C.softGreen, C.green],
        amber: [C.softAmber, C.amber], red: [C.softRed, C.red],
    } as const;
    const [bg, bar] = map[tone];
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">
  <tr><td style="background:${bg};border-left:4px solid ${bar};border-radius:6px;padding:16px 18px;font-size:14px;line-height:1.6;color:${C.body}">${html}</td></tr>
</table>`;
};

/** Tabela de dados rótulo → valor. */
const dataTable = (title: string, rows: Array<[string, string]>, total?: [string, string]) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border:1px solid ${C.line};border-radius:10px;border-collapse:separate;overflow:hidden">
  <tr><td colspan="2" style="background:#F8FAFC;padding:12px 18px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${C.muted};border-bottom:1px solid ${C.line}">${esc(title)}</td></tr>
  ${rows.map(([k, v]) => `<tr>
    <td style="padding:12px 18px;font-size:14px;color:${C.body};border-bottom:1px solid ${C.line}">${esc(k)}</td>
    <td align="right" style="padding:12px 18px;font-size:14px;font-weight:600;color:${C.ink};border-bottom:1px solid ${C.line};white-space:nowrap">${esc(v)}</td>
  </tr>`).join("")}
  ${total ? `<tr>
    <td style="padding:14px 18px;font-size:14px;font-weight:700;color:${C.ink};background:#F8FAFC">${esc(total[0])}</td>
    <td align="right" style="padding:14px 18px;font-size:16px;font-weight:700;color:${C.primary};background:#F8FAFC;white-space:nowrap">${esc(total[1])}</td>
  </tr>` : ""}
</table>`;

/* ------------------------------------------------------------------- layout */

function layout(opts: { preheader: string; title: string; body: string }): string {
    return `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};padding:32px 12px">
 <tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
         style="width:600px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${C.line};font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif">

   <tr><td align="center" style="background:${C.ink};padding:28px 24px 24px">
     <img src="${LOGO_URL}" width="150" alt="Clinbia" style="display:block;width:150px;height:auto;border:0">
   </td></tr>
   <tr><td style="height:4px;line-height:4px;font-size:0;background:${C.cyan}">&nbsp;</td></tr>

   <tr><td style="padding:34px 36px 8px">
     <h1 style="margin:0 0 18px;font-size:22px;line-height:1.35;font-weight:700;color:${C.ink}">${esc(opts.title)}</h1>
     ${opts.body}
   </td></tr>

   <tr><td style="padding:0 36px 30px">
     <p style="margin:0;font-size:14px;line-height:1.6;color:${C.body}">Atenciosamente,<br><span style="font-weight:600;color:${C.ink}">Equipe Clinbia</span></p>
   </td></tr>

   <tr><td style="background:#F8FAFC;border-top:1px solid ${C.line};padding:22px 36px">
     <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:${C.muted}">
       <span style="color:${C.ink};font-weight:600">Clinbia</span> — Atendimento e Gestão de Leads com Inteligência Artificial
     </p>
     <p style="margin:0;font-size:11px;line-height:1.6;color:${C.muted}">
       Este é um e-mail automático enviado por nao-responda@clinbia.ai. Em caso de dúvidas, fale com o seu consultor Clinbia.<br>
       © ${new Date().getFullYear()} Clinbia. Todos os direitos reservados.
     </p>
   </td></tr>

  </table>
 </td></tr>
</table>
</body></html>`;
}

export interface BuiltEmail {
    subject: string;
    html: string;
    text: string;
}

/* ===================================================================
   1. Confirmação de e-mail do cadastro
   =================================================================== */

export function emailConfirmacaoCadastro(v: {
    full_name: string;
    company_name?: string;
    confirm_url: string;
}): BuiltEmail {
    const nome = v.full_name?.trim().split(/\s+/)[0] || "tudo bem";
    const subject = "Confirme seu e-mail para concluir o cadastro na Clinbia";
    const html = layout({
        preheader: "Falta só um passo: confirme seu e-mail para validarmos seu cadastro.",
        title: "Confirme seu e-mail",
        body:
            p(`Olá, ${esc(nome)}!`) +
            p(`Recebemos o cadastro ${v.company_name ? `da ${strong(esc(v.company_name))} ` : ""}na Clinbia. Falta apenas um passo: confirmar que este endereço de e-mail é seu.`) +
            button("Confirmar meu e-mail", v.confirm_url) +
            callout(
                `Depois de confirmar, seu cadastro é validado e o nosso <strong>time de implementação entra em contato</strong> para liberar o seu acesso à plataforma.`,
                "blue",
            ) +
            p(`Se o botão não funcionar, copie e cole este endereço no seu navegador:`, `margin-bottom:8px`) +
            p(`<a href="${esc(v.confirm_url)}" style="color:${C.primary};word-break:break-all">${esc(v.confirm_url)}</a>`, `font-size:13px`) +
            p(`O link é válido por <strong>7 dias</strong>. Se você não fez este cadastro, é só ignorar esta mensagem.`, `font-size:13px;color:${C.muted}`),
    });
    const text = `Olá, ${nome}!

Recebemos o cadastro${v.company_name ? ` da ${v.company_name}` : ""} na Clinbia. Falta apenas um passo: confirmar que este endereço de e-mail é seu.

Confirme aqui: ${v.confirm_url}

Depois de confirmar, seu cadastro é validado e o nosso time de implementação entra em contato para liberar o seu acesso à plataforma.

O link é válido por 7 dias. Se você não fez este cadastro, ignore esta mensagem.

Equipe Clinbia`;
    return { subject, html, text };
}

/* ===================================================================
   2. Acesso liberado
   =================================================================== */

export function emailAcessoLiberado(v: {
    full_name: string;
    company_name?: string;
    login_email: string;
    temp_password?: string;
    login_url?: string;
}): BuiltEmail {
    const nome = v.full_name?.trim().split(/\s+/)[0] || "tudo bem";
    const url = v.login_url || `${APP_URL}/auth`;
    const subject = "Seu acesso à Clinbia está liberado";
    const html = layout({
        preheader: "Sua conta foi liberada. Use os dados abaixo para entrar na plataforma.",
        title: "Seu acesso está liberado",
        body:
            p(`Olá, ${esc(nome)}!`) +
            p(`A conta ${v.company_name ? `da ${strong(esc(v.company_name))} ` : ""}foi liberada e a plataforma Clinbia já está disponível para uso.`) +
            dataTable("Dados de acesso", [
                ["Endereço", url.replace(/^https?:\/\//, "")],
                ["E-mail", v.login_email],
                ...(v.temp_password ? [["Senha provisória", v.temp_password] as [string, string]] : []),
            ]) +
            button("Acessar a plataforma", url) +
            (v.temp_password
                ? callout(`Por segurança, no primeiro login a plataforma vai pedir que você <strong>troque a senha provisória</strong> por uma senha só sua.`, "amber")
                : "") +
            p(`Já é possível conectar o WhatsApp, cadastrar a equipe, configurar os serviços e ligar a inteligência artificial. Nosso time acompanha você em cada etapa da implantação.`) +
            p(`Boas vendas!`),
    });
    const text = `Olá, ${nome}!

A conta${v.company_name ? ` da ${v.company_name}` : ""} foi liberada e a plataforma Clinbia já está disponível para uso.

DADOS DE ACESSO
Endereço: ${url}
E-mail: ${v.login_email}${v.temp_password ? `\nSenha provisória: ${v.temp_password}\n\nPor segurança, no primeiro login a plataforma vai pedir que você troque a senha provisória por uma senha só sua.` : ""}

Já é possível conectar o WhatsApp, cadastrar a equipe, configurar os serviços e ligar a inteligência artificial. Nosso time acompanha você em cada etapa da implantação.

Equipe Clinbia`;
    return { subject, html, text };
}

/* ===================================================================
   3. Recuperação de senha
   =================================================================== */

export function emailRecuperacaoSenha(v: {
    full_name?: string;
    reset_url: string;
    validade?: string;
}): BuiltEmail {
    const nome = v.full_name?.trim().split(/\s+/)[0];
    const validade = v.validade || "1 hora";
    const subject = "Redefinição de senha da sua conta Clinbia";
    const html = layout({
        preheader: "Recebemos um pedido para redefinir a senha da sua conta Clinbia.",
        title: "Redefinição de senha",
        body:
            p(nome ? `Olá, ${esc(nome)}!` : "Olá!") +
            p(`Recebemos um pedido para redefinir a senha da sua conta Clinbia. Clique no botão abaixo para criar uma nova senha.`) +
            button("Criar nova senha", v.reset_url) +
            callout(`Este link é pessoal, de uso único, e expira em <strong>${esc(validade)}</strong>.`, "amber") +
            p(`Se o botão não funcionar, copie e cole este endereço no seu navegador:`, `margin-bottom:8px`) +
            p(`<a href="${esc(v.reset_url)}" style="color:${C.primary};word-break:break-all">${esc(v.reset_url)}</a>`, `font-size:13px`) +
            p(`<strong style="color:${C.ink}">Não foi você?</strong> Ignore esta mensagem: sua senha atual continua valendo e nada muda na sua conta.`, `font-size:13px;color:${C.muted}`),
    });
    const text = `${nome ? `Olá, ${nome}!` : "Olá!"}

Recebemos um pedido para redefinir a senha da sua conta Clinbia.

Crie uma nova senha aqui: ${v.reset_url}

Este link é pessoal, de uso único, e expira em ${validade}.

Não foi você? Ignore esta mensagem: sua senha atual continua valendo e nada muda na sua conta.

Equipe Clinbia`;
    return { subject, html, text };
}

/* ===================================================================
   4. Relatório mensal de consumo
   =================================================================== */

export interface ConsumoVars {
    full_name: string;
    company_name?: string;
    /** ex.: "agosto de 2026" */
    periodo: string;
    tokens_entrada: number;
    tokens_saida: number;
    tokens_total: number;
    custo_ia_brl: number;
    disparos_total: number;
    disparos_campanhas: number;
    disparos_automaticos: number;
    templates_meta: number;
    custo_meta_brl: number;
    custo_total_brl: number;
    conversas_atendidas?: number;
    dashboard_url?: string;
}

export function emailConsumoMensal(v: ConsumoVars): BuiltEmail {
    const nome = v.full_name?.trim().split(/\s+/)[0] || "tudo bem";
    const url = v.dashboard_url || `${APP_URL}/dashboard`;
    const subject = `Relatório de consumo da Clinbia — ${v.periodo}`;
    const html = layout({
        preheader: `Resumo de ${v.periodo}: ${int(v.tokens_total)} tokens de IA e ${int(v.disparos_total)} disparos.`,
        title: `Seu consumo em ${v.periodo}`,
        body:
            p(`Olá, ${esc(nome)}!`) +
            p(`Segue o resumo do que ${v.company_name ? `a ${strong(esc(v.company_name))} ` : "sua conta "}utilizou na Clinbia em ${strong(esc(v.periodo))}.`) +
            dataTable("Inteligência artificial", [
                ["Tokens de entrada", int(v.tokens_entrada)],
                ["Tokens de saída", int(v.tokens_saida)],
                ["Total de tokens", int(v.tokens_total)],
                ...(v.conversas_atendidas ? [["Conversas atendidas pela IA", int(v.conversas_atendidas)] as [string, string]] : []),
            ], ["Custo com IA", brl(v.custo_ia_brl)]) +
            dataTable("Disparos de mensagens", [
                ["Campanhas", int(v.disparos_campanhas)],
                ["Mensagens automáticas", int(v.disparos_automaticos)],
                ["Total de disparos", int(v.disparos_total)],
                ["Templates oficiais Meta", int(v.templates_meta)],
            ], ["Custo com disparos", brl(v.custo_meta_brl)]) +
            dataTable("Total do período", [
                ["Inteligência artificial", brl(v.custo_ia_brl)],
                ["Disparos de mensagens", brl(v.custo_meta_brl)],
            ], ["Custo total estimado", brl(v.custo_total_brl)]) +
            button("Ver relatório completo", url) +
            callout(`Os valores de disparo são uma <strong>estimativa</strong> baseada na tabela da Meta e na cotação do dólar do período — a cobrança oficial é a da sua conta na Meta.`, "blue") +
            p(`Este relatório é enviado todo dia 1º com o fechamento do mês anterior.`, `font-size:13px;color:${C.muted}`),
    });
    const text = `Olá, ${nome}!

Segue o resumo do que ${v.company_name ? `a ${v.company_name}` : "sua conta"} utilizou na Clinbia em ${v.periodo}.

INTELIGÊNCIA ARTIFICIAL
Tokens de entrada: ${int(v.tokens_entrada)}
Tokens de saída: ${int(v.tokens_saida)}
Total de tokens: ${int(v.tokens_total)}
Custo com IA: ${brl(v.custo_ia_brl)}

DISPAROS DE MENSAGENS
Campanhas: ${int(v.disparos_campanhas)}
Mensagens automáticas: ${int(v.disparos_automaticos)}
Total de disparos: ${int(v.disparos_total)}
Templates oficiais Meta: ${int(v.templates_meta)}
Custo com disparos: ${brl(v.custo_meta_brl)}

CUSTO TOTAL ESTIMADO: ${brl(v.custo_total_brl)}

Relatório completo: ${url}

Os valores de disparo são uma estimativa baseada na tabela da Meta e na cotação do dólar do período — a cobrança oficial é a da sua conta na Meta.

Equipe Clinbia`;
    return { subject, html, text };
}

/* ===================================================================
   5. Encerramento de conta
   =================================================================== */

export function emailContaEncerrada(v: {
    full_name: string;
    company_name?: string;
    data_encerramento: string;
    dias_retencao?: number;
}): BuiltEmail {
    const nome = v.full_name?.trim().split(/\s+/)[0] || "tudo bem";
    const dias = v.dias_retencao ?? 30;
    const subject = "Sua conta Clinbia foi encerrada";
    const html = layout({
        preheader: "O acesso à plataforma foi desativado. Veja o que acontece com os seus dados.",
        title: "Sua conta foi encerrada",
        body:
            p(`Olá, ${esc(nome)}!`) +
            p(`Informamos que a conta ${v.company_name ? `da ${strong(esc(v.company_name))} ` : ""}na Clinbia foi <strong style="color:${C.ink}">encerrada em ${esc(v.data_encerramento)}</strong>.`) +
            callout(
                `A partir de agora <strong>o acesso à plataforma está desativado</strong> para você e para toda a sua equipe. Novos logins não serão aceitos e as automações, campanhas e o atendimento por inteligência artificial foram interrompidos.`,
                "red",
            ) +
            p(`Seus dados — conversas, contatos, agendamentos e relatórios — ficam guardados por ${strong(`${dias} dias`)} a partir do encerramento. Nesse prazo, a conta ainda pode ser reativada com tudo no lugar. Depois disso, as informações são excluídas em definitivo e não há como recuperá-las.`) +
            p(`Se o encerramento foi um engano, ou se você quer reativar a conta ou receber uma cópia dos seus dados, fale com o seu consultor Clinbia o quanto antes.`) +
            p(`Agradecemos por ter caminhado com a gente até aqui.`),
    });
    const text = `Olá, ${nome}!

Informamos que a conta${v.company_name ? ` da ${v.company_name}` : ""} na Clinbia foi encerrada em ${v.data_encerramento}.

A partir de agora o acesso à plataforma está desativado para você e para toda a sua equipe. Novos logins não serão aceitos e as automações, campanhas e o atendimento por inteligência artificial foram interrompidos.

Seus dados — conversas, contatos, agendamentos e relatórios — ficam guardados por ${dias} dias a partir do encerramento. Nesse prazo, a conta ainda pode ser reativada com tudo no lugar. Depois disso, as informações são excluídas em definitivo e não há como recuperá-las.

Se o encerramento foi um engano, ou se você quer reativar a conta ou receber uma cópia dos seus dados, fale com o seu consultor Clinbia o quanto antes.

Agradecemos por ter caminhado com a gente até aqui.

Equipe Clinbia`;
    return { subject, html, text };
}

/* ------------------------------------------------------------------- envio */

/** Envia pelo HTTP da Resend. Erro da API vira exceção com o corpo real. */
export async function sendEmail(opts: {
    to: string | string[];
    subject: string;
    html: string;
    text: string;
    replyTo?: string;
}): Promise<{ id: string }> {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) throw new Error("RESEND_API_KEY não configurada nas secrets do projeto");

    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            from: Deno.env.get("EMAIL_FROM") ?? "Clinbia <nao-responda@clinbia.ai>",
            to: Array.isArray(opts.to) ? opts.to : [opts.to],
            subject: opts.subject,
            html: opts.html,
            text: opts.text,
            ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        }),
    });

    const raw = await res.text();
    if (!res.ok) throw new Error(`Resend ${res.status}: ${raw}`);
    return JSON.parse(raw);
}
