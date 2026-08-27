import { useNavigate } from "react-router-dom";
import {
    Megaphone, ClipboardList, Rocket, Users, Send, BarChart3, Snowflake,
    RefreshCcw, Bot, HelpCircle, FileText, Tag, MessageSquareText, Target,
    ClipboardCheck, Sparkles, ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Callout, LearnChip, StepByStep, SubNav, TopicSection } from "./blocks";
import { ContactStatusSimulator, LifecycleSimulator, MiniWizardDemo } from "./simulators";

// ---------------------------------------------------------------------------
// Manual da aba Campanhas — conteúdo completo (tópicos 1 a 10)
// ---------------------------------------------------------------------------

const TOPICS = [
    { id: "o-que-e", label: "O que são" },
    { id: "antes-de-comecar", label: "Antes de começar" },
    { id: "criando", label: "Criando" },
    { id: "publicos", label: "Públicos e variáveis" },
    { id: "disparo", label: "O disparo" },
    { id: "resultados", label: "Resultados" },
    { id: "congelamento", label: "Ao vivo x congelado" },
    { id: "reenvio", label: "Reenvio" },
    { id: "ia", label: "IA" },
    { id: "faq", label: "FAQ" },
];

/** Badge com as MESMAS cores usadas na tabela real de contatos da campanha. */
function LegendRow({ badge, cls, text }: { badge: string; cls: string; text: string }) {
    return (
        <div className="flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-center sm:gap-3">
            <Badge variant="outline" className={`w-fit shrink-0 ${cls}`}>{badge}</Badge>
            <p className="text-sm text-muted-foreground">{text}</p>
        </div>
    );
}

