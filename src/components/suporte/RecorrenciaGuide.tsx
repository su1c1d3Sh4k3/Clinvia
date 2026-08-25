import { useNavigate } from "react-router-dom";
import {
    Repeat, CalendarClock, MessageSquareText, BadgeCheck, Settings2, Megaphone, HelpCircle, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Callout, LearnChip, StepByStep, SubNav, TopicSection } from "./blocks";

// ---------------------------------------------------------------------------
// Manual da Recorrência (/recurrence + campanhas automáticas de recompra)
// ---------------------------------------------------------------------------

const TOPICS = [
    { id: "o-que-e", label: "O que é" },
    { id: "abordagens", label: "As 3 abordagens" },
    { id: "mensagens", label: "Mensagens e variáveis" },
    { id: "templates-meta", label: "Aprovação Meta" },
    { id: "configuracao", label: "Configuração" },
    { id: "campanhas-diarias", label: "Campanhas diárias" },
    { id: "faq", label: "FAQ" },
];

export function RecorrenciaGuide() {
    const navigate = useNavigate();
    return (
        <div className="space-y-8">
            {/* Hero */}
            <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <Repeat className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Manual da Recorrência</h1>
                        <p className="text-sm text-muted-foreground">
                            Recompra no piloto automático: 3 abordagens por cliente, mensagens personalizadas e
                            campanhas geradas todos os dias.
                        </p>
                    </div>
                </div>
                <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        O que você vai aprender
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <LearnChip topicId="mensagens">Escrever as mensagens com variáveis</LearnChip>
                        <LearnChip topicId="configuracao">Escolher instância e horário do disparo</LearnChip>
                        <LearnChip topicId="campanhas-diarias">Acompanhar as campanhas do dia</LearnChip>
                    </div>
                </div>
            </div>

            <SubNav topics={TOPICS} />

            {/* 1 */}
            <TopicSection id="o-que-e" index={1} icon={Repeat} title="O que é a Recorrência?"
                subtitle="O sistema lembra o cliente de voltar — no momento certo">
                <p className="text-sm text-muted-foreground">
                    Serviços como toxina botulínica têm prazo de retorno. Quando um agendamento de um serviço com
                    recorrência configurada é concluído, o sistema calcula a <strong className="text-foreground">data
                    de recompra</strong> e programa até <strong className="text-foreground">3 abordagens</strong> por
                    WhatsApp em datas diferentes. A página <strong className="text-foreground">Recorrência</strong> do
                    menu lateral lista todos os clientes nesse ciclo, mês a mês, com o status de cada abordagem.
                </p>
                <Callout type="dica" title="Tudo começa em Serviços">
                    O prazo de recorrência, as datas das 3 abordagens, os descontos e as mensagens são configurados
                    no <strong>serviço</strong>: na página <strong>Serviços</strong>, clique no lápis ao lado do
                    nome do serviço e abra a aba Recorrência. A configuração vale para todas as aplicações daquele
                    serviço. Mensagens em branco usam o <strong>template padrão da conta</strong> (3 textos prontos,
                    editáveis em Conexões &gt; Templates &gt; aba Recorrência).
                </Callout>
            </TopicSection>

            {/* 2 */}
            <TopicSection id="abordagens" index={2} icon={CalendarClock} title="As 3 abordagens"
                subtitle="Prévia, vencimento e pós — cada uma com sua data e mensagem">
                <StepByStep steps={[
                    { title: "Datas por serviço", description: "No lápis do serviço (página Serviços, aba Recorrência) você define quantos dias antes/depois do vencimento cada mensagem sai (ex.: 15 dias antes, no dia, 15 dias depois). Os campos são sempre manuais — abordagem sem valor não é agendada. Cada abordagem tem desconto próprio." },
                    { title: "Status na página Recorrência", description: "Cada abordagem mostra pendente, enviada, entregue, respondida, agendou ou falhou — atualizado automaticamente conforme a campanha do dia roda." },
                    { title: "Cliente agendou = ciclo encerrado", description: "Quando o cliente marca um novo agendamento, a linha é marcada como agendado e as abordagens seguintes não são mais enviadas." },
                ]} />
                <Callout type="dica" title="Duas abordagens vencidas ao mesmo tempo?">
                    O sistema envia apenas a mais avançada (ex.: a mensagem 2) e marca a anterior como pulada —
                    o cliente nunca recebe duas cobranças no mesmo dia.
                </Callout>
            </TopicSection>

            {/* 3 */}
            <TopicSection id="mensagens" index={3} icon={MessageSquareText} title="Mensagens e variáveis"
                subtitle="Template padrão da conta + textos personalizados por serviço">
                <p className="text-sm text-muted-foreground">
                    Toda conta tem um <strong className="text-foreground">template padrão</strong> com as 3 mensagens
                    (Prévia, Vencimento e Pós-vencimento), editável em Conexões &gt; Templates &gt; aba Recorrência.
                    Serviços com as mensagens em branco usam esse padrão; para personalizar um serviço, escreva as
                    mensagens na aba Recorrência do serviço (lápis ao lado do nome). Todas aceitam variáveis que o
                    sistema preenche na hora do envio:
                </p>
                <div className="grid gap-1.5 text-sm sm:grid-cols-2">
                    {[
                        ["{{nome_cliente}}", "nome do cliente"],
                        ["{{nome_clinica}}", "nome da clínica"],
                        ["{{servico}}", "serviço (ex.: Toxina Botulínica)"],
                        ["{{aplicacao}}", "aplicação (ex.: Botox Full Face)"],
                        ["{{preco}}", "preço cadastrado do serviço"],
                        ["{{profissional}}", "profissional do atendimento original"],
                        ["{{desconto}}", "% de desconto da abordagem (ex.: 10%)"],
                        ["{{meses}}", "meses desde o procedimento (ex.: 3)"],
                        ["{{data_procedimento}}", "data do procedimento (dd/mm/aaaa)"],
                        ["{{dias_do_procedimento}}", "dias desde o procedimento (ex.: 30 dias)"],
                    ].map(([v, d]) => (
                        <div key={v} className="rounded-lg border p-2">
                            <code className="text-xs font-semibold">{v}</code>
                            <span className="ml-2 text-muted-foreground">{d}</span>
                        </div>
                    ))}
                </div>
                <Callout type="dica" title="Desconto por abordagem">
                    Cada mensagem 1/2/3 pode ter um % de desconto próprio — ele entra na campanha e a IA
                    informa o preço original e o preço com desconto ao responder o cliente.
                </Callout>
            </TopicSection>

            {/* 4 */}
            <TopicSection id="templates-meta" index={4} icon={BadgeCheck} title="Aprovação de template (Meta)"
                subtitle="Clínicas com WhatsApp oficial precisam do aval da Meta">
                <p className="text-sm text-muted-foreground">
                    No WhatsApp oficial (Meta), mensagens de marketing só saem por{" "}
                    <strong className="text-foreground">template aprovado</strong>. O template padrão da conta
                    (rec_default) é enviado para análise automaticamente ao conectar a primeira instância Meta.
                    Ao salvar mensagens personalizadas em um serviço, o sistema cria e submete o template daquele
                    serviço — o selo ao lado do nome do <strong className="text-foreground">serviço</strong> em
                    Serviços mostra <em>aprovado</em> (verde), <em>pendente</em> (âmbar) ou <em>negado</em>{" "}
                    (vermelho). Editou uma mensagem (do serviço ou do padrão)? O sistema avisa antes: o template
                    antigo é removido da Meta e uma nova versão é submetida — os disparos ficam pausados até a
                    aprovação.
                </p>
                <Callout type="atencao" title="Template não aprovado bloqueia o disparo">
                    A campanha do dia é criada, mas fica <strong>bloqueada</strong> com o alerta
                    "Campanha interrompida devido a não aprovação do template da Meta". As abordagens continuam
                    pendentes e entram na campanha do dia em que o template for aprovado. Conexões não oficiais
                    (API não oficial) enviam texto livre, sem aprovação.
                </Callout>
            </TopicSection>

            {/* 5 */}
            <TopicSection id="configuracao" index={5} icon={Settings2} title="Configuração: instância e horário"
                subtitle="O botão de engrenagem na página Recorrência">
                <StepByStep steps={[
                    { title: "Abra as configurações", description: "Na página Recorrência, clique no botão de engrenagem no canto superior direito." },
                    { title: "Horário do disparo", description: "Escolha a hora base (padrão 9h). O envio de cada campanha é sorteado dentro dessa janela de 1 hora — ex.: hora 9 dispara entre 9h e 10h." },
                    { title: "Duração das campanhas", description: "Quantos dias cada campanha de recorrência fica ativa (padrão 3 dias). Ao terminar, a campanha expira e a tag é removida dos contatos." },
                    { title: "Instância de envio", description: "Escolha qual número dispara a recorrência (mesma configuração disponível em Configurações > Automações, card Recorrência). No automático, prioriza o WhatsApp oficial." },
                ]} />
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/recurrence?tour=recorrencia-config")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
                    </Button>
                </div>
            </TopicSection>

            {/* 6 */}
            <TopicSection id="campanhas-diarias" index={6} icon={Megaphone} title="Campanhas diárias automáticas"
                subtitle="Todo dia, uma campanha por serviço e por mensagem">
                <p className="text-sm text-muted-foreground">
                    De madrugada, o sistema junta as abordagens que vencem no dia, agrupa por serviço e número da
                    mensagem e cria campanhas <em>Recorrência - serviço - MsgN - data</em>. Elas usam o mesmo motor
                    das campanhas normais: tag própria, IA respondendo com o contexto da oferta e métricas completas
                    (envios, entregas, respostas, agendamentos). Cada campanha fica ativa pela{" "}
                    <strong className="text-foreground">duração configurada</strong> (padrão 3 dias — ajustável na
                    engrenagem da página Recorrência); depois disso ela expira e a tag é removida dos contatos.
                </p>
                <Callout type="dica" title="E se o cliente já estiver em outra campanha?">
                    Vale a regra padrão de 1 campanha por contato: a campanha mais recente assume. Se o cliente
                    estava em uma campanha de disparo antiga, a de recorrência a sobrepõe e atribui a tag de
                    recorrência; da mesma forma, uma campanha nova criada depois pode sobrepor a de recorrência.
                </Callout>
                <StepByStep steps={[
                    { title: "Onde acompanhar", description: "Dashboard > aba Recorrência > seção Campanhas de Recorrência: um container por dia; expanda para ver cada campanha e sua tabela de contatos." },
                    { title: "Elas não aparecem em Campanhas", description: "A página e a aba Campanhas mostram só as campanhas criadas por você — as de recorrência vivem na aba Recorrência." },
                    { title: "Resultado volta para a página Recorrência", description: "O status de cada abordagem (enviada, entregue, respondida, agendou, falhou) é atualizado a partir do resultado da campanha." },
                ]} />
            </TopicSection>

            {/* 7 */}
            <TopicSection id="faq" index={7} icon={HelpCircle} title="Perguntas frequentes">
                <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="f1">
                        <AccordionTrigger>Por que a campanha do dia não saiu?</AccordionTrigger>
                        <AccordionContent>
                            Verifique: (1) há abordagens vencendo no dia na página Recorrência; (2) existe instância
                            conectada (engrenagem &gt; instância); (3) no WhatsApp oficial, o template está aprovado —
                            campanha bloqueada aparece com alerta vermelho no Dashboard &gt; Recorrência.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="f2">
                        <AccordionTrigger>O cliente respondeu — quem atende?</AccordionTrigger>
                        <AccordionContent>
                            A IA, com o contexto da campanha (serviço, preço e desconto), como em qualquer campanha.
                            A conversa aparece no Inbox normalmente e a equipe pode assumir quando quiser.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="f3">
                        <AccordionTrigger>Posso pausar a recorrência de um cliente?</AccordionTrigger>
                        <AccordionContent>
                            Sim — na página Recorrência, marque a linha como agendado ou ajuste o status das
                            abordagens; abordagens não pendentes não entram nas campanhas diárias.
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </TopicSection>
        </div>
    );
}
