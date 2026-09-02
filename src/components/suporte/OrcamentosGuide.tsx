import { useNavigate } from "react-router-dom";
import {
    FileText, PlusCircle, ListChecks, CalendarX2, ShoppingCart, DoorOpen, Ban, ShieldCheck,
    HelpCircle, ExternalLink, Clock, CheckCircle2, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Callout, LearnChip, StepByStep, SubNav, TopicSection } from "./blocks";

// ---------------------------------------------------------------------------
// Manual dos Orçamentos (lateral do Inbox + perfil do cliente)
// ---------------------------------------------------------------------------

const TOPICS = [
    { id: "o-que-e", label: "O que é" },
    { id: "criar", label: "Criar orçamento" },
    { id: "status", label: "Status dos itens" },
    { id: "validade", label: "Validade" },
    { id: "lancar-venda", label: "Lançar venda" },
    { id: "sala", label: "Sala obrigatória" },
    { id: "avaliacao", label: "Avaliação" },
    { id: "permissoes", label: "Permissões" },
    { id: "faq", label: "FAQ" },
];

export function OrcamentosGuide() {
    const navigate = useNavigate();
    return (
        <div className="space-y-8">
            {/* Hero */}
            <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <FileText className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Manual dos Orçamentos</h1>
                        <p className="text-sm text-muted-foreground">
                            Toda venda começa por um orçamento: você monta a proposta na conversa, acompanha o que
                            foi aceito e transforma em venda (com agendamento) em 4 passos.
                        </p>
                    </div>
                </div>
                <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        O que você vai aprender
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <LearnChip topicId="criar">Montar um orçamento pela lateral do Inbox</LearnChip>
                        <LearnChip topicId="lancar-venda">Lançar a venda em 4 passos</LearnChip>
                        <LearnChip topicId="status">Entender os status de cada item</LearnChip>
                    </div>
                </div>
            </div>

            <SubNav topics={TOPICS} />

            {/* 1 */}
            <TopicSection id="o-que-e" index={1} icon={FileText} title="O que é o orçamento?"
                subtitle="A proposta que o cliente recebe antes de virar venda">
                <p className="text-sm text-muted-foreground">
                    O orçamento é a <strong className="text-foreground">proposta</strong>: quais serviços foram
                    oferecidos, por qual valor e com qual profissional. Ele nasce dentro da conversa, na lateral
                    direita do Inbox, e vive junto do cliente — nada é cobrado, nada é agendado ainda.
                    Quando o cliente aceita, você usa o botão{" "}
                    <strong className="text-foreground">Lançar venda</strong> e o sistema cria a venda (e o
                    agendamento, se for o caso) a partir do que já estava ali.
                </p>
                <Callout type="atencao" title="Toda venda passa por orçamento">
                    A venda não é mais lançada direto: ela sempre sai de um item de orçamento. A única exceção é a
                    categoria <strong>Avaliação</strong>, que não é vendida — só agendada.
                </Callout>
                <StepByStep steps={[
                    { title: "O orçamento é por cliente", description: "Um mesmo cliente pode ter vários orçamentos abertos ao mesmo tempo (propostas diferentes, momentos diferentes)." },
                    { title: "A lateral do Inbox mostra só os abertos", description: "Orçamento com item pendente aparece no menu Orçamento da conversa. Assim que todos os itens são resolvidos (vendidos, recusados ou expirados), ele sai da lateral." },
                    { title: "O histórico completo fica no perfil do cliente", description: "Clique no nome do cliente em Clientes e abra a aba Orçamentos: todos os orçamentos, resolvidos ou não, ficam ali." },
                    { title: "Grupos não têm orçamento", description: "O menu não aparece em conversas de grupo — orçamento é sempre de uma pessoa." },
                ]} />
            </TopicSection>

            {/* 2 */}
            <TopicSection id="criar" index={2} icon={PlusCircle} title="Criando um orçamento"
                subtitle="Direto na conversa, sem sair do atendimento">
                <StepByStep steps={[
                    { title: "Abra a conversa e a lateral direita", description: "No Inbox, com a conversa aberta, clique no menu Orçamento na barra lateral direita." },
                    { title: "Clique em Realizar orçamento", description: "Se o cliente ainda não tem nenhum orçamento aberto, esse é o botão que aparece." },
                    { title: "Escolha os serviços", description: "Use o seletor em cascata (categoria > serviço > aplicação) e informe a quantidade. Cada unidade vira uma linha independente, com valor e status próprios — dá para dar desconto em uma e manter a outra no preço cheio." },
                    { title: "Selecione o profissional", description: "Campo obrigatório: quem vai realizar o procedimento. A lista vem dos profissionais cadastrados em Equipe." },
                    { title: "Preencha a Indicação (opcional)", description: "Campo livre de onde veio o cliente (Instagram, indicação da Maria, tráfego pago...). Ele autocompleta com o que você já usou antes, então mantenha os nomes padronizados." },
                    { title: "Defina a validade (opcional)", description: "Data limite da proposta. Deixe em branco para o orçamento não expirar." },
                    { title: "Salve", description: "O card aparece na hora na lateral, com todos os itens em pendente." },
                ]} />
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/?tour=orcamento-criar")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
                    </Button>
                </div>
                <Callout type="dica" title="Preço mínimo">
                    Cada linha aceita um valor mínimo além do valor proposto. Use quando a negociação pode
                    cair até certo ponto — o time inteiro passa a saber qual é o limite.
                </Callout>
            </TopicSection>

            {/* 3 */}
            <TopicSection id="status" index={3} icon={ListChecks} title="Os status de cada item"
                subtitle="O card fala de venda — nunca de agendamento">
                <div className="grid gap-1.5 text-sm sm:grid-cols-2">
                    <div className="flex items-start gap-2 rounded-lg border p-2.5">
                        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                        <div>
                            <p className="font-semibold">Pendente</p>
                            <p className="text-muted-foreground">O cliente ainda não decidiu. É o único status que pode virar venda.</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-2 rounded-lg border p-2.5">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                        <div>
                            <p className="font-semibold">Vendido</p>
                            <p className="text-muted-foreground">Virou venda pelo assistente de lançamento. O item aponta para a venda criada.</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-2 rounded-lg border p-2.5">
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                        <div>
                            <p className="font-semibold">Recusado</p>
                            <p className="text-muted-foreground">Você marcou Remover no assistente: o cliente não quis esse serviço.</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-2 rounded-lg border p-2.5">
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div>
                            <p className="font-semibold">Expirado</p>
                            <p className="text-muted-foreground">A validade passou sem decisão. O sistema marca sozinho, de madrugada.</p>
                        </div>
                    </div>
                </div>
                <Callout type="atencao" title="Status é sobre a venda, não sobre a agenda">
                    O relógio significa "o cliente ainda não comprou" — e não "ainda não foi atendido". Um item
                    vendido continua vendido mesmo que o agendamento seja remarcado ou cancelado. Para acompanhar
                    atendimento, use a Agenda.
                </Callout>
                <StepByStep steps={[
                    { title: "Editar", description: "Enquanto houver itens pendentes, você pode editar o orçamento — mas só os itens pendentes aparecem para alteração; os já decididos ficam como registro." },
                    { title: "Excluir", description: "Só é possível excluir enquanto TODOS os itens estiverem pendentes. Assim que um item vira vendido ou recusado, a exclusão é bloqueada." },
                ]} />
            </TopicSection>

            {/* 4 */}
            <TopicSection id="validade" index={4} icon={CalendarX2} title="Validade e expiração"
                subtitle="A proposta tem prazo — e o sistema respeita">
                <p className="text-sm text-muted-foreground">
                    Se você preencher a <strong className="text-foreground">validade</strong>, todos os itens que
                    continuarem pendentes depois dessa data são marcados como{" "}
                    <strong className="text-foreground">expirados</strong> automaticamente (uma rotina roda de
                    madrugada). O orçamento expirado sai da lateral do Inbox e vira{" "}
                    <strong className="text-foreground">somente leitura</strong> no perfil do cliente: sem editar,
                    sem excluir e sem lançar venda.
                </p>
                <Callout type="dica" title="Cliente voltou depois do prazo?">
                    Crie um novo orçamento com os valores atualizados. O antigo continua no histórico como registro
                    da proposta que venceu — bom para comparar preço e entender a negociação.
                </Callout>
            </TopicSection>

            {/* 5 */}
            <TopicSection id="lancar-venda" index={5} icon={ShoppingCart} title="Lançar venda em 4 passos"
                subtitle="Do aceite do cliente até o horário na agenda">
                <StepByStep steps={[
                    { title: "Passo 1 — O que o cliente levou", description: "Cada item pendente vira um card com o valor editável (dá para aplicar o desconto fechado na conversa) e dois botões: Vender ou Remover. Quem for marcado como Remover vira recusado e sai do orçamento." },
                    { title: "Passo 2 — Como foi vendido", description: "Para cada serviço escolhido você define a Sala, a Forma de pagamento e a Data do pagamento, e responde se vai realizar o agendamento agora. O Atendente é você (não editável) e o Profissional vem do orçamento (também não editável)." },
                    { title: "Passo 3 — Os agendamentos", description: "Para cada serviço com agendamento sim, o formulário da agenda aparece dentro do assistente, um por vez, com o serviço travado. Nada é gravado ainda — só no final." },
                    { title: "Passo 4 — Revisão", description: "Um resumo de tudo: serviços, valores, pagamentos e horários. Confira e clique em Lançar venda; use Voltar para corrigir qualquer passo." },
                ]} />
                <Callout type="dica" title="Não vai agendar agora?">
                    Ao responder <strong>não</strong> no passo 2 aparece o switch{" "}
                    <strong>Agendamento pela IA</strong>: ligando, você informa em quantos dias a IA deve procurar
                    o cliente para marcar. A venda fica registrada como aguardando agendamento até lá.
                </Callout>
                <Callout type="pratica" title="Pagamento por serviço">
                    Cada serviço tem a sua forma de pagamento — o cliente pode pagar um à vista e parcelar outro
                    sem precisar de dois lançamentos.
                </Callout>
            </TopicSection>

            {/* 6 */}
            <TopicSection id="sala" index={6} icon={DoorOpen} title="Sala obrigatória para agendar"
                subtitle="O procedimento precisa estar atrelado a uma sala">
                <p className="text-sm text-muted-foreground">
                    No passo 2, a lista de salas mostra apenas as salas{" "}
                    <strong className="text-foreground">atreladas àquele procedimento</strong>. Se o serviço não
                    tiver nenhuma sala vinculada, o assistente avisa e não deixa avançar — é preciso vincular o
                    serviço à sala antes de continuar.
                </p>
                <StepByStep steps={[
                    { title: "Onde vincular", description: "Página Serviços > lápis do serviço: marque as salas que atendem aquele procedimento." },
                    { title: "Volte ao assistente", description: "Feche o aviso, ajuste o cadastro e reabra o Lançar venda — nada do que você preencheu foi para o banco ainda." },
                ]} />
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/products-services")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Abrir Serviços
                    </Button>
                </div>
            </TopicSection>

            {/* 7 */}
            <TopicSection id="avaliacao" index={7} icon={Ban} title="Avaliação não entra em orçamento"
                subtitle="Ela é agendada, nunca vendida">
                <p className="text-sm text-muted-foreground">
                    Serviços da categoria <strong className="text-foreground">Avaliação</strong> não aparecem no
                    seletor do orçamento e são bloqueados pelo sistema mesmo que alguém tente forçar. A avaliação
                    é o primeiro contato: ela é <strong className="text-foreground">agendada</strong> normalmente
                    pela Agenda, pelo link público de agendamento ou pela IA.
                </p>
                <Callout type="atencao" title="Não renomeie a categoria Avaliação">
                    O sistema identifica a categoria pelo nome. Renomear ou excluir é bloqueado justamente porque
                    várias regras (orçamento, link público, IA) dependem dela.
                </Callout>
            </TopicSection>

            {/* 8 */}
            <TopicSection id="permissoes" index={8} icon={ShieldCheck} title="Permissões"
                subtitle="Quem cria a proposta nem sempre é quem fecha a venda">
                <StepByStep steps={[
                    { title: "Módulo Orçamentos", description: "Controla criar, editar e excluir orçamento. Por padrão, o atendente pode criar e editar, mas não excluir." },
                    { title: "Módulo Vendas", description: "Controla o botão Lançar venda. Por padrão, o atendente NÃO pode lançar venda — ele monta a proposta e outra pessoa fecha." },
                    { title: "Onde ajustar", description: "Equipe > aba Permissões: ligue ou desligue cada ação por colaborador, a qualquer momento." },
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
                        <AccordionTrigger>Onde vejo tudo o que o cliente já comprou?</AccordionTrigger>
                        <AccordionContent>
                            No perfil do cliente (clique no nome em Clientes), aba <strong>Vendas</strong>: um card
                            por venda com data, valor, sala, profissional, atendente, indicação e o status do
                            pagamento (Quitada, Parcelas pendentes ou Pagamento pendente). Na lateral do perfil,
                            o campo <strong>Valor movimentado</strong> soma todas as vendas do cliente.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="f2">
                        <AccordionTrigger>O orçamento sumiu da lateral do Inbox. Perdi?</AccordionTrigger>
                        <AccordionContent>
                            Não. A lateral mostra só orçamentos com item pendente e dentro da validade. Assim que
                            tudo é decidido (ou o prazo vence), ele passa a viver no perfil do cliente, na aba
                            Orçamentos.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="f3">
                        <AccordionTrigger>O cliente levou 2 sessões e desistiu de 1. Como registro?</AccordionTrigger>
                        <AccordionContent>
                            Cada unidade é uma linha independente. No passo 1 do assistente, marque{" "}
                            <strong>Vender</strong> nas que ele levou e <strong>Remover</strong> na que ele
                            recusou — o orçamento fica com o histórico real da negociação.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="f4">
                        <AccordionTrigger>Errei o valor depois de lançar a venda. E agora?</AccordionTrigger>
                        <AccordionContent>
                            O item já vendido não volta para pendente. Ajuste a venda pelo financeiro/lista de
                            vendas — o orçamento é o registro da proposta, não da cobrança.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="f5">
                        <AccordionTrigger>O orçamento move o card no CRM?</AccordionTrigger>
                        <AccordionContent>
                            Não. Criar orçamento não mexe no funil. Quem movimenta o CRM continua sendo o
                            atendimento, o agendamento e a venda, como antes.
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </TopicSection>
        </div>
    );
}
