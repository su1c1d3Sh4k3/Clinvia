import { useNavigate } from "react-router-dom";
import {
    LayoutDashboard, Headphones, Users, ShoppingCart, CalendarDays, Megaphone,
    RefreshCcw, Smile, HelpCircle, ExternalLink, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Callout, LearnChip, StepByStep, SubNav, TopicSection } from "./blocks";
import { MiniMonitorSimulator } from "./simulators-dashboard";

// ---------------------------------------------------------------------------
// Manual do Dashboard
// ---------------------------------------------------------------------------

const TOPICS = [
    { id: "o-que-e", label: "O que é" },
    { id: "monitoramento", label: "Monitoramento" },
    { id: "crm-metricas", label: "Aba CRM" },
    { id: "vendas", label: "Aba Vendas" },
    { id: "agendamentos", label: "Aba Agendamentos" },
    { id: "campanhas-dash", label: "Aba Campanhas" },
    { id: "recorrencia-dash", label: "Aba Recorrência" },
    { id: "satisfacao", label: "Aba Satisfação" },
    { id: "minha-conta", label: "Minha Conta" },
    { id: "faq", label: "FAQ" },
];

export function DashboardGuide() {
    const navigate = useNavigate();

    return (
        <div className="space-y-8">
            {/* Hero */}
            <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <LayoutDashboard className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Manual do Dashboard</h1>
                        <p className="text-sm text-muted-foreground">
                            A visão de comando da clínica: 8 abas de métricas para saber, em segundos, onde agir hoje.
                        </p>
                    </div>
                </div>
                <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        O que você vai aprender
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <LearnChip topicId="monitoramento">Ler o Monitoramento ao vivo</LearnChip>
                        <LearnChip topicId="crm-metricas">Acompanhar o funil dia a dia</LearnChip>
                        <LearnChip topicId="satisfacao">De onde vem a nota NPS</LearnChip>
                        <LearnChip topicId="vendas">Quem vê o quê (papéis)</LearnChip>
                    </div>
                </div>
            </div>

            <SubNav topics={TOPICS} />

            {/* 1 */}
            <TopicSection id="o-que-e" index={1} icon={LayoutDashboard} title="O que é o Dashboard?"
                subtitle="8 abas, cada uma responde uma pergunta">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                        { icon: Wallet, t: "Minha Conta", d: "Visão geral da conta: tokens da IA em R$, conexões, IA e colaboradores (só admin)." },
                        { icon: Headphones, t: "Monitoramento", d: "O que está acontecendo AGORA nas conversas?" },
                        { icon: Users, t: "CRM", d: "Como está o funil de clientes hoje (e nos dias passados)?" },
                        { icon: ShoppingCart, t: "Vendas", d: "Quanto entrou, o que está pendente, quem vendeu?" },
                        { icon: CalendarDays, t: "Agendamentos", d: "Ocupação dos profissionais e mensagens automáticas." },
                        { icon: Megaphone, t: "Campanhas", d: "Resultado dos disparos em massa, contato a contato." },
                        { icon: RefreshCcw, t: "Recorrência", d: "Abordagens de recompra mês a mês: fases, contatos e conversão." },
                        { icon: Smile, t: "Satisfação", d: "Notas NPS, avaliações recentes e tempo de atendimento." },
                    ].map((c) => (
                        <div key={c.t} className="rounded-xl border p-3.5">
                            <p className="flex items-center gap-1.5 text-sm font-semibold"><c.icon className="h-4 w-4 text-primary" />{c.t}</p>
                            <p className="mt-0.5 text-sm text-muted-foreground">{c.d}</p>
                        </div>
                    ))}
                </div>
                <Callout type="dica" title="Quem vê o quê">
                    Admins veem todas as abas, sempre. Para Supervisores e Atendentes, cada aba tem uma chave própria em{" "}
                    <strong>Equipe &gt; Permissões &gt; Abas do Dashboard</strong>. Por padrão o Supervisor vê tudo menos
                    Minha Conta, e o Atendente vê só o CRM — mas você pode liberar qualquer aba para ele. Se o membro tiver
                    escopo de visão (conexões/filas/tags liberadas na página Equipe), os números refletem só o escopo dele.
                    Sem nenhuma aba liberada, a página Dashboard some do menu.
                </Callout>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/dashboard?tour=dashboard-abas")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate("/equipe?tab=permissoes")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Liberar abas por permissão
                    </Button>
                </div>
            </TopicSection>

            {/* 2 */}
            <TopicSection id="monitoramento" index={2} icon={Headphones} title="Aba Monitoramento"
                subtitle="A sala de controle ao vivo — quadros por etapa do CRM">
                <p className="text-sm text-muted-foreground">
                    Mostra as <strong className="text-foreground">conversas abertas e pendentes agrupadas pela etapa do
                    CRM</strong>, com quem está online na equipe. Tudo obedece ao{" "}
                    <strong className="text-foreground">filtro de período</strong> (Hoje por padrão — troque para Ontem,
                    7 dias, mês, ano ou um intervalo personalizado): os quadros mostram as conversas iniciadas no período
                    e os contadores dos atendentes contam só esse recorte. O segredo é saber ler cada card:
                </p>
                <MiniMonitorSimulator />
                <StepByStep steps={[
                    { title: "Os quadros abrem fechados", description: "Cada fila é uma faixa com o nome da etapa e, entre parênteses, quantas conversas ela tem no período. Todas começam recolhidas para você bater o olho no panorama inteiro sem rolagem — clique no título da fila que quer investigar para expandir os cards." },
                    { title: "Quadro Finalizados", description: "Abaixo de Follow Up fica o quadro Finalizados: atendimentos que chegaram a uma etapa de conclusão (Ganho, Perdido, Sem Contato, Sem Interesse ou Finalizado) dentro do período e foram encerrados por alguém da equipe. Cada card traz um selo com a etapa e a cor dela." },
                    { title: "Só encerramentos humanos", description: "Resoluções automáticas — encerramento de campanhas, rotinas do sistema — não aparecem no quadro nem contam para os atendentes. Quem encerra um atendimento leva a atribuição dele, mesmo que a conversa não estivesse atribuída antes." },
                    { title: "Detalhamento por atendente", description: "Cada atendente mostra abertos, pendentes e resolvidos no período selecionado, além do status online/offline. Resolvidos = conversas que aquele usuário encerrou." },
                ]} />
                <Callout type="dica" title="O contorno do card responde de longe: já respondi?">
                    <strong>Laranja</strong> = o cliente falou por último e ninguém respondeu.{" "}
                    <strong>Verde</strong> = a última mensagem saiu da equipe ou da IA, a bola está com o cliente.
                    Nos quadros Finalizados o contorno é a cor da etapa de conclusão. E a{" "}
                    <strong>contagem da janela de 24h só aparece nos números oficiais</strong> (WhatsApp da Meta e
                    Instagram) — na API não oficial esse prazo não existe, então o card não mostra contagem alguma.
                </Callout>
                <Callout type="pratica" title="Rotina de 3 minutos">
                    Duas vezes ao dia, varra os quadros procurando cards onde o <strong>cliente falou por último</strong> —
                    são vendas esfriando. O indicador de janela 24h diz quem precisa de resposta urgente no número oficial.
                </Callout>
                <Callout type="atencao" title="Filtrou 'Hoje' e sumiu conversa?">
                    O período olha a data em que a conversa <strong>começou</strong>. Uma conversa aberta ontem que segue
                    em andamento aparece no filtro Ontem (ou 7 dias) — amplie o período para vê-la.
                </Callout>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/dashboard?tab=monitoramento&tour=monitoramento-tour")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
                    </Button>
                </div>
            </TopicSection>

            {/* 3 */}
            <TopicSection id="crm-metricas" index={3} icon={Users} title="Aba CRM"
                subtitle="Quanto o funil andou no período — não quanto está parado nele">
                <p className="text-sm text-muted-foreground">
                    Todas as seções da aba contam a <strong className="text-foreground">movimentação do período</strong>:
                    negociações que <strong className="text-foreground">entraram</strong> naquela etapa dentro do filtro
                    escolhido. Não é o total parado na etapa — é o que se mexeu.
                </p>
                <StepByStep steps={[
                    { title: "O filtro é o mesmo em todas as seções", description: "Hoje, Últimos 7 dias, Últimos 30 dias ou Personalizado (você escolhe as duas datas). Cada seção tem o seu próprio seletor, então dá para comparar: Resultados em 30 dias e Negociações em 7, lado a lado." },
                    { title: "Resultados = os 5 desfechos", description: "Ganho, Perdido, Sem Contato, Sem Interesse e Finalizado, com a quantidade e a soma dos valores de cada um no período. Todo desfecho possível de uma negociação está aqui." },
                    { title: "Clique no card para ver quem são", description: "Cada card de Resultados abre a lista das negociações que caíram naquele desfecho no período. Cada linha traz o nome do cliente, quando entrou na etapa, início e fim do ticket, quem atendeu, quantas mensagens foram trocadas e se havia negociação vinculada (valor e serviços)." },
                    { title: "Clique na negociação para abrir o ticket", description: "O clique leva direto para a conversa que estava em andamento quando o card mudou de etapa — mesmo já encerrada, o histórico completo abre no Inbox para você analisar o que aconteceu." },
                    { title: "Monitoramento CRM", description: "O gráfico mostra quantas negociações entraram em cada etapa em andamento no período — dá para ver por onde o funil está passando." },
                    { title: "Filas e Negociações", description: "Um card por etapa com o total do período e o desdobramento por situação da conversa: Aberto, Pendente e Concluído. As três linhas sempre somam o total." },
                    { title: "Filtre por conexão", description: "Com mais de um número (ou conta do Instagram), aparece o seletor de conexão: cada uma tem o seu próprio funil. 'Todas as conexões' soma tudo — e agora isso vale para qualquer período, inclusive datas passadas." },
                ]} />
                <Callout type="atencao" title="Uma negociação conta uma vez só, na última etapa">
                    O sistema guarda a etapa <strong>atual</strong> de cada negociação e a data em que ela chegou lá. Se um
                    cliente passou por Qualificado e depois foi para Ganho no mesmo dia, ele aparece só em Ganho. Por isso
                    os números não podem ser somados como "passagens pelo funil" — cada negociação está em um card só.
                </Callout>
                <Callout type="atencao" title="Negociação sem ticket na lista">
                    Se a linha aparece com o selo <strong>Sem ticket</strong>, é porque não existe conversa daquele
                    contato naquela conexão — normalmente negociação criada na mão pelo funil ou importada. Os demais
                    dados continuam valendo; só não há chat para abrir.
                </Callout>
                <Callout type="dica" title="Números de hoje mudam o dia todo">
                    É normal o filtro "Hoje" oscilar: cada card que muda de etapa entra na conta na hora. Para comparar
                    semanas, use 7 ou 30 dias, que só mudam quando alguém realmente movimenta o funil.
                </Callout>
            </TopicSection>

            {/* 4 */}
            <TopicSection id="vendas" index={4} icon={ShoppingCart} title="Aba Vendas"
                subtitle="Faturamento, pendências e conversão em agendamentos">
                <p className="text-sm text-muted-foreground">
                    Cards de faturamento por período, ranking de serviços e a tabela de vendas com situação de pagamento.
                    Destaques:
                </p>
                <StepByStep steps={[
                    { title: "% Agendamentos", description: "Quantas vendas já têm horário marcado. Venda sem agendamento é dinheiro parado — a seção 'Vendas ↔ Agendamentos' lista exatamente quem falta marcar." },
                    { title: "Pagamentos pendentes", description: "Toda venda nasce pendente (regra do agendamento automático). Acompanhe aqui o que precisa ser acertado no caixa." },
                    { title: "Acesso restrito", description: "Aba visível para admin e para supervisores com acesso financeiro liberado em Equipe > Permissões." },
                ]} />
            </TopicSection>

            {/* 5 */}
            <TopicSection id="agendamentos" index={5} icon={CalendarDays} title="Aba Agendamentos"
                subtitle="Ocupação, rankings, mensagens automáticas e quem agendou">
                <StepByStep steps={[
                    { title: "Ocupação por profissional", description: "Percentual da agenda preenchida — enxergue quem está lotado e quem tem horário sobrando antes de aceitar mais encaixes." },
                    { title: "Média NPS por profissional", description: "A nota da pesquisa de satisfação pertence ao PROFISSIONAL do atendimento — o gráfico compara as médias." },
                    { title: "Mensagens Automáticas", description: "Painel com Agendadas/Enviadas/Entregues/Rejeitadas por dia para confirmação, lembrete e pesquisa (número oficial). Divergência num dia fechado ganha alerta." },
                    { title: "Agendamentos por colaborador", description: "Logo abaixo das mensagens automáticas: uma aba por pessoa (mais a aba IA) listando cliente, telefone, serviço, profissional, status e valor de cada agendamento que ela marcou." },
                ]} />
                <Callout type="dica" title='"O cliente recebeu a confirmação?"'>
                    É aqui que você confere. Se um dia mostra Rejeitadas, verifique o template em Conexões e a qualidade do
                    número no painel Meta (aba Campanhas).
                </Callout>

                <p className="text-sm font-semibold">De quem é o agendamento?</p>
                <div className="grid gap-2 sm:grid-cols-3">
                    {[
                        { t: "Marcado na Agenda", d: "Fica com o colaborador que estava logado ao criar o agendamento." },
                        { t: "Importado por planilha", d: "Fica com quem subiu o arquivo — a planilha é fonte externa, então a autoria é de quem importou." },
                        { t: "API ou link público", d: "Vai para a aba IA. Tudo que o cliente ou o robô marcam sozinhos conta como IA, nunca para um atendente." },
                    ].map((r) => (
                        <div key={r.t} className="rounded-lg border bg-muted/30 p-3">
                            <p className="text-sm font-medium">{r.t}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{r.d}</p>
                        </div>
                    ))}
                </div>
                <Callout type="atencao" title="O filtro conta pela data em que o agendamento foi FEITO">
                    Hoje / 7 dias / 30 dias / personalizado olham o momento em que a marcação foi registrada, não a data
                    da consulta. Um atendimento de outubro marcado hoje aparece no filtro "Hoje".
                    <br /><br />
                    Agendamentos criados antes deste painel existir não têm registro de autoria e por isso{" "}
                    <strong className="text-foreground">não aparecem aqui</strong> — a contagem vale de agora em diante.
                </Callout>
                <Callout type="dica" title="Exportar para Excel">
                    O botão <strong>Exportar</strong> gera uma planilha .xlsx do período filtrado com{" "}
                    <strong>uma aba para cada colaborador</strong> (mais a aba IA), na mesma ordem das abas da tela.
                </Callout>
            </TopicSection>

            {/* 6 */}
            <TopicSection id="campanhas-dash" index={6} icon={Megaphone} title="Aba Campanhas"
                subtitle="O resultado dos disparos, contato a contato">
                <p className="text-sm text-muted-foreground">
                    Os mesmos cards e tabela da página /campanhas, reunidos no dashboard: enviadas, entregues, rejeitadas,
                    respondidas, agendamentos gerados e etapa de CRM de cada contato — além do{" "}
                    <strong className="text-foreground">painel de Qualidade Meta</strong> (selo do número, limite diário e
                    uso nas últimas 24h).
                </p>
                <Callout type="pratica" title="Métrica que importa">
                    Entregue é meio caminho. Olhe <strong>Respondidas</strong> e <strong>Agendamentos</strong> — é a
                    conversão real da campanha. Clique no nome do contato para abrir a conversa e entender o desfecho.
                </Callout>
            </TopicSection>

            {/* 7 */}
            <TopicSection id="recorrencia-dash" index={7} icon={RefreshCcw} title="Aba Recorrência"
                subtitle="As abordagens de recompra, mês a mês">
                <p className="text-sm text-muted-foreground">
                    A aba tem o filtro de período e duas sub-abas:{" "}
                    <strong className="text-foreground">Recorrência</strong> (as abordagens mês a mês) e{" "}
                    <strong className="text-foreground">Campanhas</strong> (os disparos automáticos por dia).
                </p>
                <StepByStep steps={[
                    { title: "Sub-aba Recorrência — cards de status", description: "Prévia, Vencimento e Pós (abordagens realizadas de cada fase), Agendados e Sem Resposta (já abordados que não responderam nem agendaram)." },
                    { title: "Card do mês", description: "As bolinhas indicam as fases concluídas; a barra mostra o avanço da fase atual. A % 'agendaram' é a conversão do mês. Clique para expandir a tabela contato a contato — a mesma da página Recorrência." },
                    { title: "Sub-aba Campanhas — cards de resumo", description: "Total de contatos, abordagens realizadas, clientes em contato, quantos agendaram, taxa de conversão e custo estimado das mensagens." },
                ]} />
                <p className="text-sm text-muted-foreground">
                    Na sub-aba Campanhas ficam os containers de <strong className="text-foreground">Campanhas de Recorrência</strong>:
                    um por dia (<em>Recorrência - dd/mm/aaaa</em>) agrupando as campanhas geradas
                    automaticamente naquele dia — uma por serviço e por número de mensagem. Expanda o dia para ver
                    cada campanha com envios, entregas, respostas e a tabela de contatos, igual à aba Campanhas.
                    Se um template da Meta ainda não foi aprovado, a campanha aparece com um alerta vermelho{" "}
                    <em>"Campanha interrompida devido a não aprovação do template da Meta"</em> — os contatos entram
                    na campanha do dia em que o template for aprovado.
                </p>
                <Callout type="dica" title="Onde edito as recorrências?">
                    Aqui é o painel de acompanhamento. O cadastro e a atualização das abordagens continuam na página{" "}
                    <strong>Recorrência</strong> do menu lateral — e as mensagens/descontos de cada abordagem, na
                    aba Recorrência de cada aplicação em <strong>Serviços</strong>.
                </Callout>
            </TopicSection>

            {/* 8 */}
            <TopicSection id="satisfacao" index={8} icon={Smile} title="Aba Satisfação"
                subtitle="NPS, últimas avaliações e desempenho do atendimento">
                <StepByStep steps={[
                    { title: "De onde vêm as notas", description: "Da pesquisa automática enviada 24h após o atendimento (nota 1 a 5 por botões). A nota é atribuída ao profissional do agendamento." },
                    { title: "Últimas avaliações", description: "Lista com cliente, nota, serviço aplicado e profissional — ótima para agir rápido numa nota baixa." },
                    { title: "Tempos de atendimento", description: "Duração média dos atendimentos e tempo médio de resposta da equipe, por período navegável (dia/semana/mês/ano)." },
                ]} />
                <Callout type="atencao" title="NPS ≠ Sentimento">
                    NPS é a nota que o CLIENTE deu (0 a 5). O "sentimento" que aparece em algumas telas é uma leitura da IA
                    sobre o tom da conversa (0 a 10). São medidas diferentes — não compare uma com a outra.
                </Callout>
            </TopicSection>

            {/* 9 */}
            <TopicSection id="minha-conta" index={9} icon={Wallet} title="Aba Minha Conta"
                subtitle="A visão geral da conta — só o admin vê por padrão">
                <p className="text-sm text-muted-foreground">
                    Quatro containers que respondem "como está a minha conta?": consumo da IA, conexões,
                    status da IA e desempenho dos colaboradores.
                </p>
                <StepByStep steps={[
                    { title: "Relatório do Consumo", description: "O card grande à esquerda mostra o Custo Total da Conta em R$ (tokens da IA + envios Meta, com os recortes do mês e do dia). Na linha de cima, os 3 cards de tokens da IA (Total, Mensal e Diário — custo em R$ em destaque e a quantidade de tokens abaixo, somando a IA das conversas e a do sistema; a conversão usa a cotação real do dólar). Na linha de baixo, os 3 cards de envios Meta (Custo Total, Mensal e Diário — estimativa pelo nº de mensagens × preço por categoria do template: marketing, utility ou autenticação). Abaixo, os gráficos de consumo mensal (filtro de ano) e diário (7, 15 ou 30 dias) comparam os custos em R$: uma série de Custo IA e outra de Custo Meta." },
                    { title: "Conexões", description: "Cada instância conectada com o tipo (WhatsApp Oficial, Não Oficial ou Instagram), o status da conexão e, nos números oficiais, o selo de qualidade da Meta." },
                    { title: "IA", description: "Nome do agente, empresa, se a IA está ligada ou desligada e em quais instâncias ela está ativa." },
                    { title: "Colaboradores", description: "Quadro de Atendentes (abertos/pendentes/resolvidos + tempo de resposta, tempo de atendimento, sentimento e nº de atendimentos) e Ranking de Profissionais com o gauge circular de ocupação da agenda ao lado do nome. O filtro de período (Hoje, 7 dias, Mês, Ano, Total) vale para o container inteiro." },
                ]} />
                <Callout type="atencao" title="Ocupação no período Total">
                    No filtro Total, o gauge de ocupação considera os últimos 12 meses (senão anos sem agenda zerariam a
                    taxa); procedimentos e faturamento seguem o histórico completo.
                </Callout>
                <Callout type="dica" title="O mesmo resumo chega por e-mail todo dia 1º">
                    Na virada do mês, o administrador recebe no e-mail da conta o consumo do mês anterior — tokens de IA,
                    disparos de campanha e automáticos, templates da Meta e o custo estimado em reais, pelo mesmo
                    critério desta aba. Mês sem nenhum consumo não gera e-mail.
                </Callout>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/dashboard?tab=minha-conta&tour=dashboard-abas")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
                    </Button>
                </div>
            </TopicSection>

            {/* 10 */}
            <TopicSection id="faq" index={10} icon={HelpCircle} title="Perguntas frequentes">
                <Accordion type="single" collapsible className="rounded-xl border px-4">
                    {[
                        {
                            q: "Não vejo a aba Vendas. Por quê?",
                            a: "Atendentes veem apenas a aba CRM; supervisores só veem Vendas se o acesso financeiro estiver liberado em Equipe > Permissões. Peça a um admin para ajustar.",
                        },
                        {
                            q: "Os números do CRM de ontem mudaram?",
                            a: "Não — dias passados são fotografias congeladas tiradas às 23:59. O que muda o dia inteiro são os números de HOJE, que são ao vivo.",
                        },
                        {
                            q: "Um contato aparece 'online' mas não está trabalhando.",
                            a: "O status online vem da atividade no sistema nos últimos 2 minutos (aba aberta conta). Se a pessoa fechou tudo, em instantes aparece offline.",
                        },
                        {
                            q: "O painel de Mensagens Automáticas mostra Rejeitadas. E agora?",
                            a: "Verifique 3 coisas: o template está aprovado e ligado (Conexões > Templates)? A qualidade/limite do número está ok (painel Meta Quality)? O telefone do cliente é válido? Rejeições pontuais acontecem; em massa, é sinal de template ou número com problema.",
                        },
                        {
                            q: "Por que a campanha mostra menos respostas do que eu vi no inbox?",
                            a: "A métrica considera a resposta do contato dentro do contexto da campanha (a partir do envio). Conversas antigas ou de outro número não contam. Clique no contato na tabela para ver a conversa exata.",
                        },
                        {
                            q: "Qual aba devo olhar primeiro de manhã?",
                            a: "Monitoramento: cards onde o cliente falou por último são a prioridade do dia. Depois CRM para ver o funil e, se você cuida do caixa, Vendas para as pendências.",
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