export function CampaignsGuide() {
    const navigate = useNavigate();
    const openTour = (tour: string) => navigate(`/campanhas?tour=${tour}`);

    return (
        <div className="space-y-8">
            {/* Hero */}
            <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <Megaphone className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Manual de Campanhas</h1>
                        <p className="text-sm text-muted-foreground">
                            Envie mensagens em massa pelo WhatsApp e acompanhe quem respondeu, quem agendou e quem virou cliente.
                        </p>
                    </div>
                </div>
                <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        O que você vai aprender
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <LearnChip topicId="criando">Criar uma campanha do zero</LearnChip>
                        <LearnChip topicId="publicos">Escolher para quem enviar</LearnChip>
                        <LearnChip topicId="resultados">Ler os resultados</LearnChip>
                        <LearnChip topicId="congelamento">Saber o que é ao vivo e o que congela</LearnChip>
                        <LearnChip topicId="reenvio">Reenviar para quem não respondeu</LearnChip>
                    </div>
                </div>
            </div>

            <SubNav topics={TOPICS} />

            {/* 1. O que são campanhas */}
            <TopicSection id="o-que-e" index={1} icon={Megaphone} title="O que são campanhas?"
                subtitle="A mala direta inteligente do WhatsApp">
                <p className="text-sm text-muted-foreground">
                    Uma campanha envia <strong className="text-foreground">a mesma mensagem para várias pessoas de uma vez</strong>,
                    de forma organizada e segura: cada contato recebe individualmente (ninguém vê grupo), com intervalo entre os
                    envios para proteger o seu número, e o sistema registra o que aconteceu com cada pessoa — recebeu? respondeu?
                    agendou?
                </p>
                <p className="text-sm text-muted-foreground">
                    Pense nela como uma <strong className="text-foreground">mala direta inteligente</strong>: você escolhe o público,
                    escreve a mensagem uma única vez e a clínica acompanha os resultados em tempo real, contato por contato.
                </p>
                <Callout type="dica" title="Quando usar">
                    Reativar pacientes antigos (ex.: "seu botox está vencendo"), divulgar uma promoção, avisar sobre um mutirão de
                    avaliações, confirmar presença em um evento — qualquer comunicação em massa com seus contatos.
                </Callout>
            </TopicSection>

            {/* 2. Antes de começar */}
            <TopicSection id="antes-de-comecar" index={2} icon={ClipboardList} title="Antes de começar"
                subtitle="3 coisas para verificar antes da primeira campanha">
                <StepByStep steps={[
                    {
                        title: "Uma conexão de WhatsApp ativa",
                        description: <>Verifique em <strong>Conexões</strong> se a instância que fará os envios está conectada (bolinha verde). A campanha sai pelo número dessa instância.</>,
                    },
                    {
                        title: "WhatsApp Oficial (Meta): template aprovado",
                        description: <>No WhatsApp oficial, mensagens em massa só podem usar <strong>templates aprovados pela Meta</strong>. Crie e acompanhe a aprovação em Conexões &gt; Templates. A aprovação costuma levar de minutos a algumas horas.</>,
                    },
                    {
                        title: "WhatsApp não oficial (API): texto livre",
                        description: <>Instâncias não oficiais não precisam de template — você escreve a mensagem livremente no passo Mensagem do assistente.</>,
                    },
                ]} />
                <Callout type="atencao" title="Limite e qualidade do número (só WhatsApp Oficial)">
                    A Meta define quantos contatos novos seu número pode iniciar por dia (250, 1.000, 10.000...). O painel{" "}
                    <strong>Qualidade Meta</strong> no topo da página de Campanhas mostra seu limite, quanto já foi usado nas
                    últimas 24h e a "nota" do número. Se a campanha tiver mais contatos que o limite, o excedente pode ser
                    rejeitado. Qualidade baixa (muita gente bloqueando/denunciando) reduz o limite.
                </Callout>
                <Callout type="pratica">
                    Envie primeiro para públicos menores e engajados. Número com boa reputação ganha limites maiores automaticamente.
                </Callout>
            </TopicSection>

            {/* 3. Criando sua campanha */}
            <TopicSection id="criando" index={3} icon={Rocket} title="Criando sua campanha"
                subtitle="O assistente tem 6 etapas — navegue na demonstração abaixo">
                <MiniWizardDemo />
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => openTour("nova-campanha")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
                    </Button>
                </div>
                <Accordion type="single" collapsible className="rounded-xl border px-4">
                    <AccordionItem value="dados" className="border-b">
                        <AccordionTrigger className="text-sm font-semibold">
                            <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" />Etapa 1 — Dados</span>
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-muted-foreground">
                            Nome da campanha (aparece nos relatórios e vira uma tag nos contatos), a conexão que fará o envio,
                            e o período: <strong className="text-foreground">início do disparo</strong> (com pelo menos 1 hora de
                            antecedência) e <strong className="text-foreground">validade</strong> — até quando a campanha fica "viva"
                            acompanhando respostas.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="audiencia" className="border-b">
                        <AccordionTrigger className="text-sm font-semibold">
                            <span className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Etapa 2 — Audiência</span>
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-muted-foreground">
                            Para quem enviar. 5 formas de montar o público — planilha, CRM, tags, agendamentos ou vendas
                            (detalhes no tópico 4). Cada contato entra <strong className="text-foreground">uma única vez</strong>,
                            mesmo que apareça em mais de uma fonte.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="tipo" className="border-b">
                        <AccordionTrigger className="text-sm font-semibold">
                            <span className="flex items-center gap-2"><Tag className="h-4 w-4 text-primary" />Etapa 3 — Tipo de campanha</span>
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-muted-foreground">
                            <strong className="text-foreground">Promoção</strong> (divulga serviços com condição especial) ou{" "}
                            <strong className="text-foreground">Notificação</strong> (aviso sem oferta comercial). Na Promoção você
                            marca os serviços da campanha, o desconto e — opcional — os{" "}
                            <strong className="text-foreground">profissionais habilitados</strong>: marcando alguém, a IA passa a
                            consultar a agenda só de quem está na lista — os horários dos demais nem chegam a ser oferecidos ao
                            cliente enquanto a campanha estiver ativa. Sem ninguém marcado, vale a agenda de todos. A restrição
                            não tranca nada para a equipe: pelo sistema você continua agendando com qualquer profissional.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="mensagem" className="border-b">
                        <AccordionTrigger className="text-sm font-semibold">
                            <span className="flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-primary" />Etapa 4 — Mensagem</span>
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-muted-foreground">
                            Preencha as variáveis do template (ou escreva o texto). Use variáveis como{" "}
                            <code className="rounded bg-muted px-1">nome</code> para personalizar — cada pessoa recebe a mensagem
                            com os próprios dados. A pré-visualização mostra exatamente como vai chegar.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="objetivo" className="border-b">
                        <AccordionTrigger className="text-sm font-semibold">
                            <span className="flex items-center gap-2"><Target className="h-4 w-4 text-primary" />Etapa 5 — Objetivo e IA</span>
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-muted-foreground">
                            Descreva o objetivo (ex.: "agendar avaliações de harmonização com 10% off"), vincule serviços e
                            desconto. Se a IA estiver ligada, o sistema gera automaticamente as instruções para ela atender quem
                            responder — sabendo do que a campanha se trata.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="revisao">
                        <AccordionTrigger className="text-sm font-semibold">
                            <span className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-primary" />Etapa 6 — Revisão</span>
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-muted-foreground">
                            Resumo de tudo: público, mensagem, datas e custo estimado (WhatsApp Oficial). Antes de confirmar, o
                            sistema avisa se algum contato já recebeu campanha nos últimos 7 dias ou está em outra campanha ativa
                            — você decide se mantém ou remove essas pessoas.
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </TopicSection>

            {/* 4. Públicos */}
            <TopicSection id="publicos" index={4} icon={Users} title="Públicos e variáveis"
                subtitle="5 formas de escolher quem recebe — e como personalizar a mensagem">
                <div className="grid gap-3 sm:grid-cols-2">
                    {[
                        { t: "Planilha (CSV/Excel)", d: "Envie um arquivo com telefone + colunas extras (nome, serviço, data...). O sistema encontra o contato pelo telefone e cria os que não existem." },
                        { t: "CRM", d: "Selecione etapas do funil (ex.: todos em \"Sem Contato\") e a campanha pega os contatos dessas colunas." },
                        { t: "Tags", d: "Todos os contatos que têm determinada etiqueta — inclusive tags de campanhas anteriores (que marcam apenas quem recebeu a mensagem daquela campanha)." },
                        { t: "Agendamentos", d: "Filtre por período, profissional, serviço e status (ex.: quem fez botox há mais de 5 meses)." },
                        { t: "Vendas", d: "Filtre por serviço comprado e período — ideal para recompra e recorrência." },
                    ].map((x) => (
                        <div key={x.t} className="rounded-xl border p-3.5">
                            <p className="text-sm font-semibold">{x.t}</p>
                            <p className="mt-0.5 text-sm text-muted-foreground">{x.d}</p>
                        </div>
                    ))}
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5">
                        <p className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" />Variáveis</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Colunas da planilha e dados do contato viram variáveis na mensagem. "Olá <em>nome</em>, seu{" "}
                            <em>servico</em> vence em <em>data</em>" → cada pessoa recebe com os próprios dados.
                        </p>
                    </div>
                </div>
                <Callout type="dica" title="Planilha: como o telefone é encontrado">
                    A busca usa os últimos 8 dígitos do número — funciona com ou sem DDI/9º dígito. Se o contato não existir, ele é
                    criado automaticamente com o nome da planilha.
                </Callout>
                <Callout type="evite" title="Um contato, uma entrada">
                    Não precisa se preocupar com duplicados: mesmo que a pessoa apareça na planilha e no CRM ao mesmo tempo, ela
                    recebe a mensagem <strong>uma única vez</strong> por campanha.
                </Callout>
            </TopicSection>

            {/* 5. O disparo */}
            <TopicSection id="disparo" index={5} icon={Send} title="O disparo"
                subtitle="O que acontece na hora marcada — veja o ciclo de vida animado">
                <LifecycleSimulator />
                <StepByStep steps={[
                    {
                        title: "Espaçamento entre envios",
                        description: "As mensagens não saem todas de uma vez: há um intervalo de ~30 segundos entre cada envio. Isso protege seu número de ser marcado como spam. Uma campanha de 100 contatos leva perto de 1 hora.",
                    },
                    {
                        title: "Prioridade de envio",
                        description: <>Quando o mesmo número também envia as <strong>mensagens automáticas</strong> (confirmação de agendamento, lembrete e pesquisa de satisfação), elas sempre passam na frente: a campanha pausa, as automáticas saem primeiro e a campanha retoma sozinha em seguida. A ordem é: <strong>Mensagens automáticas &gt; Monitoramento de Grupos &gt; Campanhas</strong>.</>,
                    },
                    {
                        title: "Quem está em atendimento não recebe",
                        description: <>Se o contato está com uma <strong>conversa aberta</strong> com um atendente naquele momento, a campanha NÃO interrompe: ele fica marcado como "Atendimento Em Aberto" e não recebe o disparo.</>,
                    },
                    {
                        title: "Custo (WhatsApp Oficial)",
                        description: "Cada template enviado tem o custo cobrado pela Meta, mostrado na revisão. WhatsApp não oficial não tem custo por mensagem.",
                    },
                    {
                        title: "Tag automática",
                        description: "1 hora antes do disparo, os contatos da audiência ganham uma etiqueta com o nome da campanha — útil para montar públicos futuros e para o aviso de 7 dias. Cada contato tem no máximo uma tag de campanha por conexão: se ele entra em outra campanha da mesma conexão, a tag antiga sai; quando a campanha encerra, a tag é removida de todos. As campanhas de Recorrência seguem a mesma regra: elas sobrepõem uma campanha de disparo antiga (o contato fica com a tag de recorrência) e podem ser sobrepostas por uma campanha nova criada depois.",
                    },
                    {
                        title: "Quem não recebeu perde a etiqueta",
                        description: <>A etiqueta entra para todo mundo no T-1h, mas <strong>sai automaticamente</strong> de quem o sistema identificou que não recebeu a mensagem: <strong>Atendimento Em Aberto</strong>, <strong>Rejeitada</strong>, <strong>Inválido</strong> e <strong>Ignorado</strong> — inclusive quando o WhatsApp aceita o envio e recusa depois (filtro de spam). Assim, a etiqueta significa sempre "recebeu a mensagem desta campanha", e não apenas "estava na lista".</>,
                    },
                ]} />
            </TopicSection>

            {/* 6. Resultados */}
            <TopicSection id="resultados" index={6} icon={BarChart3} title="Acompanhando resultados"
                subtitle="Cards de resumo + tabela contato a contato">
                <p className="text-sm text-muted-foreground">
                    Ao expandir uma campanha você vê o <strong className="text-foreground">quadro de resultados</strong> e a{" "}
                    <strong className="text-foreground">tabela de contatos</strong> com o detalhe de cada pessoa. Clique no nome
                    para abrir a conversa.
                </p>
                <div className="space-y-2">
                    <p className="text-sm font-semibold">Como ler o quadro</p>
                    <div className="grid gap-2 lg:grid-cols-2">
                        <LegendRow badge="Respondidas" cls="bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300" text="O card grande. Quantas pessoas responderam ao disparo — e, logo abaixo, onde cada uma delas está agora: Pendente, Aberto, Resolvido e Removido. Esses 4 números sempre somam o total de respondidas." />
                        <LegendRow badge="Enviadas / Entregues / Rejeitadas" cls="bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300" text="A linha de cima é a entrega da mensagem: quantas saíram, quantas chegaram no celular e quantas o WhatsApp recusou." />
                        <LegendRow badge="Agendados" cls="bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300" text="Quantas pessoas marcaram horário dentro da validade da campanha. É a conversão — não depende do estado da conversa." />
                        <LegendRow badge="Sem Resposta" cls="bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300" text="Recebeu e nunca respondeu. Respondidas + Sem Resposta = Enviadas." />
                        <LegendRow badge="Em Atendimento" cls="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300" text="A pessoa respondeu e alguém assumiu: a conversa está Aberta e atribuída a um atendente, ou está Pendente na fila Atendimento IA. Conversa aberta sem responsável, conversa pendente na fila humana e mensagens automáticas (confirmação, lembrete, pesquisa) NÃO contam como atendimento." />
                    </div>
                </div>
                <Callout type="dica" title="Só quem respondeu aparece no detalhamento">
                    Os 4 números embaixo de <strong>Respondidas</strong> (Pendente, Aberto, Resolvido, Removido) contam{" "}
                    <em>apenas</em> quem respondeu ao disparo. Quem recebeu e ficou em silêncio está no card{" "}
                    <strong>Sem Resposta</strong> e não aparece nesse detalhamento — mesmo que tenha uma conversa pendente no
                    Inbox.
                </Callout>
                <ContactStatusSimulator />
                <div className="space-y-2">
                    <p className="text-sm font-semibold">Legenda — coluna Status (a entrega da mensagem)</p>
                    <div className="grid gap-2 lg:grid-cols-2">
                        <LegendRow badge="Pendente" cls="bg-muted text-muted-foreground" text="Ainda na fila, aguardando a vez de enviar." />
                        <LegendRow badge="Enviada" cls="bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300" text="Saiu do sistema, aguardando confirmação de entrega do WhatsApp." />
                        <LegendRow badge="Entregue" cls="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" text="Chegou no celular da pessoa (ou foi lida)." />
                        <LegendRow badge="Rejeitada" cls="bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" text="O WhatsApp recusou (número inexistente, limite diário estourado, filtro de spam...)." />
                        <LegendRow badge="Inválido" cls="bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" text="Telefone em formato inválido — nem chegou a tentar." />
                        <LegendRow badge="Atendimento Em Aberto" cls="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300" text="Estava em atendimento na hora do disparo — não recebeu para não atrapalhar a conversa." />
                        <LegendRow badge="Ignorado" cls="bg-muted text-muted-foreground" text="A campanha encerrou (ou teve erro) antes de chegar a vez deste contato." />
                    </div>
                </div>
                <div className="space-y-2">
                    <p className="text-sm font-semibold">Legenda — colunas Respondida, Agendamento e Atendente</p>
                    <div className="grid gap-2 lg:grid-cols-2">
                        <LegendRow badge="Respondida: Sim" cls="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" text="A pessoa mandou pelo menos uma mensagem depois do disparo." />
                        <LegendRow badge="Sem Resposta" cls="bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" text="A pessoa saiu da campanha (entrou em outra ou a campanha encerrou) sem nunca ter respondido." />
                        <LegendRow badge="Agendado" cls="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" text="Marcou um horário durante a campanha — o melhor resultado possível." />
                        <LegendRow badge="Atendente (nome ou IA)" cls="bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300" text="Quem cuidou do contato: a IA ou o membro da equipe que atendeu/agendou." />
                    </div>
                </div>
                <div className="space-y-2">
                    <p className="text-sm font-semibold">Legenda — coluna Estágio (o estado de agora, igual ao Inbox)</p>
                    <div className="grid gap-2 lg:grid-cols-2">
                        <LegendRow badge="Pendente" cls="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300" text="A conversa está na aba Pendentes do Inbox: ninguém assumiu o atendimento (ou quem está conduzindo é a IA)." />
                        <LegendRow badge="Aberto" cls="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" text="Um atendente assumiu — a conversa está na aba Abertos do Inbox." />
                        <LegendRow badge="Resolvido" cls="bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300" text="O atendimento foi encerrado. Se a pessoa voltar a falar, ela sai daqui e volta para as pendências." />
                        <LegendRow badge="Removido" cls="bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300" text="Saiu da campanha (entrou em outra ou a campanha encerrou) — o resultado dela ficou congelado nesse momento." />
                    </div>
                </div>
                <Callout type="dica">
                    Use os filtros no topo da tabela (Status, Respondida, Agendamento, Estágio, Atendente) para responder
                    perguntas como "quem recebeu e não respondeu?" — esse é o público perfeito para um reenvio.
                </Callout>
                <Callout type="dica">
                    A tabela não atualiza sozinha em tempo real: os dados são recarregados sempre que você aplica um filtro ou
                    clica no nome de um cliente — e você pode forçar a atualização a qualquer momento pelo botão de{" "}
                    <strong className="text-foreground">atualizar (ícone de setas circulares)</strong> ao lado da busca.
                </Callout>
            </TopicSection>

            {/* 7. Congelamento */}
            <TopicSection id="congelamento" index={7} icon={Snowflake} title="Ao vivo até sair da campanha"
                subtitle="O que muda em tempo real e o que fica congelado para sempre">
                <p className="text-sm text-muted-foreground">
                    <strong className="text-foreground">Enquanto a pessoa está na campanha</strong> (ou seja: com a etiqueta da
                    campanha), o relatório é <strong className="text-foreground">ao vivo</strong> — ele mostra exatamente o que
                    está acontecendo agora, igual ao Inbox. Ela só para de ser acompanhada quando{" "}
                    <strong className="text-foreground">perde a etiqueta</strong>: aí o sistema tira uma{" "}
                    <strong className="text-foreground">foto</strong> daquele momento e guarda para sempre.
                </p>
                <div className="grid gap-2 lg:grid-cols-2">
                    <LegendRow badge="Ao vivo" cls="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" text="Estágio (Pendente / Aberto / Resolvido), atendente e Em Atendimento: acompanham a realidade minuto a minuto. Encerrou o atendimento e a pessoa voltou a falar? Ela sai de Resolvido e volta para Pendente." />
                    <LegendRow badge="Congelado" cls="bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300" text="Agendamento e Respondida: uma vez que aconteceram durante a campanha, ficam marcados para sempre. Cancelar o horário depois não apaga o agendamento da campanha." />
                </div>
                <StepByStep steps={[
                    { title: "Agendamento e estágio são coisas diferentes", description: "A mesma pessoa pode aparecer como \"Agendado\" e, ao mesmo tempo, com a conversa Pendente, Aberta ou Resolvida. Um card conta a conversão, o outro conta o atendimento — eles não se anulam." },
                    { title: "Encerrar o atendimento não fecha o resultado", description: "Resolver a conversa move a pessoa para Resolvido, mas ela continua na campanha: se voltar a falar, o relatório acompanha de novo." },
                    { title: "Nova campanha → foto \"Movido Para Outra Campanha\"", description: "Se você dispara outra campanha para a mesma pessoa (pelo mesmo número), a anterior fecha o registro dela e ela entra no card Removidos — cada pessoa participa de 1 campanha ativa por vez." },
                    { title: "Validade venceu → foto \"Campanha Encerrada\"", description: "A campanha expirou: a etiqueta sai de todo mundo e os resultados param de se mexer. Exceção: quem está com atendimento em andamento continua sendo acompanhado até o final da conversa." },
                ]} />
                <Callout type="pratica" title="Regra de ouro">
                    <strong>A etiqueta manda.</strong> Com etiqueta, o número é o de agora. Sem etiqueta, o número é a foto do
                    momento em que ela saiu — e nunca mais muda.
                </Callout>
            </TopicSection>

            {/* 8. Reenvio */}
            <TopicSection id="reenvio" index={8} icon={RefreshCcw} title="Reenvio e regras"
                subtitle="Repescar quem não respondeu, sem incomodar quem já resolveu">
                <StepByStep steps={[
                    { title: "Clique em \"Reenviar campanha\"", description: "Disponível em campanhas Disparadas ou Encerradas, no menu do card." },
                    { title: "Escolha quem entra", description: "O assistente abre já preenchido e a etapa Audiência reutiliza automaticamente os contatos da campanha original — você só define as novas datas. Quer outro público? Clique em \"Refazer seleção de audiência\" nessa etapa." },
                    { title: "A campanha antiga fecha", description: "Ao confirmar, a campanha original é encerrada e os resultados dela ficam congelados. A nova começa do zero, com relatório próprio." },
                ]} />
                <Callout type="atencao" title="Duas proteções automáticas">
                    <strong>Aviso de 7 dias</strong>: se alguém do público recebeu outra campanha há menos de 7 dias, o sistema
                    avisa e deixa você remover essas pessoas. <strong>1 campanha ativa por contato</strong>: disparar uma nova
                    campanha para quem está em outra ativa (do mesmo número) encerra a participação anterior — o sistema também
                    avisa antes.
                </Callout>
                <Callout type="evite">
                    Reenviar para quem <strong>já respondeu ou agendou</strong> na campanha anterior. Use o filtro "Sem Resposta"
                    como público do reenvio — insistir com quem já resolveu gera bloqueios e derruba a qualidade do seu número.
                </Callout>
            </TopicSection>

            {/* 9. IA */}
            <TopicSection id="ia" index={9} icon={Bot} title="IA + campanhas"
                subtitle="Quem responde a campanha pode cair direto com a sua assistente virtual">
                <p className="text-sm text-muted-foreground">
                    Na etapa Objetivo você decide se a IA atende as respostas. Com a IA ligada, o sistema gera automaticamente as
                    instruções da campanha (objetivo, serviços, desconto, validade) e entrega para a assistente — ela sabe
                    exatamente do que a pessoa está falando quando responde "tenho interesse".
                </p>
                <StepByStep steps={[
                    { title: "IA ligada", description: "Quem responde entra na fila Atendimento IA: a assistente conversa, tira dúvidas e pode agendar sozinha. O agendamento aparece na campanha com atendente \"IA\". Vale só se a conexão usada no disparo estiver com a IA ligada — disparando por um número sem IA, as respostas vão para a equipe." },
                    { title: "Função da IA", description: "Com a IA ligada, escolha entre Agendamento (a IA conduz o contato até marcar um horário) e Qualificação (a IA sonda o interesse e prepara o contato para a equipe fechar)." },
                    { title: "IA desligada", description: "Quem responde entra na fila Atendimento Humano, como uma conversa pendente normal para a equipe atender. A campanha nunca desliga o interruptor de IA do contato: o bloqueio vale só para aquele atendimento, pela fila." },
                    { title: "Enquanto a campanha vale", description: "As instruções da campanha valem até a data de validade. Depois disso a IA volta ao comportamento padrão da clínica." },
                ]} />
                <Callout type="dica">
                    Campanha fora do horário comercial? Deixe a IA ligada: ela responde na hora, quando o interesse da pessoa está
                    no pico — esperar até o dia seguinte derruba a conversão.
                </Callout>
            </TopicSection>

            {/* 10. FAQ */}
            <TopicSection id="faq" index={10} icon={HelpCircle} title="Perguntas frequentes">
                <Accordion type="single" collapsible className="rounded-xl border px-4">
                    {[
                        {
                            q: "Por que algumas mensagens foram rejeitadas?",
                            a: "Os motivos mais comuns: número não tem WhatsApp, limite diário da Meta estourado (veja o painel Qualidade Meta) ou o filtro de spam da Meta segurou o envio — acontece quando muitos destinatários bloqueiam/denunciam. Melhore a qualidade enviando para públicos menores e mais engajados.",
                        },
                        {
                            q: "Por que fulano não recebeu a campanha?",
                            a: "Veja a coluna Status na tabela de contatos: \"Atendimento Em Aberto\" = estava conversando com a equipe na hora (a campanha não interrompe atendimentos); \"Inválido\" = telefone em formato errado; \"Ignorado\" = a campanha encerrou antes da vez dele; \"Rejeitada\" = o WhatsApp recusou.",
                        },
                        {
                            q: "Filtrei pela etiqueta da campanha e vieram menos pessoas do que a audiência. Por quê?",
                            a: "A etiqueta fica só com quem realmente recebeu a mensagem. Todo mundo é etiquetado 1 hora antes do disparo, mas quem acabou como \"Atendimento Em Aberto\", \"Rejeitada\", \"Inválido\" ou \"Ignorado\" perde a etiqueta automaticamente — inclusive quando o WhatsApp aceita o envio e recusa depois. Para ver a audiência completa, use a tabela de contatos da campanha, não o filtro de etiqueta.",
                        },
                        {
                            q: "Qual a diferença entre \"Resolvido\" e \"Removido\"?",
                            a: "Resolvido = a pessoa ainda está na campanha e o atendimento dela foi encerrado (se voltar a falar, sai desse número sozinha). Removido = ela saiu da campanha, porque entrou em outra campanha do mesmo número ou porque a campanha encerrou — o resultado dela ficou congelado e não muda mais.",
                        },
                        {
                            q: "Encerrei a conversa e o cliente respondeu depois. A campanha atualiza?",
                            a: "Sim. Enquanto a pessoa tem a etiqueta da campanha, o relatório é ao vivo: ela sai de Resolvido e volta para Pendente, exatamente como no Inbox. O que já está marcado como \"Agendado\" ou \"Respondida\" nunca é perdido.",
                        },
                        {
                            q: "Pendente + Aberto + Resolvido + Removido não bate com Enviadas. Por quê?",
                            a: "Porque esses 4 números somam as Respondidas, não as Enviadas. Eles contam apenas quem respondeu ao disparo. Para fechar com Enviadas, some Respondidas + Sem Resposta.",
                        },
                        {
                            q: "O que exatamente entra em \"Em Atendimento\"?",
                            a: "Quem respondeu ao disparo e tem alguém responsável pela conversa: ou ela está Aberta e atribuída a um atendente, ou está Pendente na fila Atendimento IA. Conversa aberta que ninguém assumiu e conversa pendente na fila humana ficam de fora — é justamente o público que precisa de atenção. Mensagem automática (confirmação de agendamento, lembrete, pesquisa de satisfação) não coloca ninguém em atendimento: com a IA desligada, só contam as conversas abertas com atendente.",
                        },
                        {
                            q: "O que significa \"Movido Para Outra Campanha\"?",
                            a: "Você disparou uma campanha mais nova para essa pessoa pelo mesmo número. Cada contato participa de 1 campanha ativa por vez, então a anterior fechou o registro dele naquele momento.",
                        },
                        {
                            q: "Agendou mas depois cancelou — por que ainda aparece \"Agendado\"?",
                            a: "O relatório da campanha é uma foto do que aconteceu durante a campanha: a pessoa agendou, então a campanha converteu. O cancelamento é gerenciado na Agenda, não muda o resultado histórico da campanha.",
                        },
                        {
                            q: "Posso enviar imagem, áudio ou vídeo?",
                            a: "No WhatsApp Oficial, o conteúdo é o do template aprovado (que pode ter imagem no cabeçalho, conforme criado em Templates). No não oficial, a campanha envia texto.",
                        },
                        {
                            q: "Quanto tempo demora para enviar tudo?",
                            a: "Há ~30 segundos entre cada mensagem para proteger seu número. Estime: 100 contatos ≈ 1 hora, 500 contatos ≈ 4-5 horas. Agende o início cedo se o público for grande.",
                        },
                        {
                            q: "Editei a campanha — os contatos vão receber de novo?",
                            a: "Não. Quem já recebeu não recebe outra vez: a edição só afeta quem ainda está pendente.",
                        },
                        {
                            q: "Por que preciso agendar com 1 hora de antecedência?",
                            a: "É o tempo mínimo para o sistema preparar o disparo com segurança (validar público, template e avisos de conflito entre campanhas).",
                        },
                        {
                            q: "O que é a sub-aba Monitoramento no Dashboard → Campanhas?",
                            a: "É o histórico do Monitoramento de Grupos: quando você monitora um termo dentro de um grupo de WhatsApp (inbox → conversa do grupo → menu lateral → Monitoramento), cada participante que escreve o termo vira um lead — recebe a tag 'Monitoramento - <grupo> - <data>', a mensagem de abordagem no privado e entra na fila da IA ou do humano. A sub-aba mostra um container por grupo monitorado (com o nome da tag) com todos os leads capturados e seus desfechos, no mesmo formato da tabela de campanhas. Monitoramentos não aparecem na página /campanhas nem na lista comum de campanhas.",
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
