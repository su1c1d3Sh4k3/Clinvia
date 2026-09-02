import { useNavigate } from "react-router-dom";
import {
    DollarSign, FileText, BarChart3, Table2, Trophy, ShoppingCart, ShieldCheck,
    HelpCircle, ExternalLink, PlusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Callout, LearnChip, StepByStep, SubNav, TopicSection } from "./blocks";

// ---------------------------------------------------------------------------
// Manual do Financeiro (/financial) — abas Orçamentos e Vendas
// ---------------------------------------------------------------------------

const TOPICS = [
    { id: "o-que-e", label: "O que é" },
    { id: "periodo", label: "Filtro de período" },
    { id: "cards", label: "Os 4 cards" },
    { id: "grafico", label: "Gráfico de 12 meses" },
    { id: "tabela-orcamentos", label: "Tabela de orçamentos" },
    { id: "rankings", label: "Profissional e serviços" },
    { id: "vendas", label: "Aba Vendas" },
    { id: "permissoes", label: "Permissões" },
    { id: "faq", label: "FAQ" },
];

export function FinanceiroGuide() {
    const navigate = useNavigate();
    return (
        <div className="space-y-8">
            {/* Hero */}
            <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <DollarSign className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Manual do Financeiro</h1>
                        <p className="text-sm text-muted-foreground">
                            Duas visões do dinheiro da clínica: o que foi <strong>proposto</strong> (Orçamentos) e o
                            que foi <strong>fechado</strong> (Vendas). É aqui que você vê quanto está parado
                            esperando resposta do cliente.
                        </p>
                    </div>
                </div>
                <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        O que você vai aprender
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <LearnChip topicId="cards">Ler os 4 cards de valores</LearnChip>
                        <LearnChip topicId="rankings">Ver quem mais orça e o que mais é orçado</LearnChip>
                        <LearnChip topicId="vendas">Acompanhar todas as vendas numa lista só</LearnChip>
                    </div>
                </div>
            </div>

            <SubNav topics={TOPICS} />

            {/* 1 */}
            <TopicSection id="o-que-e" index={1} icon={DollarSign} title="O que é a página Financeiro"
                subtitle="Orçamentos de um lado, Vendas do outro">
                <p className="text-sm text-muted-foreground">
                    O Financeiro fica na barra lateral, logo abaixo de Marketing, e tem duas abas.
                    A aba <strong className="text-foreground">Orçamentos</strong> mostra o que foi{" "}
                    <strong className="text-foreground">proposto</strong> aos clientes: valores totais, o que foi
                    aprovado, o que foi rejeitado e o que ainda está pendente. A aba{" "}
                    <strong className="text-foreground">Vendas</strong> mostra o que foi{" "}
                    <strong className="text-foreground">efetivamente vendido</strong>, com faturamento por pessoa e
                    o ranking dos itens mais vendidos.
                </p>
                <Callout type="dica" title="A aba fica salva no link">
                    Ao trocar de aba, o endereço muda para <code>/financial?tab=vendas</code>. Dá para salvar nos
                    favoritos ou mandar o link direto para alguém do time.
                </Callout>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/financial")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Abrir Financeiro
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate("/financial?tour=financeiro-visao-geral")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
                    </Button>
                </div>
            </TopicSection>

            {/* 2 */}
            <TopicSection id="periodo" index={2} icon={FileText} title="O filtro de período"
                subtitle="Ele manda nos 4 cards do topo">
                <StepByStep steps={[
                    { title: "Todo o período", description: "Opção inicial: soma tudo o que já foi orçado, desde o começo." },
                    { title: "Hoje / Últimos 7 dias / Últimos 30 dias", description: "Atalhos rápidos para acompanhar o ritmo recente." },
                    { title: "Personalizado", description: "Escolhe data inicial e final. Enquanto as duas datas não estiverem preenchidas, o filtro continua mostrando tudo." },
                ]} />
                <Callout type="atencao" title="O filtro do topo não muda tudo">
                    Ele vale para os <strong>4 cards de valores</strong>. O gráfico é sempre dos últimos 12 meses,
                    a tabela sempre mostra os orçamentos mais recentes, e os dois quadros de baixo
                    (profissional e serviços) têm cada um o seu próprio filtro.
                </Callout>
            </TopicSection>

            {/* 3 */}
            <TopicSection id="cards" index={3} icon={BarChart3} title="Os 4 cards de valores"
                subtitle="Todos em reais, seguindo o período escolhido">
                <div className="grid gap-1.5 text-sm sm:grid-cols-2">
                    <div className="rounded-lg border p-2.5">
                        <p className="font-semibold text-blue-600 dark:text-blue-400">Valores totais</p>
                        <p className="text-muted-foreground">Soma de tudo que foi orçado no período, independente do desfecho.</p>
                    </div>
                    <div className="rounded-lg border p-2.5">
                        <p className="font-semibold text-emerald-600 dark:text-emerald-400">Valores aprovados</p>
                        <p className="text-muted-foreground">O que virou venda — pelo <strong>valor final vendido</strong>, já com o desconto que você deu no assistente, e não pelo valor da proposta.</p>
                    </div>
                    <div className="rounded-lg border p-2.5">
                        <p className="font-semibold text-rose-600 dark:text-rose-400">Valores rejeitados</p>
                        <p className="text-muted-foreground">Itens recusados pelo cliente <strong>mais</strong> os que expiraram sem resposta.</p>
                    </div>
                    <div className="rounded-lg border p-2.5">
                        <p className="font-semibold text-amber-600 dark:text-amber-400">Valores pendentes</p>
                        <p className="text-muted-foreground">Ainda em aberto: o cliente não respondeu e a validade não venceu. É o dinheiro que está na mesa.</p>
                    </div>
                </div>
                <Callout type="pratica" title="Aprovado menor que o orçado é normal">
                    Como o card de aprovados usa o valor final da venda, ele fica abaixo do proposto sempre que
                    houve desconto. Se a diferença for grande demais, vale revisar a política de desconto do time.
                </Callout>
            </TopicSection>

            {/* 4 */}
            <TopicSection id="grafico" index={4} icon={BarChart3} title="Gráfico dos últimos 12 meses"
                subtitle="Aqui é quantidade de itens, não dinheiro">
                <p className="text-sm text-muted-foreground">
                    O gráfico mostra quatro linhas por mês:{" "}
                    <strong className="text-foreground">realizados</strong> (tudo que foi orçado),{" "}
                    <strong className="text-foreground">fechados</strong>,{" "}
                    <strong className="text-foreground">perdidos</strong> (recusados + expirados) e{" "}
                    <strong className="text-foreground">pendentes</strong>. O botão no canto alterna entre linhas
                    e barras.
                </p>
                <Callout type="atencao" title="A conta é por item, não por orçamento">
                    Um orçamento com 3 serviços conta como 3. É de propósito: assim dá para ver que o cliente
                    aceitou 2 dos 3 procedimentos oferecidos.
                </Callout>
            </TopicSection>

            {/* 5 */}
            <TopicSection id="tabela-orcamentos" index={5} icon={Table2} title="Tabela de orçamentos realizados"
                subtitle="Uma linha por orçamento, o mais novo no topo">
                <StepByStep steps={[
                    { title: "Clique no nome do cliente", description: "Abre a ficha dele já na aba Orçamentos, com o detalhe item a item de cada proposta." },
                    { title: "Coluna Situação", description: "Mostra em selos quantos itens estão pendentes, vendidos, recusados e expirados naquele orçamento." },
                    { title: "Orçado x Vendido", description: "Orçado é a soma da proposta; Vendido é o que realmente entrou em caixa a partir dela." },
                    { title: "Indicação e Criado por", description: "De onde veio o cliente e quem montou a proposta — útil para saber o que está dando retorno." },
                ]} />
            </TopicSection>

            {/* 6 */}
            <TopicSection id="rankings" index={6} icon={Trophy} title="Por profissional e ranking de serviços"
                subtitle="Os dois quadros do rodapé da aba">
                <StepByStep steps={[
                    { title: "Orçamentos por profissional", description: "Quantos orçamentos, quantos itens e quanto em reais cada profissional teve no período. Todos os profissionais ativos aparecem, mesmo com zero — assim você enxerga quem não está orçando." },
                    { title: "Ranking de serviços orçados", description: "Top 10 serviços mais propostos, com quantos foram vendidos e o valor. É sobre o que foi OFERECIDO, não sobre de onde veio o cliente." },
                    { title: "Filtros independentes", description: "Cada quadro tem seu próprio período (hoje, 7 dias, 30 dias ou personalizado) e começa nos últimos 30 dias." },
                ]} />
                <Callout type="dica" title="Profissional é quem executa">
                    O profissional vem do campo obrigatório do orçamento. Quem digitou a proposta aparece na
                    coluna <strong>Criado por</strong> da tabela.
                </Callout>
            </TopicSection>

            {/* 7 */}
            <TopicSection id="vendas" index={7} icon={ShoppingCart} title="Aba Vendas"
                subtitle="O que realmente entrou, mês a mês">
                <StepByStep steps={[
                    { title: "Escolha mês e ano", description: "Diferente da aba Orçamentos, aqui o período é por mês fechado — o mesmo filtro do painel de Vendas do Dashboard." },
                    { title: "Cards e gráficos", description: "Total vendido, quantidade, ticket médio, percentual de agendamentos e a evolução do mês." },
                    { title: "Vendas realizadas", description: "Lista completa, a mais recente no topo: cliente (clique para abrir a ficha na aba Vendas), item, valor, pagamento, situação do agendamento, profissional, sala e atendente." },
                    { title: "Mais vendidos", description: "Top 10 itens por quantidade no mês selecionado." },
                    { title: "Faturamento por atendente e por profissional", description: "Duas tabelas lado a lado. O faturamento por profissional agora usa o cadastro de profissionais (não a sala)." },
                ]} />
                <Callout type="atencao" title="Venda sem profissional aparece como Sem responsável">
                    Vendas antigas, lançadas antes do cadastro de profissionais, podem não ter ninguém vinculado.
                    Elas continuam somando no total, agrupadas em <strong>Sem responsável</strong>.
                </Callout>
                <Callout type="dica" title="Coluna Pagamento">
                    Parcelado mostra quantas parcelas já foram pagas (ex.: 2/6 pagas). Pendente significa que a
                    forma de pagamento ainda não foi definida na venda.
                </Callout>
            </TopicSection>

            {/* 8 */}
            <TopicSection id="permissoes" index={8} icon={ShieldCheck} title="Quem pode ver"
                subtitle="Financeiro é módulo controlado por permissão">
                <StepByStep steps={[
                    { title: "Administrador", description: "Vê sempre, sem precisar de configuração." },
                    { title: "Supervisor e atendente", description: "Só veem o item Financeiro na barra lateral se tiverem a permissão do módulo Financeiro ligada." },
                    { title: "Criar orçamento pela página", description: "O botão Criar orçamento no topo da aba Orçamentos respeita a permissão do módulo Orçamentos — igual à lateral do Inbox." },
                    { title: "Onde ajustar", description: "Equipe > aba Permissões, por colaborador." },
                ]} />
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/equipe?tab=permissoes")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Abrir Permissões
                    </Button>
                </div>
            </TopicSection>

            {/* 9 */}
            <TopicSection id="faq" index={9} icon={HelpCircle} title="Perguntas frequentes">
                <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="f1">
                        <AccordionTrigger>Dá para criar um orçamento sem abrir a conversa?</AccordionTrigger>
                        <AccordionContent>
                            Sim. O botão <strong>Criar orçamento</strong> no topo da aba Orçamentos abre o mesmo
                            formulário da lateral do Inbox, só que com um campo a mais para você buscar o cliente
                            por nome ou número. <PlusCircle className="inline h-3.5 w-3.5" /> Depois de salvo, o
                            orçamento aparece normalmente na conversa daquele cliente.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="f2">
                        <AccordionTrigger>Por que o valor aprovado não bate com o orçado?</AccordionTrigger>
                        <AccordionContent>
                            Porque aprovado usa o <strong>valor final da venda</strong>. Se o item foi orçado por
                            R$ 1.000 e vendido por R$ 800, o card de aprovados soma R$ 800. É o dinheiro que
                            realmente entrou.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="f3">
                        <AccordionTrigger>Por que o card conta em reais e o gráfico em quantidade?</AccordionTrigger>
                        <AccordionContent>
                            Os cards respondem "quanto dinheiro" e o gráfico responde "quantas propostas". Misturar
                            os dois na mesma leitura esconde o volume: um mês com 3 orçamentos grandes parece igual
                            a um mês com 30 pequenos.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="f4">
                        <AccordionTrigger>Um orçamento expirado ainda aparece aqui?</AccordionTrigger>
                        <AccordionContent>
                            Aparece na tabela, com o selo de expirado, e o valor dele entra em{" "}
                            <strong>Valores rejeitados</strong>. Ele só some da lateral do Inbox — o registro
                            continua sendo seu.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="f5">
                        <AccordionTrigger>A tabela mostra tudo mesmo?</AccordionTrigger>
                        <AccordionContent>
                            As duas tabelas carregam os 300 registros mais recentes, que é o que interessa para o
                            acompanhamento do dia a dia. Para o histórico completo de um cliente, abra a ficha dele
                            clicando no nome.
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </TopicSection>
        </div>
    );
}
