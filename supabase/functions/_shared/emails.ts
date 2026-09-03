/** Fonte única dos e-mails transacionais da Clinbia.
 *
 *  Layout em tabelas aninhadas com CSS inline — o único HTML que Gmail, Outlook
 *  (motor do Word: sem flexbox, sem grid, sem <button>) e Apple Mail renderizam
 *  igual. Largura fixa de 600px com um único breakpoint em 620px.
 *
 *  Estrutura, de cima para baixo: barra azul de 8px → respiro → cabeçalho azul
 *  com a logo branca → cartão branco com o conteúdo → rodapé cinza FORA do
 *  cartão com a logo azul. Canto arredondado some no Outlook: é esperado.
 *
 *  Toda mensagem também sai em texto puro — sem isso o Gmail marca como spam.
 *  Todo texto voltado ao cliente é em português (pt-BR). */

const APP_URL = Deno.env.get("APP_PUBLIC_URL") ?? "https://app.clinbia.ai";
/** Logo padrão (escrita branca) — vai sobre o azul do cabeçalho. */
const LOGO_BRANCA_URL = `${APP_URL}/clinvia-logo-full.png`;
/** Logo alternativa (escrita azul) — vai sobre o cinza do rodapé. */
const LOGO_AZUL_URL = `${APP_URL}/logo-light.png`;

const C = {
    /** barra superior e fundo do cabeçalho */
    brand: "#1668C1",
    /** títulos, links e chamada para ação */
    accent: "#2589CB",
    /** barra da caixa de alerta */
    alert: "#E23127",
    /** fundo da página e do rodapé */
    page: "#EDF1F5",
    /** fundo da caixa de alerta */
    box: "#EDEDED",
    /** texto escuro / negrito */
    dark: "#3C4650",
    /** texto corrido */
    body: "#5B6670",
    /** texto secundário do rodapé */
    soft: "#7A848E",
    line: "#DCE3EA",
    green: "#1E8E57",
    amber: "#C9821A",
};

/** Sem webfont: o que não existir no cliente cai para Helvetica/Arial. */
const FF = "'Segoe UI',Helvetica,Arial,sans-serif";

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

/** Parágrafo padrão do corpo (14/23). */
const p = (html: string, extra = "") =>
    `<p style="margin:0 0 16px 0;font-family:${FF};font-size:14px;line-height:23px;font-weight:400;color:${C.body};${extra}">${html}</p>`;

/** Saudação — mesma fonte do corpo, porém em negrito escuro (14/22). */
const greeting = (t: string) =>
    `<p style="margin:0 0 16px 0;font-family:${FF};font-size:14px;line-height:22px;font-weight:700;color:${C.dark}">${t}</p>`;

const strong = (t: string) => `<strong style="color:${C.dark};font-weight:700">${t}</strong>`;

const linkTo = (href: string, label?: string) =>
    `<a href="${esc(href)}" target="_blank" style="color:${C.accent};text-decoration:underline;word-break:break-all">${esc(label ?? href)}</a>`;

/** Chamada para ação. É um LINK de texto, não um botão: nada de <button> ou
 *  <a> com padding, que o Outlook desmonta. Se um dia virar botão, ele tem de
 *  ser uma tabela com background-color na célula. */
const cta = (label: string, href: string) => `
<p style="margin:6px 0 24px 0;font-family:${FF};font-size:18px;line-height:26px;font-weight:700">
  <a href="${esc(href)}" target="_blank" style="color:${C.accent};text-decoration:none;font-weight:700">${esc(label)}</a>
</p>`;

/** Caixa de destaque. A barra colorida é um <td> de 5px com background-color —
 *  border-left não é confiável no Outlook. Sem conteúdo, NÃO renderize a caixa:
 *  ela vira um bloco cinza fantasma. */
