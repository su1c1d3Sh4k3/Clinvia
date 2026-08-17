import { useNavigate } from "react-router-dom";
import {
    LayoutDashboard, Headphones, Users, ShoppingCart, CalendarDays, Megaphone,
    Smile, HelpCircle, ExternalLink, Bell,
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
    { id: "satisfacao", label: "Aba Satisfação" },
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
                            A visão de comando da clínica: 6 abas de métricas para saber, em segundos, onde agir hoje.
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
                subtitle="6 abas, cada uma responde uma pergunta">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                        { icon: Headphones, t: "Monitoramento", d: "O que está acontecendo AGORA nas conversas?" },
                        { icon: Users, t: "CRM", d: "Como está o funil de clientes hoje (e nos dias passados)?" },
                        { icon: ShoppingCart, t: "Vendas", d: "Quanto entrou, o que está pendente, quem vendeu?" },
                        { icon: CalendarDays, t: "Agendamentos", d: "Ocupação dos profissionais e mensagens automáticas." },
                        { icon: Megaphone, t: "Campanhas", d: "Resultado dos disparos em massa, contato a contato." },
                        { icon: Smile, t: "Satisfação", d: "Notas NPS, avaliações recentes e tempo de atendimento." },
                    ].map((c) => (
                        <div key={c.t} className="rounded-xl border p-3.5">
                            <p className="flex items-center gap-1.5 text-sm font-semibold"><c.icon className="h-4 w-4 text-primary" />{c.t}</p>
                            <p className="mt-0.5 text-sm text-muted-foreground">{c.d}</p>
                        </div>
                    ))}
                </div>
                <Callout type="dica" title="Quem vê o quê">
                    Admins veem tudo. Supervisores veem tudo (Vendas depende da permissão financeira). Atendentes veem
                    apenas a aba CRM — e, se tiverem escopo de visão (conexões/filas liberadas na página Equipe), os números
                    refletem só o que está no escopo deles. No topo, o <strong>quadro de avisos</strong>{" "}
                    <Bell className="inline h-3.5 w-3.5" /> traz notificações do sistema para toda a equipe.
                </Callout>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/dashboard?tour=dashboard-abas")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
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
                    { title: "Quadro Finalizados", description: "Abaixo de Follow Up fica o quadro Finalizados: atendimentos que chegaram a uma etapa de conclusão (Ganho, Perdido, Sem Contato, Sem Interesse ou Finalizado) dentro do período e foram encerrados por alguém da equipe. Cada card traz um selo com a etapa e a cor dela." },
                    { title: "Só encerramentos humanos", description: "Resoluções automáticas — encerramento de campanhas, rotinas do sistema — não aparecem no quadro nem contam para os atendentes. Quem encerra um atendimento leva a atribuição dele, mesmo que a conversa não estivesse atribuída antes." },
                    { title: "Detalhamento por atendente", description: "Cada atendente mostra abertos, pendentes e resolvidos no período selecionado, além do status online/offline. Resolvidos = conversas que aquele usuário encerrou." },
                ]} />
                <Callout type="pratica" title="Rotina de 3 minutos">
                    Duas vezes ao dia, varra os quadros procurando cards onde o <strong>cliente falou por último</strong> —
                    são vendas esfriando. O indicador de janela 24h diz quem precisa de resposta urgente no número oficial.
                </Callout>
                <Callout type="atencao" title="Filtrou 'Hoje' e sumiu conversa?">
                    O período olha a data em que a conversa <strong>começou</strong>. Uma conversa aberta ontem que segue
                    em andamento aparece no filtro Ontem (ou 7 dias) — amplie o período para vê-la.
                </Callout>
            </TopicSection>

            {/* 3 */}
            <TopicSection id="crm-metricas" index={3} icon={Users} title="Aba CRM"
                subtitle="O funil em números — hoje ao vivo, passado congelado">
                <StepByStep steps={[
                    { title: "Hoje = ao vivo", description: "Com a data de hoje selecionada, os contadores por etapa refletem o quadro do CRM em tempo real." },
                    { title: "Passado = fotografia", description: "Todo dia às 23:59 o sistema tira uma 'foto' do funil. Ao navegar para datas passadas, você vê exatamente como o funil estava naquele dia." },
                    { title: "Compare períodos", description: "Use a navegação de datas para responder: quantos clientes estavam em 'Agendado' na semana passada vs. hoje? O funil está enchendo ou esvaziando?" },
                ]} />
                <Callout type="atencao" title="Números de hoje mudam o dia todo">
                    É normal os contadores de hoje oscilarem — cards entram e saem das etapas em tempo real. A comparação
                    justa é sempre entre fotografias de fim de dia.
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
                subtitle="Ocupação, rankings e as mensagens automáticas">
                <StepByStep steps={[
                    { title: "Ocupação por profissional", description: "Percentual da agenda preenchida — enxergue quem está lotado e quem tem horário sobrando antes de aceitar mais encaixes." },
                    { title: "Média NPS por profissional", description: "A nota da pesquisa de satisfação pertence ao PROFISSIONAL do atendimento — o gráfico compara as médias." },
                    { title: "Mensagens Automáticas", description: "Painel com Agendadas/Enviadas/Entregues/Rejeitadas por dia para confirmação, lembrete e pesquisa (número oficial). Divergência num dia fechado ganha alerta." },
                ]} />
                <Callout type="dica" title='"O cliente recebeu a confirmação?"'>
                    É aqui que você confere. Se um dia mostra Rejeitadas, verifique o template em Conexões e a qualidade do
                    número no painel Meta (aba Campanhas).
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
            <TopicSection id="satisfacao" index={7} icon={Smile} title="Aba Satisfação"
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

            {/* 8 */}
            <TopicSection id="faq" index={8} icon={HelpCircle} title="Perguntas frequentes">
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
