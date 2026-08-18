import { useNavigate } from "react-router-dom";
import {
    Users, IdCard, BadgeCheck, FolderOpen, Bot, Star, Tag, HelpCircle, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Callout, LearnChip, StepByStep, SubNav, TopicSection } from "./blocks";
import { ClientStageSimulator } from "./simulators-clientes";

// ---------------------------------------------------------------------------
// Manual da página Clientes (/contacts)
// ---------------------------------------------------------------------------

const TOPICS = [
    { id: "o-que-e", label: "O que é" },
    { id: "cadastro", label: "Cadastro e números" },
    { id: "categorias", label: "Contato, Lead, Cliente" },
    { id: "perfil", label: "Perfil completo" },
    { id: "ia-por-contato", label: "IA por contato" },
    { id: "nps-sentimento", label: "NPS e sentimento" },
    { id: "tags", label: "Tags" },
    { id: "faq", label: "FAQ" },
];

export function ClientesGuide() {
    const navigate = useNavigate();

    return (
        <div className="space-y-8">
            {/* Hero */}
            <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <Users className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Manual de Clientes</h1>
                        <p className="text-sm text-muted-foreground">
                            A base de contatos da clínica: cadastro, categorias automáticas, o perfil 360º e o botão de IA por cliente.
                        </p>
                    </div>
                </div>
                <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        O que você vai aprender
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <LearnChip topicId="categorias">Por que o selo Lead/Cliente muda sozinho</LearnChip>
                        <LearnChip topicId="perfil">Tudo sobre um cliente em 1 clique</LearnChip>
                        <LearnChip topicId="ia-por-contato">Desligar a IA para UM cliente</LearnChip>
                        <LearnChip topicId="cadastro">Importar e exportar em planilha</LearnChip>
                    </div>
                </div>
            </div>

            <SubNav topics={TOPICS} />

            {/* 1 */}
            <TopicSection id="o-que-e" index={1} icon={Users} title="O que é a página Clientes?"
                subtitle="Todo mundo que já falou com a clínica mora aqui">
                <p className="text-sm text-muted-foreground">
                    Qualquer pessoa que manda mensagem no WhatsApp ou Instagram da clínica{" "}
                    <strong className="text-foreground">vira um contato automaticamente</strong> — você não precisa cadastrar
                    quem chega pelos canais. A página lista todos, com busca, filtros por canal e categoria, seleção em massa
                    e o botão de IA individual.
                </p>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/contacts?tour=clientes-tour")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
                    </Button>
                </div>
            </TopicSection>

            {/* 2 */}
            <TopicSection id="cadastro" index={2} icon={IdCard} title="Cadastro, importação e exportação"
                subtitle="Complete os dados — o telefone é a chave de tudo">
                <StepByStep steps={[
                    { title: "Novo Contato / Editar", description: "Cadastre manualmente ou complete os dados de quem chegou pelo chat: nome, CPF, e-mail, empresa, Instagram." },
                    { title: "Importar por planilha", description: "Baixe o Modelo, preencha e importe. O sistema casa os contatos pelo TELEFONE (últimos 8 dígitos) — não cria duplicado se a pessoa já existe." },
                    { title: "Importar do WhatsApp", description: "Com conexão não oficial, dá para puxar a agenda do próprio aparelho de uma vez." },
                    { title: "Exportar", description: "Gera um Excel com todos os dados visíveis, incluindo categoria e etiquetas — útil para backup e análises externas." },
                ]} />
                <Callout type="atencao" title="O telefone é a identidade do contato">
                    Todas as automações (campanhas, confirmações, importação de agendamentos) encontram o cliente pelos
                    últimos 8 dígitos do telefone. Um número errado no cadastro = mensagens indo para a pessoa errada ou
                    contato duplicado.
                </Callout>
            </TopicSection>

            {/* 3 */}
            <TopicSection id="categorias" index={3} icon={BadgeCheck} title="Contato, Lead ou Cliente"
                subtitle="O selo automático que conta a história de compra">
                <p className="text-sm text-muted-foreground">
                    Cada contato carrega um selo colorido — <strong className="text-orange-600">Contato</strong>,{" "}
                    <strong className="text-yellow-600">Lead</strong> ou <strong className="text-emerald-600">Cliente</strong> —
                    definido automaticamente pelo histórico de compras:
                </p>
                <ClientStageSimulator />
                <Callout type="dica" title="Use os filtros do topo">
                    Os botões Contatos / Leads / Clientes filtram a lista pelo selo. Quer uma campanha só para leads que
                    fizeram avaliação e nunca fecharam? É esse filtro + exportação (ou a audiência da campanha).
                </Callout>
            </TopicSection>

            {/* 4 */}
            <TopicSection id="perfil" index={4} icon={FolderOpen} title="Perfil completo do cliente"
                subtitle="Clique no nome e veja a vida inteira do cliente em 9 abas">
                <p className="text-sm text-muted-foreground">
                    Clicar no <strong className="text-foreground">nome do contato</strong> abre o perfil 360º:
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                    {[
                        ["Cadastro", "dados pessoais e de contato"],
                        ["Vendas", "compras, pagamentos e agendamento vinculado"],
                        ["Procedimentos", "o que já foi aplicado"],
                        ["Agendamentos", "histórico e futuros"],
                        ["Atendimentos", "conversas anteriores"],
                        ["Histórico", "documentos e arquivos (5 categorias); em Notas ficam também as Notas de Conversa do inbox (com autor e data — não podem ser apagadas)"],
                        ["Avaliação", "notas NPS dadas"],
                        ["Resumos", "resumos de conversa gerados pela IA"],
                        ["Negociações", "cards do CRM, ativos e encerrados"],
                    ].map(([t, d]) => (
                        <div key={t} className="rounded-xl border p-3">
                            <p className="text-sm font-semibold">{t}</p>
                            <p className="text-xs text-muted-foreground">{d}</p>
                        </div>
                    ))}
                </div>
                <Callout type="pratica" title="Antes de atender, espie o perfil">
                    30 segundos no perfil evitam perguntas repetidas: você já sabe o que a pessoa comprou, quando veio e
                    qual foi a última conversa. O mesmo perfil abre pelo painel lateral do inbox e pelo card do CRM.
                </Callout>
            </TopicSection>

            {/* 5 */}
            <TopicSection id="ia-por-contato" index={5} icon={Bot} title="IA por contato"
                subtitle="O bisturi: desligar a assistente para UMA pessoa">
                <p className="text-sm text-muted-foreground">
                    Na coluna <strong className="text-foreground">IA</strong> da tabela, cada contato tem um interruptor.
                    Desligado, a IA nunca mais responde aquela pessoa — mesmo com tudo ligado no resto do sistema.
                </p>
                <Callout type="dica" title="Quando usar">
                    Pacientes VIP que só falam com a doutora, fornecedores, familiares da equipe, ou aquele cliente que já
                    reclamou de "falar com robô". É reversível a qualquer momento — e é um dos 5 portões da IA (veja o
                    manual da aba IA).
                </Callout>
            </TopicSection>

            {/* 6 */}
            <TopicSection id="nps-sentimento" index={6} icon={Star} title="NPS e sentimento"
                subtitle="Duas medidas diferentes sobre o mesmo cliente">
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border p-3.5">
                        <p className="text-sm font-semibold">NPS (0 a 5)</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            A nota que o PRÓPRIO cliente deu na pesquisa de satisfação pós-atendimento. Fica no perfil (aba
                            Avaliação) e alimenta o dashboard de Satisfação, atribuída ao profissional do atendimento.
                        </p>
                    </div>
                    <div className="rounded-xl border p-3.5">
                        <p className="text-sm font-semibold">Sentimento (0 a 10)</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            A leitura da IA sobre o TOM da conversa (satisfeito, neutro, irritado). É um termômetro
                            automático — o cliente não digitou essa nota.
                        </p>
                    </div>
                </div>
                <Callout type="evite" title="Não some as duas">
                    Um cliente pode ter sentimento 8 na conversa e dar NPS 2 no atendimento (ou o contrário). São
                    termômetros independentes, exibidos separados de propósito.
                </Callout>
            </TopicSection>

            {/* 7 */}
            <TopicSection id="tags" index={7} icon={Tag} title="Tags (etiquetas)"
                subtitle="Organização livre, do seu jeito">
                <StepByStep steps={[
                    { title: "Crie e atribua", description: "Selecione vários contatos com as caixinhas e use 'Atribuir Tags' para etiquetar em massa (ex.: 'Pós-botox', 'Indicação', 'Evento Julho')." },
                    { title: "Filtre por tag", description: "O seletor 'Filtrar Tag' mostra só os contatos daquela etiqueta — a base para listas de trabalho da equipe." },
                    { title: "Tags de campanha são automáticas", description: "1 hora antes do disparo, os contatos da campanha ganham uma tag com o nome dela (no máximo uma tag de campanha por conexão; sai quando a campanha encerra ou quando o contato entra em outra campanha). É assim que o sistema te avisa se você tentar disparar de novo para quem já recebeu há menos de 7 dias." },
                ]} />
            </TopicSection>

            {/* 8 */}
            <TopicSection id="faq" index={8} icon={HelpCircle} title="Perguntas frequentes">
                <Accordion type="single" collapsible className="rounded-xl border px-4">
                    {[
                        {
                            q: "Por que não consigo mudar a categoria (Lead/Cliente) manualmente?",
                            a: "Porque ela é calculada pelo histórico de compras — é um retrato fiel, não uma opinião. Para 'promover' alguém a Cliente, registre a venda; o selo muda sozinho.",
                        },
                        {
                            q: "Apareceu um contato duplicado. O que houve?",
                            a: "Quase sempre é o mesmo cliente com números diferentes (ou um número salvo errado). Confira os telefones nos dois cadastros; o canal Instagram também cria um contato próprio, que o sistema vincula ao contato de WhatsApp quando identifica a pessoa.",
                        },
                        {
                            q: "Desliguei a IA do contato mas ela continuou respondendo.",
                            a: "Confira se você desligou no contato certo (o número que está conversando). O interruptor vale por contato — se o cliente escreve de outro número, é outro contato.",
                        },
                        {
                            q: "Importei a planilha e alguns contatos não entraram.",
                            a: "Linhas sem telefone válido são ignoradas. Verifique também se o número tem DDD — o casamento é pelos últimos 8 dígitos, mas o cadastro precisa de um número completo.",
                        },
                        {
                            q: "Posso apagar um contato?",
                            a: "Pode (com permissão), mas prefira não apagar quem tem histórico: vendas, agendamentos e conversas perdem a referência. Apague apenas contatos de teste ou spam.",
                        },
                        {
                            q: "Para que serve o botão de mensagem na linha do contato?",
                            a: "Abre uma nova conversa com aquele contato sem sair da página — escolhendo a conexão de envio e, no número oficial, um template aprovado (ou texto livre se a janela de 24h estiver aberta).",
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