const callout = (html: string, tone: "blue" | "green" | "amber" | "red" = "blue", title?: string) => {
    const bar = { blue: C.accent, green: C.green, amber: C.amber, red: C.alert }[tone];
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;border-collapse:collapse">
  <tr>
    <td width="5" style="width:5px;background-color:${bar};font-size:0;line-height:0">&nbsp;</td>
    <td style="background-color:${C.box};padding:16px 18px">
      ${title ? `<p style="margin:0 0 6px 0;font-family:${FF};font-size:14px;line-height:22px;font-weight:700;color:${C.dark}">${esc(title)}</p>` : ""}
      <p style="margin:0;font-family:${FF};font-size:14px;line-height:23px;color:${C.body}">${html}</p>
    </td>
  </tr>
</table>`;
};

/** Tabela de dados rótulo → valor. */
const dataTable = (title: string, rows: Array<[string, string]>, total?: [string, string]) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;border:1px solid ${C.line};border-collapse:collapse">
  <tr><td colspan="2" style="background-color:${C.box};padding:12px 18px;font-family:${FF};font-size:12px;line-height:18px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${C.dark}">${esc(title)}</td></tr>
  ${rows.map(([k, v]) => `<tr>
    <td style="padding:12px 18px;font-family:${FF};font-size:14px;line-height:22px;color:${C.body};border-top:1px solid ${C.line}">${esc(k)}</td>
    <td align="right" style="padding:12px 18px;font-family:${FF};font-size:14px;line-height:22px;font-weight:700;color:${C.dark};border-top:1px solid ${C.line};white-space:nowrap">${esc(v)}</td>
  </tr>`).join("")}
  ${total ? `<tr>
    <td style="padding:14px 18px;font-family:${FF};font-size:14px;line-height:22px;font-weight:700;color:${C.dark};background-color:${C.box};border-top:1px solid ${C.line}">${esc(total[0])}</td>
    <td align="right" style="padding:14px 18px;font-family:${FF};font-size:16px;line-height:24px;font-weight:700;color:${C.accent};background-color:${C.box};border-top:1px solid ${C.line};white-space:nowrap">${esc(total[1])}</td>
  </tr>` : ""}
</table>`;

/* ------------------------------------------------------------------- layout */

function layout(opts: {
    preheader: string;
    title: string;
    body: string;
}): string {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(opts.title)}</title>
<style>
  @media only screen and (max-width:620px) {
    .wrapper { width:100% !important; max-width:100% !important; }
    .header-pad { padding:24px 22px !important; }
    .card-pad { padding:28px 22px 34px 22px !important; }
    .footer-pad { padding:26px 22px 10px 22px !important; }
    .h1 { font-size:20px !important; line-height:28px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.page};-webkit-font-smoothing:antialiased">
<div style="display:none;font-size:1px;color:${C.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.page};border-collapse:collapse">
 <tr><td align="center" style="padding:24px 12px">

  <table role="presentation" class="wrapper" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;border-collapse:collapse">

   <tr><td style="height:8px;line-height:8px;font-size:0;background-color:${C.brand};border-radius:10px 10px 0 0">&nbsp;</td></tr>
   <tr><td style="height:6px;line-height:6px;font-size:0">&nbsp;</td></tr>

   <tr><td class="header-pad" align="center" style="background-color:${C.brand};padding:30px 32px">
     <img src="${LOGO_BRANCA_URL}" width="188" height="40" alt="Clinbia" style="display:block;margin:0 auto;width:188px;height:40px;border:0;outline:none;text-decoration:none">
   </td></tr>

   <tr><td class="card-pad" style="background-color:#FFFFFF;padding:36px 34px 44px 34px;border-radius:0 0 10px 10px">
     <h1 class="h1" style="margin:0 0 20px 0;font-family:${FF};font-size:23px;line-height:31px;font-weight:700;color:${C.accent}">${esc(opts.title)}</h1>
     ${opts.body}
     <p style="margin:24px 0 0 0;font-family:${FF};font-size:14px;line-height:23px;color:${C.body}">Atenciosamente,<br><span style="font-weight:700;color:${C.dark}">Equipe Clinbia</span></p>
   </td></tr>

   <tr><td class="footer-pad" style="background-color:${C.page};padding:30px 34px 10px 34px">
     <img src="${LOGO_AZUL_URL}" width="135" height="28" alt="Clinbia" style="display:block;width:135px;height:28px;border:0;outline:none;text-decoration:none">
     <p style="margin:14px 0 0 0;font-family:${FF};font-size:13px;line-height:20px;color:${C.body}">Clinbia – Atendimento e Gestão de Leads com IA</p>
     <p style="margin:10px 0 0 0;font-family:${FF};font-size:12px;line-height:19px;color:${C.soft}">
       Este é um e-mail automático enviado por nao-responda@clinbia.ai.<br>
       Você recebeu esta mensagem porque possui um cadastro na plataforma Clinbia.<br>
       Em caso de dúvidas, fale com o seu consultor Clinbia.
     </p>
     <p style="margin:14px 0 0 0;font-family:${FF};font-size:12px;line-height:19px;color:${C.soft}">© ${new Date().getFullYear()} Clinbia. Todos os direitos reservados.</p>
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
    const subject = "Confirme seu email na Clinbia";
    const html = layout({
        preheader: "Falta só um passo: confirme seu e-mail para validarmos seu cadastro.",
        title: "Confirme seu e-mail",
        body:
            greeting(`Olá, ${esc(nome)}!`) +
            p(`Recebemos o cadastro ${v.company_name ? `da ${strong(esc(v.company_name))} ` : ""}na Clinbia. Para validar seu endereço de e-mail e dar continuidade à ativação da sua conta, clique no botão abaixo.`) +
            cta("Confirmar meu e-mail", v.confirm_url) +
            p(`Após a confirmação, seu cadastro será validado e o time de implementação da Clinbia entrará em contato para orientar os próximos passos e preparar o acesso da sua clínica à plataforma.`) +
            p(`Se o botão não funcionar, copie e cole o endereço abaixo no seu navegador:`, `margin-bottom:8px`) +
            p(linkTo(v.confirm_url), `font-size:13px;line-height:21px`) +
            p(`Este link é válido por ${strong("7 dias")}. Se você não realizou este cadastro, pode ignorar esta mensagem com segurança. Nenhuma conta será ativada sem a confirmação do seu e-mail.`),
    });
    const text = `Olá, ${nome}!

Recebemos o cadastro${v.company_name ? ` da ${v.company_name}` : ""} na Clinbia. Para validar seu endereço de e-mail e dar continuidade à ativação da sua conta, clique no link abaixo.

Confirmar meu e-mail: ${v.confirm_url}

Após a confirmação, seu cadastro será validado e o time de implementação da Clinbia entrará em contato para orientar os próximos passos e preparar o acesso da sua clínica à plataforma.

Este link é válido por 7 dias. Se você não realizou este cadastro, pode ignorar esta mensagem com segurança. Nenhuma conta será ativada sem a confirmação do seu e-mail.

Atenciosamente,
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
        preheader: "Sua conta foi ativada. Use os dados abaixo para entrar na plataforma.",
        title: "Seu acesso está liberado",
        body:
            greeting(`Olá, ${esc(nome)}!`) +
            p(`A conta ${v.company_name ? `da ${strong(esc(v.company_name))} ` : ""}foi ativada e seu acesso à Clinbia já está disponível. Para começar, clique no botão abaixo e defina sua senha de acesso.`) +
            cta("Acessar a Clinbia", url) +
            dataTable("Dados da sua conta", [
                ["Endereço", url.replace(/^https?:\/\//, "")],
                ["E-mail", v.login_email],
                ...(v.temp_password ? [["Senha provisória", v.temp_password] as [string, string]] : []),
            ]) +
            p(`Por segurança, no seu primeiro acesso você deverá criar uma senha pessoal. Não compartilhe suas credenciais de acesso com outras pessoas da equipe. Cada usuário deverá utilizar seu próprio acesso à plataforma.`) +
            p(`A partir de agora, você já pode iniciar a configuração da sua operação na Clinbia, incluindo conexão do WhatsApp, cadastro da equipe, configuração dos serviços, etapas do CRM e ativação dos recursos de inteligência artificial.`) +
            p(`Nosso time de implementação acompanhará sua clínica durante essa etapa para garantir que tudo esteja corretamente configurado antes do início da operação.`) +
            p(`Se precisar de ajuda durante o processo, fale com o responsável pela implementação da sua conta.`) +
            p(strong("Bem-vindo(a) à Clinbia!")),
    });
    const text = `Olá, ${nome}!

A conta${v.company_name ? ` da ${v.company_name}` : ""} foi ativada e seu acesso à Clinbia já está disponível. Para começar, acesse o link abaixo e defina sua senha de acesso.

Acessar a Clinbia: ${url}

DADOS DA SUA CONTA
Endereço: ${url.replace(/^https?:\/\//, "")}
E-mail: ${v.login_email}${v.temp_password ? `\nSenha provisória: ${v.temp_password}` : ""}

Por segurança, no seu primeiro acesso você deverá criar uma senha pessoal. Não compartilhe suas credenciais de acesso com outras pessoas da equipe. Cada usuário deverá utilizar seu próprio acesso à plataforma.

A partir de agora, você já pode iniciar a configuração da sua operação na Clinbia, incluindo conexão do WhatsApp, cadastro da equipe, configuração dos serviços, etapas do CRM e ativação dos recursos de inteligência artificial.

Nosso time de implementação acompanhará sua clínica durante essa etapa para garantir que tudo esteja corretamente configurado antes do início da operação.

Se precisar de ajuda durante o processo, fale com o responsável pela implementação da sua conta.

Bem-vindo(a) à Clinbia!

Atenciosamente,
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
    const subject = "Redefina sua senha da Clinbia";
    const html = layout({
        preheader: "Recebemos uma solicitação para redefinir a senha da sua conta Clinbia.",
        title: "Redefinição de senha",
        body:
            greeting(nome ? `Olá, ${esc(nome)}!` : "Olá!") +
            p(`Recebemos uma solicitação para redefinir a senha da sua conta Clinbia. Para criar uma nova senha, clique no botão abaixo:`) +
            cta("Criar nova senha", v.reset_url) +
            p(`Por segurança, este link é pessoal, de uso único e válido por ${strong(esc(validade))}. Após a redefinição da senha, ele deixará de funcionar automaticamente.`) +
            p(`Se o botão não funcionar, copie e cole o endereço abaixo no seu navegador:`, `margin-bottom:8px`) +
            p(linkTo(v.reset_url), `font-size:13px;line-height:21px`) +
            p(`${strong("Não solicitou a redefinição da senha?")} Você pode ignorar esta mensagem. Sua senha atual continuará válida e nenhuma alteração será realizada em sua conta.`) +
            p(`Se tiver qualquer dúvida ou identificar alguma atividade que não reconheça, entre em contato com a equipe Clinbia.`),
    });
    const text = `${nome ? `Olá, ${nome}!` : "Olá!"}

Recebemos uma solicitação para redefinir a senha da sua conta Clinbia. Para criar uma nova senha, acesse o link abaixo:

${v.reset_url}

Por segurança, este link é pessoal, de uso único e válido por ${validade}. Após a redefinição da senha, ele deixará de funcionar automaticamente.

Não solicitou a redefinição da senha? Você pode ignorar esta mensagem. Sua senha atual continuará válida e nenhuma alteração será realizada em sua conta.

Se tiver qualquer dúvida ou identificar alguma atividade que não reconheça, entre em contato com a equipe Clinbia.

Atenciosamente,
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
            greeting(`Olá, ${esc(nome)}!`) +
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
            cta("Ver relatório completo", url) +
            callout(`Os valores de disparo são uma <strong>estimativa</strong> baseada na tabela da Meta e na cotação do dólar do período — a cobrança oficial é a da sua conta na Meta.`, "blue") +
            p(`Este relatório é enviado todo dia 1º com o fechamento do mês anterior.`, `font-size:13px;line-height:21px;color:${C.soft}`),
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
            greeting(`Olá, ${esc(nome)}!`) +
            p(`A conta ${v.company_name ? `da ${strong(esc(v.company_name))} ` : ""}na Clinbia foi encerrada em ${strong(esc(v.data_encerramento))}.`) +
            callout(
                `A partir de agora, o acesso à plataforma está desativado para você e para toda a sua equipe. Novos logins não serão permitidos e os atendimentos, automações e recursos de inteligência artificial vinculados à conta foram interrompidos.`,
                "red",
            ) +
            p(`Seus dados, incluindo conversas, contatos, agendamentos, informações do CRM e relatórios, serão mantidos por ${strong(`${dias} dias`)} a partir da data de encerramento.`) +
            p(`Durante esse período, sua conta poderá ser reativada com os dados preservados. Após o prazo de ${dias} dias, as informações serão excluídas de acordo com nossa política de retenção de dados.`) +
            p(`Caso queira reativar sua conta, entre em contato com a equipe Clinbia dentro desse período.`) +
            p(`Se preferir, você também poderá solicitar uma cópia dos seus dados antes da exclusão.`) +
            p(`Se o encerramento não foi solicitado por você ou se tiver alguma dúvida, fale com seu consultor Clinbia o quanto antes.`) +
            p(`Agradecemos por ter escolhido a Clinbia.`),
    });
    const text = `Olá, ${nome}!

A conta${v.company_name ? ` da ${v.company_name}` : ""} na Clinbia foi encerrada em ${v.data_encerramento}.

A partir de agora, o acesso à plataforma está desativado para você e para toda a sua equipe. Novos logins não serão permitidos e os atendimentos, automações e recursos de inteligência artificial vinculados à conta foram interrompidos.

Seus dados, incluindo conversas, contatos, agendamentos, informações do CRM e relatórios, serão mantidos por ${dias} dias a partir da data de encerramento.

Durante esse período, sua conta poderá ser reativada com os dados preservados. Após o prazo de ${dias} dias, as informações serão excluídas de acordo com nossa política de retenção de dados.

Caso queira reativar sua conta, entre em contato com a equipe Clinbia dentro desse período.

Se preferir, você também poderá solicitar uma cópia dos seus dados antes da exclusão.

Se o encerramento não foi solicitado por você ou se tiver alguma dúvida, fale com seu consultor Clinbia o quanto antes.

Agradecemos por ter escolhido a Clinbia.

Atenciosamente,
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
            greeting(`Olá, ${esc(nome)}!`) +
            p(`Você foi adicionado(a) à equipe ${v.company_name ? `da ${strong(esc(v.company_name))} ` : ""}na Clinbia — a plataforma onde o time atende os pacientes pelo WhatsApp e Instagram, acompanha o funil de vendas e organiza a agenda.`) +
            dataTable("Dados de acesso", [
                ["Endereço", url.replace(/^https?:\/\//, "")],
                ["E-mail", v.login_email],
                ["Senha provisória", v.temp_password],
                ...(cargo ? [["Seu perfil", cargo] as [string, string]] : []),
            ]) +
            cta("Entrar na plataforma", url) +
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
            greeting(`Olá, ${esc(nome)}!`) +
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
            greeting(`Olá, ${esc(nome)}!`) +
            p(`A conexão ${strong(esc(v.instance_name))}${v.phone ? ` (${esc(v.phone)})` : ""} ${v.company_name ? `da ${esc(v.company_name)} ` : ""}foi desconectada do WhatsApp.`) +
            callout(
                `Enquanto ela estiver fora do ar, <strong>as mensagens dos seus pacientes não chegam ao inbox</strong> e nada é enviado por esse número — inclusive campanhas, lembretes de consulta e as respostas da inteligência artificial.`,
                "red",
            ) +
            cta("Reconectar agora", url) +
            p(`Para reconectar: entre na plataforma, abra ${strong("Conexões")}, clique em ${strong("Conectar")} no cartão dessa conexão e leia o QR Code com o WhatsApp do aparelho.`) +
            p(`Quedas costumam acontecer quando o celular fica sem internet, sem bateria, ou quando a sessão é encerrada em <em>Aparelhos conectados</em> no WhatsApp.`, `font-size:13px;line-height:21px;color:${C.soft}`),
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
            greeting(`Olá, ${esc(nome)}!`) +
            p(`Boas notícias: a conta ${v.company_name ? `da ${strong(esc(v.company_name))} ` : ""}na Clinbia foi ${strong("reativada")} e o acesso já está liberado para você e para toda a equipe.`) +
            callout(`Suas conversas, contatos, agendamentos, campanhas e relatórios foram preservados — está tudo exatamente como você deixou.`, "green") +
            cta("Voltar para a plataforma", url) +
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
            greeting(`Olá, ${esc(nome)}!`) +
            p(`A conta ${v.company_name ? `da ${strong(esc(v.company_name))} ` : ""}na Clinbia está encerrada e o prazo de guarda dos dados está chegando ao fim.`) +
            callout(
                `Em <strong>${esc(String(dias))} ${dias === 1 ? "dia" : "dias"}</strong>, no dia <strong>${esc(v.data_exclusao)}</strong>, todas as conversas, contatos, agendamentos, vendas e relatórios serão <strong>excluídos em definitivo</strong>. Depois dessa data não há como recuperar nenhuma informação.`,
                "red",
            ) +
            p(`Se quiser ${strong("reativar a conta")} ou ${strong("receber uma cópia dos seus dados")} antes da exclusão, fale com o seu consultor Clinbia ainda hoje — depois do prazo, infelizmente, não é possível.`) +
            p(`Se você já não precisa mais dessas informações, não é preciso fazer nada: a exclusão acontece automaticamente na data acima.`, `font-size:13px;line-height:21px;color:${C.soft}`),
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
            greeting(`Olá, ${esc(nome)}!`) +
            p(`A Meta recusou o ${strong("nome de exibição")} do número ${strong(esc(v.instance_name))}${v.phone ? ` (${esc(v.phone)})` : ""}${v.company_name ? ` da ${esc(v.company_name)}` : ""}.`) +
            callout(
                `Enquanto a restrição estiver ativa, <strong>nenhuma mensagem sai por esse número</strong>: campanhas, lembretes automáticos e respostas da inteligência artificial ficam bloqueados. As mensagens recebidas continuam chegando normalmente no inbox.`,
                "red",
            ) +
            p(`Para resolver, acesse o ${strong("Gerenciador do WhatsApp")} na Meta, abra as configurações do número e ${strong("envie um novo nome de exibição")} que represente de fato o seu negócio — normalmente o nome fantasia da clínica, sem promoções nem palavras genéricas. A análise costuma levar algumas horas.`) +
            cta("Ver a conexão na plataforma", url) +
            p(`Assim que a Meta aprovar o novo nome, o envio é liberado sozinho e o aviso some do cartão da conexão.`, `font-size:13px;line-height:21px;color:${C.soft}`),
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
            greeting(nome ? `Olá, ${esc(nome)}!` : "Olá!") +
            p(`A senha da conta ${v.login_email ? `${strong(esc(v.login_email))} ` : ""}foi alterada em ${strong(esc(v.data_alteracao))}.`) +
            p(`Se foi você quem alterou, está tudo certo — pode ignorar este aviso.`) +
            callout(
                `<strong>Não foi você?</strong> Entre em contato com o seu consultor Clinbia imediatamente e peça a redefinição da senha. Enquanto isso, avise o administrador da conta para revisar os acessos da equipe.`,
                "amber",
            ) +
            p(`Este aviso é enviado sempre que a senha muda, para proteger o acesso aos dados dos seus pacientes.`, `font-size:13px;line-height:21px;color:${C.soft}`),
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
