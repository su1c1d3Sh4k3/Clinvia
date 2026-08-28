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

/* ===================================================================
   6. Convite de colaborador
   =================================================================== */

const CARGOS: Record<string, string> = {
    admin: "Administrador",
    supervisor: "Supervisor",
    agent: "Atendente",
};

export function emailConviteColaborador(v: {
    full_name: string;
    company_name?: string;
    login_email: string;
    temp_password: string;
    role?: string;
    login_url?: string;
}): BuiltEmail {
    const nome = v.full_name?.trim().split(/\s+/)[0] || "tudo bem";
    const url = v.login_url || `${APP_URL}/auth`;
    const cargo = CARGOS[v.role ?? ""] ?? null;
    const subject = `Você foi adicionado à equipe ${v.company_name ? `da ${v.company_name}` : ""} na Clinbia`.replace(/\s+/g, " ").trim();
    const html = layout({
        preheader: "Seu usuário já está criado. Use os dados abaixo para entrar.",
        title: "Bem-vindo(a) à equipe",
        body:
            p(`Olá, ${esc(nome)}!`) +
            p(`Você foi adicionado(a) à equipe ${v.company_name ? `da ${strong(esc(v.company_name))} ` : ""}na Clinbia — a plataforma onde o time atende os pacientes pelo WhatsApp e Instagram, acompanha o funil de vendas e organiza a agenda.`) +
            dataTable("Dados de acesso", [
                ["Endereço", url.replace(/^https?:\/\//, "")],
                ["E-mail", v.login_email],
                ["Senha provisória", v.temp_password],
                ...(cargo ? [["Seu perfil", cargo] as [string, string]] : []),
            ]) +
            button("Entrar na plataforma", url) +
            callout(`No primeiro login a plataforma pede a <strong>troca da senha provisória</strong>. Escolha uma senha só sua e não compartilhe com ninguém.`, "amber") +
            p(`Dentro da plataforma, o menu <strong>Suporte</strong> traz o manual completo com passo a passo e tours guiados de cada tela.`),
    });
    const text = `Olá, ${nome}!

Você foi adicionado(a) à equipe${v.company_name ? ` da ${v.company_name}` : ""} na Clinbia.

DADOS DE ACESSO
Endereço: ${url}
E-mail: ${v.login_email}
Senha provisória: ${v.temp_password}${cargo ? `\nSeu perfil: ${cargo}` : ""}

No primeiro login a plataforma pede a troca da senha provisória. Escolha uma senha só sua e não compartilhe com ninguém.

Dentro da plataforma, o menu Suporte traz o manual completo com passo a passo e tours guiados de cada tela.

Equipe Clinbia`;
    return { subject, html, text };
}

/* ===================================================================
   7. Cadastro recusado
   =================================================================== */

export function emailCadastroRecusado(v: {
    full_name: string;
    company_name?: string;
    motivo?: string;
}): BuiltEmail {
    const nome = v.full_name?.trim().split(/\s+/)[0] || "tudo bem";
    const subject = "Sobre o seu cadastro na Clinbia";
    const html = layout({
        preheader: "Não foi possível seguir com o seu cadastro neste momento.",
        title: "Sobre o seu cadastro",
        body:
            p(`Olá, ${esc(nome)}!`) +
            p(`Agradecemos o interesse na Clinbia. Após a análise, não foi possível seguir com o cadastro ${v.company_name ? `da ${strong(esc(v.company_name))} ` : ""}neste momento.`) +
            (v.motivo ? callout(esc(v.motivo), "amber") : "") +
            p(`Isso não é definitivo: se algum dado estava incompleto ou se a sua operação mudou desde o cadastro, é só falar com o nosso time que revisamos o pedido com prazer.`) +
            p(`Ficamos à disposição e desejamos muito sucesso na sua clínica.`),
    });
    const text = `Olá, ${nome}!

Agradecemos o interesse na Clinbia. Após a análise, não foi possível seguir com o cadastro${v.company_name ? ` da ${v.company_name}` : ""} neste momento.
${v.motivo ? `\n${v.motivo}\n` : ""}
Isso não é definitivo: se algum dado estava incompleto ou se a sua operação mudou desde o cadastro, é só falar com o nosso time que revisamos o pedido com prazer.

Ficamos à disposição e desejamos muito sucesso na sua clínica.

Equipe Clinbia`;
    return { subject, html, text };
}

/* ===================================================================
   8. Conexão do WhatsApp caiu
   =================================================================== */

export function emailConexaoCaiu(v: {
    full_name: string;
    company_name?: string;
    instance_name: string;
    phone?: string;
    connections_url?: string;
}): BuiltEmail {
    const nome = v.full_name?.trim().split(/\s+/)[0] || "tudo bem";
    const url = v.connections_url || `${APP_URL}/whatsapp-connection`;
    const subject = `Atenção: a conexão "${v.instance_name}" caiu`;
    const html = layout({
        preheader: "Sua conexão do WhatsApp está fora do ar e as mensagens não estão sendo enviadas nem recebidas.",
        title: "Sua conexão do WhatsApp caiu",
        body:
            p(`Olá, ${esc(nome)}!`) +
            p(`A conexão ${strong(esc(v.instance_name))}${v.phone ? ` (${esc(v.phone)})` : ""} ${v.company_name ? `da ${esc(v.company_name)} ` : ""}foi desconectada do WhatsApp.`) +
            callout(
                `Enquanto ela estiver fora do ar, <strong>as mensagens dos seus pacientes não chegam ao inbox</strong> e nada é enviado por esse número — inclusive campanhas, lembretes de consulta e as respostas da inteligência artificial.`,
                "red",
            ) +
            button("Reconectar agora", url) +
            p(`Para reconectar: entre na plataforma, abra ${strong("Conexões")}, clique em ${strong("Conectar")} no cartão dessa conexão e leia o QR Code com o WhatsApp do aparelho.`) +
            p(`Quedas costumam acontecer quando o celular fica sem internet, sem bateria, ou quando a sessão é encerrada em <em>Aparelhos conectados</em> no WhatsApp.`, `font-size:13px;color:${C.muted}`),
    });
    const text = `Olá, ${nome}!

A conexão "${v.instance_name}"${v.phone ? ` (${v.phone})` : ""} foi desconectada do WhatsApp.

Enquanto ela estiver fora do ar, as mensagens dos seus pacientes não chegam ao inbox e nada é enviado por esse número — inclusive campanhas, lembretes de consulta e as respostas da inteligência artificial.

Reconecte aqui: ${url}

Para reconectar: entre na plataforma, abra Conexões, clique em Conectar no cartão dessa conexão e leia o QR Code com o WhatsApp do aparelho.

Quedas costumam acontecer quando o celular fica sem internet, sem bateria, ou quando a sessão é encerrada em "Aparelhos conectados" no WhatsApp.

Equipe Clinbia`;
    return { subject, html, text };
}

/* ===================================================================
   9. Conta reativada
   =================================================================== */

export function emailContaReativada(v: {
    full_name: string;
    company_name?: string;
    login_email?: string;
    login_url?: string;
}): BuiltEmail {
    const nome = v.full_name?.trim().split(/\s+/)[0] || "tudo bem";
    const url = v.login_url || `${APP_URL}/auth`;
    const subject = "Sua conta Clinbia foi reativada";
    const html = layout({
        preheader: "O acesso à plataforma voltou e seus dados estão no lugar.",
        title: "Sua conta foi reativada",
        body:
            p(`Olá, ${esc(nome)}!`) +
            p(`Boas notícias: a conta ${v.company_name ? `da ${strong(esc(v.company_name))} ` : ""}na Clinbia foi <strong style="color:${C.ink}">reativada</strong> e o acesso já está liberado para você e para toda a equipe.`) +
            callout(`Suas conversas, contatos, agendamentos, campanhas e relatórios foram preservados — está tudo exatamente como você deixou.`, "green") +
            button("Voltar para a plataforma", url) +
            (v.login_email ? p(`Seu login continua sendo ${strong(esc(v.login_email))} com a mesma senha de antes. Se não lembrar, use a opção "Esqueci minha senha" na tela de entrada.`) : p(`Seu login e a sua senha continuam os mesmos. Se não lembrar, use a opção "Esqueci minha senha" na tela de entrada.`)) +
            p(`Vale conferir a página ${strong("Conexões")}: se o WhatsApp tiver desconectado durante o período parado, basta ler o QR Code de novo.`) +
            p(`Que bom ter você de volta!`),
    });
    const text = `Olá, ${nome}!

Boas notícias: a conta${v.company_name ? ` da ${v.company_name}` : ""} na Clinbia foi reativada e o acesso já está liberado para você e para toda a equipe.

Suas conversas, contatos, agendamentos, campanhas e relatórios foram preservados — está tudo exatamente como você deixou.

Acesse: ${url}
${v.login_email ? `\nSeu login continua sendo ${v.login_email} com a mesma senha de antes.` : "\nSeu login e a sua senha continuam os mesmos."} Se não lembrar, use a opção "Esqueci minha senha" na tela de entrada.

Vale conferir a página Conexões: se o WhatsApp tiver desconectado durante o período parado, basta ler o QR Code de novo.

Que bom ter você de volta!

Equipe Clinbia`;
    return { subject, html, text };
}

/* ===================================================================
   10. Aviso de exclusão definitiva dos dados
   =================================================================== */

export function emailAvisoExclusao(v: {
    full_name: string;
    company_name?: string;
    data_exclusao: string;
    dias_restantes: number;
}): BuiltEmail {
    const nome = v.full_name?.trim().split(/\s+/)[0] || "tudo bem";
    const dias = v.dias_restantes;
    const subject = `Seus dados na Clinbia serão excluídos em ${dias} ${dias === 1 ? "dia" : "dias"}`;
    const html = layout({
        preheader: `Faltam ${dias} ${dias === 1 ? "dia" : "dias"} para a exclusão definitiva dos dados da sua conta encerrada.`,
        title: "Seus dados serão excluídos em breve",
        body:
            p(`Olá, ${esc(nome)}!`) +
            p(`A conta ${v.company_name ? `da ${strong(esc(v.company_name))} ` : ""}na Clinbia está encerrada e o prazo de guarda dos dados está chegando ao fim.`) +
            callout(
                `Em <strong>${esc(String(dias))} ${dias === 1 ? "dia" : "dias"}</strong>, no dia <strong>${esc(v.data_exclusao)}</strong>, todas as conversas, contatos, agendamentos, vendas e relatórios serão <strong>excluídos em definitivo</strong>. Depois dessa data não há como recuperar nenhuma informação.`,
                "red",
            ) +
            p(`Se quiser ${strong("reativar a conta")} ou ${strong("receber uma cópia dos seus dados")} antes da exclusão, fale com o seu consultor Clinbia ainda hoje — depois do prazo, infelizmente, não é possível.`) +
            p(`Se você já não precisa mais dessas informações, não é preciso fazer nada: a exclusão acontece automaticamente na data acima.`, `font-size:13px;color:${C.muted}`),
    });
    const text = `Olá, ${nome}!

A conta${v.company_name ? ` da ${v.company_name}` : ""} na Clinbia está encerrada e o prazo de guarda dos dados está chegando ao fim.

Em ${dias} ${dias === 1 ? "dia" : "dias"}, no dia ${v.data_exclusao}, todas as conversas, contatos, agendamentos, vendas e relatórios serão excluídos em definitivo. Depois dessa data não há como recuperar nenhuma informação.

Se quiser reativar a conta ou receber uma cópia dos seus dados antes da exclusão, fale com o seu consultor Clinbia ainda hoje — depois do prazo, infelizmente, não é possível.

Se você já não precisa mais dessas informações, não é preciso fazer nada: a exclusão acontece automaticamente na data acima.

Equipe Clinbia`;
    return { subject, html, text };
}

/* ===================================================================
   11. Restrição da Meta no número oficial
   =================================================================== */

export function emailRestricaoMeta(v: {
    full_name: string;
    company_name?: string;
    instance_name: string;
    phone?: string;
    connections_url?: string;
}): BuiltEmail {
    const nome = v.full_name?.trim().split(/\s+/)[0] || "tudo bem";
    const url = v.connections_url || `${APP_URL}/whatsapp-connection`;
    const subject = `A Meta restringiu o envio pelo número "${v.instance_name}"`;
    const html = layout({
        preheader: "O nome de exibição do seu WhatsApp oficial foi recusado e o envio está bloqueado.",
        title: "Envio bloqueado pela Meta",
        body:
            p(`Olá, ${esc(nome)}!`) +
            p(`A Meta recusou o ${strong("nome de exibição")} do número ${strong(esc(v.instance_name))}${v.phone ? ` (${esc(v.phone)})` : ""}${v.company_name ? ` da ${esc(v.company_name)}` : ""}.`) +
            callout(
                `Enquanto a restrição estiver ativa, <strong>nenhuma mensagem sai por esse número</strong>: campanhas, lembretes automáticos e respostas da inteligência artificial ficam bloqueados. As mensagens recebidas continuam chegando normalmente no inbox.`,
                "red",
            ) +
            p(`Para resolver, acesse o ${strong("Gerenciador do WhatsApp")} na Meta, abra as configurações do número e ${strong("envie um novo nome de exibição")} que represente de fato o seu negócio — normalmente o nome fantasia da clínica, sem promoções nem palavras genéricas. A análise costuma levar algumas horas.`) +
            button("Ver a conexão na plataforma", url) +
            p(`Assim que a Meta aprovar o novo nome, o envio é liberado sozinho e o aviso some do cartão da conexão.`, `font-size:13px;color:${C.muted}`),
    });
    const text = `Olá, ${nome}!

A Meta recusou o nome de exibição do número "${v.instance_name}"${v.phone ? ` (${v.phone})` : ""}${v.company_name ? ` da ${v.company_name}` : ""}.

Enquanto a restrição estiver ativa, nenhuma mensagem sai por esse número: campanhas, lembretes automáticos e respostas da inteligência artificial ficam bloqueados. As mensagens recebidas continuam chegando normalmente no inbox.

Para resolver, acesse o Gerenciador do WhatsApp na Meta, abra as configurações do número e envie um novo nome de exibição que represente de fato o seu negócio — normalmente o nome fantasia da clínica, sem promoções nem palavras genéricas. A análise costuma levar algumas horas.

Ver a conexão: ${url}

Assim que a Meta aprovar o novo nome, o envio é liberado sozinho e o aviso some do cartão da conexão.

Equipe Clinbia`;
    return { subject, html, text };
}

/* ===================================================================
   12. Senha alterada (aviso de segurança)
   =================================================================== */

export function emailSenhaAlterada(v: {
    full_name?: string;
    login_email?: string;
    data_alteracao: string;
}): BuiltEmail {
    const nome = v.full_name?.trim().split(/\s+/)[0];
    const subject = "Sua senha da Clinbia foi alterada";
    const html = layout({
        preheader: "Confirmação de segurança: a senha da sua conta acabou de ser alterada.",
        title: "Sua senha foi alterada",
        body:
            p(nome ? `Olá, ${esc(nome)}!` : "Olá!") +
            p(`A senha da conta ${v.login_email ? `${strong(esc(v.login_email))} ` : ""}foi alterada em ${strong(esc(v.data_alteracao))}.`) +
            p(`Se foi você quem alterou, está tudo certo — pode ignorar este aviso.`) +
            callout(
                `<strong>Não foi você?</strong> Entre em contato com o seu consultor Clinbia imediatamente e peça a redefinição da senha. Enquanto isso, avise o administrador da conta para revisar os acessos da equipe.`,
                "amber",
            ) +
            p(`Este aviso é enviado sempre que a senha muda, para proteger o acesso aos dados dos seus pacientes.`, `font-size:13px;color:${C.muted}`),
    });
    const text = `${nome ? `Olá, ${nome}!` : "Olá!"}

A senha da conta${v.login_email ? ` ${v.login_email}` : ""} foi alterada em ${v.data_alteracao}.

Se foi você quem alterou, está tudo certo — pode ignorar este aviso.

Não foi você? Entre em contato com o seu consultor Clinbia imediatamente e peça a redefinição da senha. Enquanto isso, avise o administrador da conta para revisar os acessos da equipe.

Este aviso é enviado sempre que a senha muda, para proteger o acesso aos dados dos seus pacientes.

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

/** Envia sem nunca derrubar o fluxo que chamou (aprovar cliente, cron, webhook).
 *  Falha de e-mail vira log — o resto da operação continua valendo. */
export async function sendEmailSafe(
    tag: string,
    to: string | string[] | null | undefined,
    mail: BuiltEmail,
    replyTo?: string,
): Promise<boolean> {
    if (!to || (Array.isArray(to) && to.length === 0)) {
        console.warn(`[email:${tag}] sem destinatário, envio ignorado`);
        return false;
    }
    try {
        const { id } = await sendEmail({ to, ...mail, replyTo });
        console.log(`[email:${tag}] enviado para ${Array.isArray(to) ? to.join(",") : to} (${id})`);
        return true;
    } catch (e) {
        console.error(`[email:${tag}] falhou:`, (e as Error).message);
        return false;
    }
}
