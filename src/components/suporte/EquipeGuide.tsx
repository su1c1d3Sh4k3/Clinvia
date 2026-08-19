import { useNavigate } from "react-router-dom";
import {
    ShieldCheck, UserPlus, SlidersHorizontal, Wifi, HelpCircle, ExternalLink, Users, ScanEye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Callout, LearnChip, StepByStep, SubNav, TopicSection } from "./blocks";
import { RoleMatrixExplorer } from "./simulators-equipe";

// ---------------------------------------------------------------------------
// Manual da página Equipe (/equipe — admin only)
// ---------------------------------------------------------------------------

const TOPICS = [
    { id: "o-que-e", label: "O que é" },
    { id: "papeis", label: "Os 3 papéis" },
    { id: "convidando", label: "Convidando" },
    { id: "escopo", label: "Escopo de visão" },
    { id: "permissoes", label: "Permissões finas" },
    { id: "online", label: "Quem está online" },
    { id: "faq", label: "FAQ" },
];

export function EquipeGuide() {
    const navigate = useNavigate();

    return (
        <div className="space-y-8">
            {/* Hero */}
            <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <ShieldCheck className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Manual de Equipe</h1>
                        <p className="text-sm text-muted-foreground">
                            Convide sua equipe, escolha papéis e ajuste fino do que cada um pode fazer. Supervisores com a permissão "Membros da Equipe" também acessam a aba Equipes; a aba Permissões é exclusiva do admin.
                        </p>
                    </div>
                </div>
                <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        O que você vai aprender
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <LearnChip topicId="papeis">Admin, Supervisor e Agente</LearnChip>
                        <LearnChip topicId="convidando">Adicionar um membro</LearnChip>
                        <LearnChip topicId="escopo">Limitar o que o atendente enxerga</LearnChip>
                        <LearnChip topicId="permissoes">Liberar/bloquear ações por módulo</LearnChip>
                    </div>
                </div>
            </div>

            <SubNav topics={TOPICS} />

            {/* 1 */}
            <TopicSection id="o-que-e" index={1} icon={Users} title="O que é a página Equipe?"
                subtitle="Uma conta, várias pessoas — cada uma no seu papel">
                <p className="text-sm text-muted-foreground">
                    Todos da clínica trabalham na <strong className="text-foreground">mesma conta</strong>: veem os mesmos
                    clientes, conversas e agenda. O que muda é o <strong className="text-foreground">papel</strong> de cada
                    um (o que pode ver) e as <strong className="text-foreground">permissões finas</strong> (o que pode
                    criar, editar e apagar). Duas abas: <strong className="text-foreground">Equipes</strong> (membros) e{" "}
                    <strong className="text-foreground">Permissões</strong> (ajuste fino).
                </p>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/equipe?tour=equipe-tour")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
                    </Button>
                </div>
            </TopicSection>

            {/* 2 */}
            <TopicSection id="papeis" index={2} icon={ShieldCheck} title="Os 3 papéis"
                subtitle="Admin, Supervisor e Agente — clique e compare">
                <RoleMatrixExplorer />
                <Callout type="dica" title="Regra prática">
                    Dono/gestor geral = Admin. Coordenadora que acompanha números e configura campanhas = Supervisor.
                    Recepção/atendimento = Agente. Na dúvida, comece restrito — subir papel depois é um clique.
                </Callout>
            </TopicSection>

            {/* 3 */}
            <TopicSection id="convidando" index={3} icon={UserPlus} title="Convidando membros"
                subtitle="Da recepção ao sistema em 2 minutos">
                <StepByStep steps={[
                    { title: "Adicionar membro", description: "Na aba Equipes, informe nome, e-mail e papel. A pessoa recebe as credenciais e já entra na conta da clínica." },
                    { title: "Escolha o papel com calma", description: "O papel define o alcance (veja o tópico anterior). Supervisor com acesso financeiro vê a aba Vendas; sem, não." },
                    { title: "Se for Agente, defina o escopo", description: <>Aparecem dois campos extras: <strong>Instâncias liberadas</strong> e <strong>Filas atribuídas</strong>. Marque o que ele pode ver — ou deixe "Todas" para não restringir (próximo tópico).</>, },
                    { title: "Desativar quando sair", description: "Funcionário saiu? Remova/desative o membro — o histórico de atendimentos dele permanece registrado." },
                ]} />
                <Callout type="atencao" title="Nunca compartilhe um login">
                    Cada pessoa com seu acesso: é isso que permite saber quem atendeu cada conversa, medir tempos por
                    atendente e desligar acessos individualmente sem trocar senha de todo mundo.
                </Callout>
            </TopicSection>

            {/* 4 */}
            <TopicSection id="escopo" index={4} icon={ScanEye} title="Escopo de visão do Atendente"
                subtitle="Quais conexões e quais filas cada agente enxerga">
                <p className="text-sm text-muted-foreground">
                    Agentes podem ter a visão <strong className="text-foreground">limitada por dois filtros</strong>, definidos
                    ao criar ou editar o membro (e visíveis nas colunas da tabela de membros):
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border p-3.5">
                        <p className="text-sm font-semibold">Instâncias liberadas</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Quais conexões (números de WhatsApp / contas de Instagram) o agente pode ver. "Todas" = sem restrição.
                        </p>
                    </div>
                    <div className="rounded-xl border p-3.5">
                        <p className="text-sm font-semibold">Filas atribuídas</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Quais filas (setores) o agente pode ver. "Todas" = sem restrição.
                        </p>
                    </div>
                </div>
                <p className="text-sm text-muted-foreground">
                    Os dois filtros funcionam <strong className="text-foreground">juntos (E, não OU)</strong>: o agente só
                    enxerga a conversa se a conexão dela estiver liberada <strong className="text-foreground">e</strong> a fila
                    dela estiver atribuída. O escopo vale para o <strong className="text-foreground">Inbox, o CRM
                    (kanban e monitoramento) e os números do Dashboard</strong> — a página Clientes continua mostrando todos os
                    contatos da conta.
                </p>
                <Callout type="pratica" title="Exemplo: clínica com 2 números">
                    A recepcionista da unidade A recebe só a instância "Número Unidade A" e as filas Atendimento Humano e
                    Suporte. Pronto: ela não vê (nem é notificada sobre) conversas da unidade B ou do Financeiro — menos ruído,
                    mais foco.
                </Callout>
                <Callout type="atencao" title="O escopo também controla as transferências">
                    No inbox, o botão <strong>Transferir Atendimento</strong> só lista atendentes cujo escopo cobre a fila
                    escolhida e a conexão da conversa. Se um agente "sumiu" da lista de transferência, confira o escopo dele
                    aqui. Admins e supervisores nunca são filtrados.
                </Callout>
            </TopicSection>

            {/* 5 */}
            <TopicSection id="permissoes" index={5} icon={SlidersHorizontal} title="Permissões finas"
                subtitle="Criar / Editar / Apagar, módulo por módulo">
                <p className="text-sm text-muted-foreground">
                    Na aba <strong className="text-foreground">Permissões</strong>, você define para Supervisores e Agentes
                    o que cada nível pode <strong className="text-foreground">criar, editar e apagar</strong> em cada módulo
                    (contatos, agendamentos, profissionais, vendas, campanhas, automações, empresa, relatórios...). Os botões
                    correspondentes simplesmente somem da interface de quem não tem a permissão.
                </p>
                <Callout type="dica" title="Supervisor com acesso total">
                    Ligando todas as chaves de Supervisor, ele passa a ter acesso a tudo que o admin tem — inclusive cadastrar
                    membros da equipe (via "Membros da Equipe"), a aba Automações das Configurações, os dados da Empresa e os
                    Relatórios. A única exceção é a aba Permissões, que continua exclusiva do admin.
                </Callout>
                <Callout type="pratica" title="Configuração comum">
                    Agentes: criar contatos e agendamentos, sem apagar nada. Supervisores: tudo exceto apagar vendas.
                    Apagar é a permissão mais perigosa — dê a poucos.
                </Callout>
            </TopicSection>

            {/* 6 */}
            <TopicSection id="online" index={6} icon={Wifi} title="Quem está online"
                subtitle="O termômetro da operação em tempo real">
                <p className="text-sm text-muted-foreground">
                    O Dashboard (aba Monitoramento) mostra o <strong className="text-foreground">status online</strong> de
                    cada membro: quem está com o sistema aberto e ativo nos últimos 2 minutos aparece como disponível.
                    Junto com o atendente responsável de cada conversa, você enxerga a distribuição de carga da equipe.
                </p>
            </TopicSection>

            {/* 7 */}
            <TopicSection id="faq" index={7} icon={HelpCircle} title="Perguntas frequentes">
                <Accordion type="single" collapsible className="rounded-xl border px-4">
                    {[
                        {
                            q: "Um supervisor não vê a aba Vendas do Dashboard.",
                            a: "O acesso financeiro de supervisores é uma permissão à parte — libere na aba Permissões. Agentes nunca veem Vendas, independente de permissão.",
                        },
                        {
                            q: "O agente diz que 'não tem o botão' de apagar/editar.",
                            a: "É o esperado: sem a permissão fina, o botão nem aparece. Ajuste em Equipe > Permissões e peça para a pessoa recarregar a página.",
                        },
                        {
                            q: "Um agente não enxerga conversas/cards que o admin vê.",
                            a: "Primeira coisa a conferir: o escopo de visão dele (colunas Instâncias liberadas e Filas atribuídas na aba Equipes). Se a conversa está numa conexão ou fila fora do escopo, é o comportamento esperado. Escopo em 'Todas' e mesmo assim faltando dados? Confirme que o membro foi convidado pela página Equipe (e não criou conta avulsa própria); persistindo, acione o suporte Clinvia.",
                        },
                        {
                            q: "Como restrinjo um atendente a um único número ou setor?",
                            a: "Edite o membro na aba Equipes e marque, em Instâncias liberadas e Filas atribuídas, apenas o que ele deve ver. A restrição só existe para Agentes — supervisores e admins sempre veem tudo.",
                        },
                        {
                            q: "Supervisor pode editar membros da equipe?",
                            a: "Sim — com a permissão 'Membros da Equipe' (ligada por padrão), o supervisor cria e edita Atendentes e outros Supervisores: nome, telefone, função, comissão e escopo de visão. Ele não edita o Admin nem promove ninguém a Admin.",
                        },
                        {
                            q: "Posso ter dois admins?",
                            a: "O ideal é um admin principal (o dono da conta). Para gestores, o papel Supervisor com todas as permissões cobre o dia a dia sem expor a administração da equipe.",
                        },
                        {
                            q: "Como sei quem atendeu cada conversa?",
                            a: "Cada conversa assumida registra o atendente responsável — visível no inbox, no Monitoramento e nas métricas de atendimento da aba Satisfação.",
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
