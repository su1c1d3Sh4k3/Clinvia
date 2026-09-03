import { useNavigate } from "react-router-dom";
import {
    Settings, User, Lock, Bell, Tag, Zap, HelpCircle, ExternalLink, Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Callout, LearnChip, StepByStep, SubNav, TopicSection } from "./blocks";

// ---------------------------------------------------------------------------
// Manual da página Configurações (/settings)
// ---------------------------------------------------------------------------

const TOPICS = [
    { id: "o-que-e", label: "O que é" },
    { id: "perfil-empresa", label: "Perfil e Empresa" },
    { id: "seguranca", label: "Segurança" },
    { id: "sistema", label: "Sistema" },
    { id: "tags", label: "Tags" },
    { id: "automacoes", label: "Automações" },
    { id: "emails", label: "E-mails da conta" },
    { id: "faq", label: "FAQ" },
];

export function ConfiguracoesGuide() {
    const navigate = useNavigate();

    return (
        <div className="space-y-8">
            {/* Hero */}
            <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <Settings className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Manual de Configurações</h1>
                        <p className="text-sm text-muted-foreground">
                            Seus dados, os dados da clínica, notificações, tags e a instância das mensagens automáticas.
                        </p>
                    </div>
                </div>
                <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        O que você vai aprender
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <LearnChip topicId="sistema">Notificações e instalar o app</LearnChip>
                        <LearnChip topicId="tags">Organizar contatos com tags</LearnChip>
                        <LearnChip topicId="automacoes">Instância primária dos disparos</LearnChip>
                        <LearnChip topicId="emails">Quais e-mails a Clinbia envia</LearnChip>
                    </div>
                </div>
            </div>

            <SubNav topics={TOPICS} />

            {/* 1 */}
            <TopicSection id="o-que-e" index={1} icon={Settings} title="O que é a página Configurações?"
                subtitle="Seis abas — das preferências pessoais às automações da clínica">
                <p className="text-sm text-muted-foreground">
                    <strong className="text-foreground">Perfil</strong>, <strong className="text-foreground">Empresa</strong>,{" "}
                    <strong className="text-foreground">Segurança</strong> e <strong className="text-foreground">Sistema</strong>{" "}
                    cuidam da sua conta e preferências. <strong className="text-foreground">Tags</strong> organiza os
                    contatos, e <strong className="text-foreground">Automações</strong> (admin ou permissão liberada) define o número que envia
                    as mensagens automáticas da clínica.
                </p>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/settings?tour=config-tour")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
                    </Button>
                </div>
            </TopicSection>

            {/* 2 */}
            <TopicSection id="perfil-empresa" index={2} icon={User} title="Perfil e Empresa"
                subtitle="Quem é você e quem é a clínica">
                <StepByStep steps={[
                    { title: "Perfil", description: "Seu nome e foto — é assim que você aparece para a equipe (atendente responsável, métricas por atendente)." },
                    { title: "Empresa", description: "Dados da organização, como o nome da clínica. Alguns textos automáticos usam esse nome quando a aba Empresa da IA não está preenchida." },
                ]} />
                <Callout type="dica" title="Nome da clínica em dois lugares">
                    O nome usado nas mensagens automáticas vem primeiro das definições de IA (aba Empresa em /ia-config);
                    o nome da empresa aqui é o reserva. Mantenha os dois coerentes.
                </Callout>
            </TopicSection>

            {/* 3 */}
            <TopicSection id="seguranca" index={3} icon={Lock} title="Segurança"
                subtitle="E-mail e senha da sua conta">
                <p className="text-sm text-muted-foreground">
                    Atualize seu <strong className="text-foreground">e-mail de acesso</strong> e sua{" "}
                    <strong className="text-foreground">senha</strong>. Cada membro troca a própria senha — o admin não vê
                    senhas de ninguém.
                </p>
                <Callout type="atencao" title="Funcionário saiu da clínica?">
                    Trocar a senha não basta se o login era compartilhado. O caminho certo é cada pessoa ter seu acesso
                    (página Equipe) e o admin desativar o membro que saiu.
                </Callout>
                <Callout type="dica" title="Esqueceu a senha? O link chega por e-mail">
                    Na tela de login, em <strong>Esqueci minha senha</strong>, informe o e-mail cadastrado: a Clinbia
                    envia um <strong>link para você criar uma nova senha</strong>, válido por 1 hora e de uso único. A
                    tela sempre responde da mesma forma, exista ou não a conta — é assim que ninguém descobre quem é
                    cliente por tentativa. Toda troca de senha (por esse link ou pela aba Segurança) gera um e-mail de
                    aviso: se você não reconhecer a alteração, fale com o suporte na hora.
                </Callout>
            </TopicSection>

            {/* 4 */}
            <TopicSection id="sistema" index={4} icon={Bell} title="Sistema"
                subtitle="Menu lateral, notificações, sons e instalação do aplicativo">
                <StepByStep steps={[
                    { title: "Menu agrupado", description: "Ligado (padrão), o menu lateral fica organizado em Atendimento (Inbox, CRM, Conexões), Cadastros (Serviços, Clientes, Equipe, IA) e Marketing (Recorrência, Campanhas). Desligue para ver todas as páginas em lista única." },
                    { title: "Notificações push", description: "Ative para receber alertas de novas mensagens mesmo com a aba fechada — o navegador vai pedir permissão." },
                    { title: "Sons e alertas", description: "Personalize como você é avisado de novas conversas enquanto usa o sistema." },
                    { title: "Instalar o app", description: "O Clinvia é um PWA: instale no celular ou no computador para abrir como aplicativo, com ícone próprio." },
                ]} />
                <p className="text-sm text-muted-foreground">
                    A escolha do <strong className="text-foreground">menu agrupado</strong> é de cada pessoa: você muda
                    aqui e ela vale em qualquer computador ou celular onde você entrar. Quais grupos ficam abertos é
                    guardado no próprio navegador — trocar de página ou atualizar não fecha o que você deixou aberto, e
                    o grupo da página em que você está abre sozinho.
                </p>
                <Callout type="pratica" title="Recepção sempre notificada">
                    No computador da recepção, instale o app e ative as notificações push — nenhuma mensagem de cliente
                    passa despercebida, mesmo com o navegador minimizado.
                </Callout>
            </TopicSection>

            {/* 5 */}
            <TopicSection id="tags" index={5} icon={Tag} title="Tags"
                subtitle="Etiquetas livres para organizar contatos">
                <p className="text-sm text-muted-foreground">
                    Crie e gerencie as <strong className="text-foreground">tags</strong> que você aplica aos contatos
                    (ex.: "VIP", "Convênio X"). Elas aparecem no perfil do cliente e servem de filtro. As{" "}
                    <strong className="text-foreground">campanhas criam tags automaticamente</strong> com o nome da
                    campanha (aplicadas 1h antes do disparo; no máximo uma tag de campanha por conexão, removida
                    quando a campanha encerra) — é assim que o sistema avisa quando você tenta
                    disparar de novo para quem já recebeu campanha nos últimos 7 dias.
                </p>
                <Callout type="evite" title="Não use tag para o que já é automático">
                    Estágio do cliente (Contato/Lead/Cliente) e etapa do CRM já são automáticos. Use tags para o que o
                    sistema não sabe sozinho: convênios, origem, preferências.
                </Callout>
            </TopicSection>

            {/* 6 */}
            <TopicSection id="automacoes" index={6} icon={Zap} title="Automações"
                subtitle="Qual número envia as mensagens automáticas">
                <p className="text-sm text-muted-foreground">
                    Aqui o admin escolhe a <strong className="text-foreground">instância primária de disparos</strong> — o
                    número que envia confirmações de agendamento (24h antes), lembretes (2h antes) e pesquisas de
                    satisfação. Sem escolha manual, o sistema prefere um número oficial Meta conectado.
                </p>
                <p className="text-sm text-muted-foreground">
                    A aba tem dois cartões separados: <strong className="text-foreground">Envios Automáticos</strong>{" "}
                    (confirmações, lembretes e feedback de agendamento) e{" "}
                    <strong className="text-foreground">Recorrência</strong> — o número que dispara as campanhas diárias
                    de recorrência dos serviços. Cada um pode usar uma instância diferente. A instância, o horário e a
                    duração das campanhas de Recorrência (padrão 3 dias) também podem ser ajustados pelo botão de
                    engrenagem na página Recorrência.
                </p>
                <Callout type="atencao" title="Prefira o número oficial (Meta)">
                    Selecionar uma conexão por QR code (não oficial) como primária exibe um alerta de risco: disparos
                    automáticos em volume por número não oficial aumentam a chance de banimento pelo WhatsApp. O número
                    oficial usa templates aprovados e é o caminho seguro.
                </Callout>
                <p className="text-sm text-muted-foreground">
                    A aba também traz o cartão <strong className="text-foreground">Encerramento Automático de
                    Mensagens</strong> (ligado por padrão): quando o cliente para de responder, o sistema envia uma
                    mensagem de aviso e, se seguir sem retorno, envia a mensagem de encerramento, resolve o ticket e
                    move o card do CRM para a etapa <strong className="text-foreground">Sem Contato</strong>. As duas
                    mensagens são editáveis. O tempo conta sempre a partir da <strong className="text-foreground">última
                    mensagem do cliente</strong> — mensagens da equipe não reiniciam o relógio, e qualquer resposta do
                    cliente cancela o ciclo e abre uma nova janela.
                </p>
                <Callout type="dica" title="Tempos: Meta fixo, não oficial configurável">
                    Na API Oficial (Meta) o aviso sai às <strong>22h30</strong> e o encerramento às{" "}
                    <strong>23h30</strong> após a última mensagem do cliente — fixos, para nunca estourar a janela de
                    24h. Nas conexões não oficiais (QR code) os dois tempos podem ser aumentados ou diminuídos. A
                    chavinha <strong>Fechar conversas sem interação</strong> (também ligada por padrão) encerra, sem
                    enviar mensagem, conversas em que o cliente nunca respondeu — após 48h, tempo configurável. Grupos
                    e Instagram ficam de fora do encerramento automático.
                </Callout>
                <Callout type="atencao" title="Tique da mensagem final no histórico">
                    A mensagem de encerramento sai no mesmo instante em que o ticket é arquivado, e o aviso de entrega do
                    WhatsApp chega alguns segundos depois. O sistema aplica esse status no histórico por até{" "}
                    <strong>15 minutos</strong> após o encerramento — se o recibo demorar mais que isso, a mensagem fica
                    marcada como <strong>Enviada</strong> no histórico mesmo tendo sido entregue ao cliente.
                </Callout>
            </TopicSection>

            {/* 7 */}
            <TopicSection id="emails" index={7} icon={Mail} title="E-mails que a Clinbia envia"
                subtitle="Avisos automáticos para o e-mail cadastrado na conta">
                <p className="text-sm text-muted-foreground">
                    Tudo sai de <strong className="text-foreground">nao-responda@clinbia.ai</strong> — responder essa
                    mensagem não abre chamado. Se algum aviso não chegar, procure na caixa de spam e marque como
                    confiável para os próximos.
                </p>
                <StepByStep steps={[
                    { title: "Confirmação de cadastro", description: "Logo após você pedir uma conta no site. Clique no link para validar o e-mail — só depois disso nosso time de implementação entra em contato para liberar o acesso. O link vale 7 dias." },
                    { title: "Acesso liberado", description: "Quando a conta é aprovada. Traz o e-mail de login e, quando a senha é provisória, a senha inicial — que o sistema pede para trocar no primeiro acesso." },
                    { title: "Convite de colaborador", description: "Enviado para cada pessoa cadastrada na página Equipe, com o login, a senha provisória e o cargo." },
                    { title: "Recuperação e troca de senha", description: "O link de redefinição e, depois, o aviso de que a senha foi alterada." },
                    { title: "Conexão fora do ar", description: "Quando um número de WhatsApp perde a conexão, ou quando a Meta bloqueia o envio pelo número oficial. No máximo um e-mail a cada 24h por conexão." },
                    { title: "Relatório de consumo", description: "Todo dia 1º, com o consumo do mês anterior: tokens de IA, disparos de campanha e automáticos, templates da Meta e o custo estimado em reais." },
                    { title: "Encerramento e exclusão", description: "Se a conta for encerrada, você recebe o aviso na hora, outro 7 dias antes da exclusão definitiva dos dados, e um e-mail de boas-vindas de volta caso a conta seja reativada." },
                ]} />
                <Callout type="atencao" title="Mantenha o e-mail da conta atualizado">
                    Todos esses avisos vão para o e-mail de acesso (aba Segurança). Se ele estiver desatualizado, você
                    deixa de saber que uma conexão caiu ou que o consumo do mês subiu.
                </Callout>
                <Callout type="dica" title="O relatório de consumo não é a fatura">
                    Os valores em reais são uma <strong>estimativa</strong> do custo de IA e de mensagens da Meta,
                    calculada pelo mesmo critério da aba Minha Conta do Dashboard. A cobrança oficial continua vindo
                    pelos canais comerciais.
                </Callout>
            </TopicSection>

            {/* 8 */}
            <TopicSection id="faq" index={8} icon={HelpCircle} title="Perguntas frequentes">
                <Accordion type="single" collapsible className="rounded-xl border px-4">
                    {[
                        {
                            q: "Não vejo a aba Automações.",
                            a: "Ela aparece para administradores e para quem tem a permissão 'Automações' liberada em Equipe > Permissões. Sem a permissão, as demais abas seguem normais.",
                        },
                        {
                            q: "Ativei as notificações mas nada chega.",
                            a: "Verifique se o navegador tem permissão de notificação para o site (cadeado na barra de endereço) e se o sistema operacional não está em modo 'não perturbe'. Em celular, instale o app (PWA) primeiro.",
                        },
                        {
                            q: "Mudei a instância primária — os envios mudam na hora?",
                            a: "Sim, os próximos ciclos de mensagens automáticas (rodam a cada 10 minutos) já usam a nova instância. Mensagens já enviadas não são reenviadas.",
                        },
                        {
                            q: "Apaguei uma tag — os contatos perdem a etiqueta?",
                            a: "Sim, remover a tag a remove de todos os contatos que a tinham. Os contatos em si não são afetados.",
                        },
                        {
                            q: "Recebi um e-mail dizendo que minha senha foi alterada e não fui eu.",
                            a: "Peça imediatamente a redefinição pelo 'Esqueci minha senha' na tela de login — isso invalida a senha atual — e avise o suporte. Confira também, na página Equipe, se algum acesso desconhecido foi criado.",
                        },
                        {
                            q: "Não recebi o e-mail de confirmação / de redefinição de senha.",
                            a: "Procure na caixa de spam por nao-responda@clinbia.ai e confirme se o e-mail digitado é o mesmo cadastrado. O link de cadastro vale 7 dias e o de senha 1 hora; se venceu, basta pedir de novo.",
                        },
                        {
                            q: "Onde configuro horário de funcionamento e serviços?",
                            a: "Fora daqui: horários dos profissionais ficam na Agenda (modal do profissional), o catálogo em Serviços, e as informações que a IA usa em IA > Empresa.",
                        },
                    ].map((f, i, arr) => (
                        <AccordionItem key={i} value={`faq-${i}`} className={i === arr.length - 1 ? "border-b-0" : ""}>
                            <AccordionTrigger className="text-left text-sm font-semibold">{f.q}</AccordionTrigger>
                            <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            </TopicSection>
        </div>
    );
}
