import { useNavigate } from "react-router-dom";
import {
    Bot, ShieldCheck, Building2, HelpCircle, Workflow, Timer, KanbanSquare,
    PowerOff, ExternalLink, Mic, CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Callout, LearnChip, StepByStep, SubNav, TopicSection } from "./blocks";
import { IaGateSimulator } from "./simulators-ia";

// ---------------------------------------------------------------------------
// Manual da aba IA
// ---------------------------------------------------------------------------

const TOPICS = [
    { id: "o-que-e", label: "O que é" },
    { id: "quando-responde", label: "Quando responde" },
    { id: "empresa", label: "Empresa" },
    { id: "faq-da-ia", label: "F.A.Q da IA" },
    { id: "ajustes", label: "Delay, voz e workflow" },
    { id: "horarios", label: "Horários de agendamento" },
    { id: "ia-e-crm", label: "IA e CRM" },
    { id: "desligando", label: "Desligando" },
    { id: "faq", label: "FAQ" },
];

export function IaGuide() {
    const navigate = useNavigate();

    return (
        <div className="space-y-8">
            {/* Hero */}
            <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <Bot className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Manual da IA</h1>
                        <p className="text-sm text-muted-foreground">
                            Sua assistente virtual: como ela decide quando responder, o que ela sabe sobre a clínica e como controlá-la.
                        </p>
                    </div>
                </div>
                <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        O que você vai aprender
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <LearnChip topicId="quando-responde">Por que a IA (não) respondeu</LearnChip>
                        <LearnChip topicId="empresa">Ensinar a IA sobre a clínica</LearnChip>
                        <LearnChip topicId="ia-e-crm">Como a IA conversa com o CRM</LearnChip>
                        <LearnChip topicId="desligando">Desligar por cliente, número ou geral</LearnChip>
                    </div>
                </div>
            </div>

            <SubNav topics={TOPICS} />

            {/* 1 */}
            <TopicSection id="o-que-e" index={1} icon={Bot} title="O que é a IA?"
                subtitle="Uma recepcionista virtual que nunca dorme">
                <p className="text-sm text-muted-foreground">
                    A IA é uma <strong className="text-foreground">assistente que responde seus clientes no WhatsApp e
                    Instagram</strong> como se fosse uma recepcionista treinada: apresenta a clínica, tira dúvidas sobre
                    serviços e preços, qualifica o interesse e pode até <strong className="text-foreground">agendar
                    sozinha</strong> consultando os horários reais da agenda.
                </p>
                <p className="text-sm text-muted-foreground">
                    Tudo o que ela sabe vem do que você preenche nesta página (abas Empresa e F.A.Q) — quanto mais completo,
                    melhores as respostas. E quando um humano assume a conversa, ela sai de cena imediatamente.
                </p>
                <Callout type="dica" title="IA e equipe não competem">
                    Pense na IA como o primeiro atendimento: ela segura o cliente na hora do interesse (madrugada, fim de
                    semana, pico de movimento) e a equipe entra nos casos que precisam de gente de verdade.
                </Callout>
                <Callout type="dica" title="Ela lembra do que já foi conversado">
                    A cada mensagem, a IA recebe as <strong>10 últimas mensagens trocadas com aquele cliente naquela
                    conexão</strong> — tanto as que a IA mandou quanto as que a equipe respondeu à mão, incluindo
                    atendimentos já encerrados. Por isso ela não repete perguntas nem "esquece" o assunto quando o
                    cliente volta dias depois. O histórico é <strong>separado por conexão</strong>: se o cliente falou
                    com dois números seus, cada um mantém sua própria conversa.
                </Callout>
            </TopicSection>

            {/* 2 */}
            <TopicSection id="quando-responde" index={2} icon={ShieldCheck} title="Quando a IA responde?"
                subtitle="Os 5 portões — a dúvida nº 1 de todos os clientes">
                <p className="text-sm text-muted-foreground">
                    Para a IA responder uma mensagem, <strong className="text-foreground">5 condições precisam estar
                    verdadeiras ao mesmo tempo</strong>. Se qualquer uma falhar, ela fica em silêncio — de propósito.
                    Brinque com o simulador:
                </p>
                <IaGateSimulator />
                <Callout type="atencao" title='"A IA parou de responder!"'>
                    Em 9 de cada 10 casos, alguém da equipe <strong>assumiu a conversa</strong> (ela deixou de ser pendente) ou
                    a conversa foi <strong>movida de fila</strong>. Verifique esses dois primeiro.
                </Callout>
            </TopicSection>

            {/* 3 */}
            <TopicSection id="empresa" index={3} icon={Building2} title="Ensinando a IA sobre a empresa"
                subtitle="Aba Empresa — o cérebro da assistente">
                <p className="text-sm text-muted-foreground">
                    A aba <strong className="text-foreground">Empresa</strong> é o material de estudo da IA. Cada campo vira
                    conhecimento nas respostas:
                </p>
                <StepByStep steps={[
                    { title: "Identidade", description: "Nome da assistente, nome da clínica, endereço, site, redes sociais — como ela se apresenta e o que informa quando pedem localização ou links." },
                    { title: "Sobre a clínica", description: "Descrição, horário de funcionamento, formas de pagamento e convênios — as perguntas mais comuns do dia a dia." },
                    { title: "Boas-vindas e restrições", description: "A mensagem de recepção e, principalmente, o que a IA NÃO deve fazer (ex.: não informar preços de cirurgias, não dar orientação médica)." },
                    { title: "Qualificação", description: "As perguntas que ela deve fazer para entender o interesse do cliente antes de oferecer agendamento." },
                ]} />
                <Callout type="pratica" title="Restrições valem ouro">
                    Escreva as restrições com clareza ("nunca informe valores de cirurgia, direcione para avaliação"). É o campo
                    que evita 90% das respostas indesejadas.
                </Callout>
            </TopicSection>

            {/* 4 */}
            <TopicSection id="faq-da-ia" index={4} icon={HelpCircle} title="F.A.Q da IA"
                subtitle="Perguntas e respostas prontas">
                <p className="text-sm text-muted-foreground">
                    Na aba <strong className="text-foreground">F.A.Q</strong> você cadastra perguntas frequentes com a resposta
                    exata que a IA deve dar. Quando o cliente pergunta algo parecido, ela usa a sua resposta em vez de
                    improvisar.
                </p>
                <Callout type="dica">
                    Alimente o F.A.Q com as perguntas reais que sua equipe mais recebe ("faz cartão?", "atende sábado?",
                    "botox dói?"). Uma semana de anotações rende um F.A.Q excelente.
                </Callout>
            </TopicSection>

            {/* 5 */}
            <TopicSection id="ajustes" index={5} icon={Timer} title="Delay, voz e conexão com o cérebro da IA"
                subtitle="Aba Config — o comportamento da assistente">
                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border p-3.5">
                        <p className="flex items-center gap-1.5 text-sm font-semibold"><Timer className="h-4 w-4 text-primary" />Delay</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Segundos que a IA aguarda antes de responder. Dá tempo do cliente terminar de digitar as várias
                            mensagens picadas — e a resposta considera tudo junto.
                        </p>
                    </div>
                    <div className="rounded-xl border p-3.5">
                        <p className="flex items-center gap-1.5 text-sm font-semibold"><Mic className="h-4 w-4 text-primary" />Voz</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Com a voz ligada, a IA pode responder áudios com áudio — mais natural para clientes que preferem
                            falar a digitar.
                        </p>
                    </div>
                    <div className="rounded-xl border p-3.5">
                        <p className="flex items-center gap-1.5 text-sm font-semibold"><Workflow className="h-4 w-4 text-primary" />Cérebro da IA</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            O endereço do cérebro da assistente é configurado automaticamente quando você liga a IA — não há
                            mais nada para preencher aqui.
                        </p>
                    </div>
                </div>
            </TopicSection>

            {/* 6 */}
            <TopicSection id="horarios" index={6} icon={CalendarClock} title="Horários de agendamento"
                subtitle="Aba Config — de quanto em quanto tempo a IA oferece horários">
                <StepByStep steps={[
                    {
                        title: "Tamanho do slot",
                        description: <>De quanto em quanto tempo os horários são oferecidos. Com <strong>30 minutos</strong>, a IA propõe 08:00, 08:30, 09:00... Com <strong>10 minutos</strong> (o padrão), ela propõe 08:00, 08:10, 08:20... Quanto menor o slot, mais opções o cliente recebe e mais "picada" fica a agenda.</>,
                    },
                    {
                        title: "Intervalo entre atendimentos",
                        description: <>Folga exigida <strong>antes e depois</strong> de cada agendamento já marcado — tempo de limpar a sala, higienizar o equipamento, respirar. O padrão é <strong>sem intervalo</strong>. Com 15 minutos, um atendimento das 10h às 11h bloqueia das 09h45 às 11h15.</>,
                    },
                    {
                        title: "Salvar",
                        description: "Clique em Salvar. A partir daí a IA, o link público e as automações que oferecem horários já seguem a nova regra.",
                    },
                ]} />
                <Callout type="atencao" title="O encaixe manual continua livre">
                    Essas duas regras valem para os canais automáticos: <strong>IA</strong>, <strong>link público de
                    agendamento</strong> e automações que oferecem horários pelo WhatsApp. Quem marca pela agenda do painel
                    continua podendo encaixar qualquer horário — a recepção não fica de mãos atadas.
                </Callout>
                <Callout type="dica" title="Slot não é duração">
                    O tamanho do slot não muda quanto tempo o procedimento leva: a duração continua vindo do cadastro da
                    aplicação em <strong>Serviços</strong>. O slot só define de quanto em quanto tempo os horários aparecem.
                </Callout>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/ia-config?tab=settings&tour=ia-horarios")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
                    </Button>
                </div>
            </TopicSection>

            {/* 7 */}
            <TopicSection id="ia-e-crm" index={7} icon={KanbanSquare} title="IA e CRM andam juntos"
                subtitle="Fila de atendimento e etapa do funil se movem em par">
                <StepByStep steps={[
                    { title: "Cliente novo chega", description: <>Com a IA ligada, a conversa nasce na fila <strong>Atendimento IA</strong> e um card é criado no CRM em "Em Atendimento IA".</>, },
                    { title: "A IA trabalha o funil", description: "Conforme a conversa evolui, o card anda: Qualificado, Agendado... A fila e a etapa ficam sempre sincronizadas — mover um move o outro." },
                    { title: "Humano assume", description: <>Se alguém atende (ou move o card para uma etapa humana), a conversa vai para <strong>Atendimento Humano</strong> e a IA para.</>, },
                ]} />
                <Callout type="atencao" title="Mover o card desliga a IA para aquela conversa">
                    Arrastar o card do cliente para uma etapa de atendimento humano tira a conversa da fila da IA. É o jeito
                    certo de "roubar" um cliente da IA — e é reversível.
                </Callout>
            </TopicSection>

            {/* 8 */}
            <TopicSection id="desligando" index={8} icon={PowerOff} title="Desligando a IA"
                subtitle="Do bisturi ao disjuntor: 3 níveis de controle">
                <StepByStep steps={[
                    { title: "Por cliente (bisturi)", description: <>Na página <strong>Clientes</strong>, cada contato tem um botão de IA. Perfeito para aquele paciente que só quer falar com a Dra.</>, },
                    { title: "Por conexão (chave do quarto)", description: <>Em <strong>IA &gt; Config</strong>, desligue a IA de um número específico — ex.: o número comercial fica com IA, o pessoal não. Só as conversas do número <strong>com IA ligada</strong> entram na fila Atendimento IA; as dos outros números nascem em Atendimento Humano, mesmo vindas de campanha com IA.</>, },
                    { title: "Geral (disjuntor)", description: <>O interruptor <strong>Ligar IA</strong> desliga tudo de uma vez. Para religar, primeiro ative o geral, depois as conexões.</>, },
                ]} />
                <Callout type="dica" title="O interruptor geral salva na hora">
                    Ligar ou desligar o <strong>Ligar IA</strong> vale imediatamente — não precisa clicar em "Salvar". O botão
                    Salvar continua sendo para os textos da empresa, F.A.Q e demais ajustes da página.
                </Callout>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/ia-config?tab=settings&tour=ia-config")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
                    </Button>
                </div>
            </TopicSection>

            {/* 9 */}
            <TopicSection id="faq" index={9} icon={HelpCircle} title="Perguntas frequentes">
                <Accordion type="single" collapsible className="rounded-xl border px-4">
                    {[
                        {
                            q: "A IA parou de responder um cliente. Por quê?",
                            a: "Confira os 5 portões (tópico 2), nesta ordem: 1) alguém assumiu a conversa? 2) a IA do contato está ligada (página Clientes)? 3) a IA geral está ligada? 4) a IA da conexão está ligada? 5) a conversa está na fila Atendimento IA? Basta um item falhar para ela silenciar.",
                        },
                        {
                            q: "Tenho dois números e só um com IA. As conversas do outro caem na fila da IA?",
                            a: "Não. A fila Atendimento IA é exclusiva das conexões com a IA ligada — conversa do número sem IA sempre nasce em Atendimento Humano, venha de onde vier (cliente novo, campanha, confirmação de agendamento). E se você desligar a IA de uma conexão, os atendimentos abertos dela são devolvidos para Atendimento Humano na hora, para ninguém ficar esperando resposta de uma IA que não vai responder.",
                        },
                        {
                            q: "Atendi um cliente e agora quero devolver para a IA. Como?",
                            a: "Encerre o atendimento (resolver a conversa). Quando o cliente mandar a próxima mensagem, nasce uma conversa nova — e, com os portões abertos, a IA assume de novo.",
                        },
                        {
                            q: "A IA respondeu algo errado sobre preço/serviço. Como corrigir?",
                            a: "Atualize a fonte: o preço vem do seu catálogo em Serviços; informações da clínica vêm da aba Empresa; e respostas específicas você fixa no F.A.Q. A IA só sabe o que está cadastrado.",
                        },
                        {
                            q: "A IA agenda sozinha?",
                            a: "Sim — ela consulta os horários reais dos profissionais (respeitando o horário de cada um) e cria o agendamento, que aparece na Agenda e move o card do CRM para 'Agendado'.",
                        },
                        {
                            q: "Por que a IA demora alguns segundos para responder?",
                            a: "É o delay proposital (aba Config): ela espera o cliente terminar de digitar as mensagens picadas para responder tudo de uma vez, como uma pessoa faria.",
                        },
                        {
                            q: "Posso ter IA em um número e não em outro?",
                            a: "Pode. Em IA > Config, cada conexão tem seu próprio botão. O interruptor geral precisa estar ligado, e aí você escolhe conexão por conexão.",
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
