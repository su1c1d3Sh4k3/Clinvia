import { useNavigate } from "react-router-dom";
import {
    ShieldCheck, UserPlus, SlidersHorizontal, Wifi, HelpCircle, ExternalLink, Users,
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
                            Convide sua equipe, escolha papéis e ajuste fino do que cada um pode fazer. Página exclusiva de administradores.
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
                    { title: "Desativar quando sair", description: "Funcionário saiu? Remova/desative o membro — o histórico de atendimentos dele permanece registrado." },
                ]} />
                <Callout type="atencao" title="Nunca compartilhe um login">
                    Cada pessoa com seu acesso: é isso que permite saber quem atendeu cada conversa, medir tempos por
                    atendente e desligar acessos individualmente sem trocar senha de todo mundo.
                </Callout>
            </TopicSection>

            {/* 4 */}
            <TopicSection id="permissoes" index={4} icon={SlidersHorizontal} title="Permissões finas"
                subtitle="Criar / Editar / Apagar, módulo por módulo">
                <p className="text-sm text-muted-foreground">
                    Na aba <strong className="text-foreground">Permissões</strong>, você define para Supervisores e Agentes
                    o que cada nível pode <strong className="text-foreground">criar, editar e apagar</strong> em cada módulo
                    (contatos, agendamentos, profissionais, vendas...). Os botões correspondentes simplesmente somem da
                    interface de quem não tem a permissão.
                </p>
                <Callout type="pratica" title="Configuração comum">
                    Agentes: criar contatos e agendamentos, sem apagar nada. Supervisores: tudo exceto apagar vendas.
                    Apagar é a permissão mais perigosa — dê a poucos.
                </Callout>
            </TopicSection>

            {/* 5 */}
            <TopicSection id="online" index={5} icon={Wifi} title="Quem está online"
                subtitle="O termômetro da operação em tempo real">
                <p className="text-sm text-muted-foreground">
                    O Dashboard (aba Monitoramento) mostra o <strong className="text-foreground">status online</strong> de
                    cada membro: quem está com o sistema aberto e ativo nos últimos 2 minutos aparece como disponível.
                    Junto com o atendente responsável de cada conversa, você enxerga a distribuição de carga da equipe.
                </p>
            </TopicSection>

            {/* 6 */}
            <TopicSection id="faq" index={6} icon={HelpCircle} title="Perguntas frequentes">
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
                            q: "Um membro não enxerga clientes/serviços que o admin vê.",
                            a: "Não deveria acontecer — os dados são da conta, não da pessoa. Confirme que o membro foi convidado pela página Equipe (e não criou uma conta avulsa própria). Persistindo, acione o suporte Clinvia.",
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
