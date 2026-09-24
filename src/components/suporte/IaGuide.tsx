import { useNavigate } from "react-router-dom";
import {
    Bot, ShieldCheck, Building2, HelpCircle, Workflow, Timer, KanbanSquare,
    PowerOff, ExternalLink, Mic, CalendarClock, MessageCircle, FlaskConical,
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
    { id: "tom-de-voz", label: "Tom de voz" },
    { id: "ajustes", label: "Delay, voz e workflow" },
    { id: "horarios", label: "Horários de agendamento" },
    { id: "ia-e-crm", label: "IA e CRM" },
    { id: "desligando", label: "Desligando" },
    { id: "sandbox", label: "Ambiente de teste" },
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
                <Callout type="dica" title="O relógio do follow-up é a última mensagem do CLIENTE">
                    Quando o cliente some no meio da conversa, a IA espera e manda o follow-up. O tempo é contado{" "}
                    <strong>sempre a partir da última mensagem que o cliente enviou</strong> — e de mais nada. As pílulas
                    cinzas do chat (transferência de fila, "fulano visualizou essa conversa", entrou/saiu do grupo) e as
                    respostas da própria IA <strong>não reiniciam essa contagem</strong>. Ou seja: abrir a conversa para
                    dar uma olhada não atrasa o follow-up de ninguém. Conversa em que o cliente nunca escreveu (disparo de
                    campanha sem resposta) não entra no follow-up — não há o que contar.
                </Callout>
                <Callout type="dica" title="O Direct do Instagram segue as mesmas regras">
                    As 5 condições acima e o follow-up valem igual no <strong>Instagram</strong>: a conversa precisa estar
                    na fila Atendimento IA e a IA precisa estar ligada <strong>naquela conta de Instagram</strong> (não
                    adianta estar ligada num número de WhatsApp). Desligou a IA da conta, o follow-up dela para na hora —
                    exatamente como acontece ao desligar a IA de um número.
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
                    { title: "Sobre a clínica", description: "Descrição, horário de funcionamento e formas de pagamento — as perguntas mais comuns do dia a dia. Os convênios atendidos não ficam aqui: são cadastrados em Equipe > Convênios e a IA os recebe automaticamente." },
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
                <p className="text-sm text-muted-foreground">
                    É um campo único, geral da clínica. Não existe F.A.Q por produto ou serviço: o que é específico de um
                    procedimento (preço, duração, descrição) a IA lê do cadastro em{" "}
                    <strong className="text-foreground">Serviços</strong>.
                </p>
                <Callout type="dica">
                    Alimente o F.A.Q com as perguntas reais que sua equipe mais recebe ("faz cartão?", "atende sábado?",
                    "botox dói?"). Uma semana de anotações rende um F.A.Q excelente.
                </Callout>
            </TopicSection>

            {/* 5 */}
            <TopicSection id="tom-de-voz" index={5} icon={MessageCircle} title="Tom de voz"
                subtitle="Aba Tom de voz — como a IA escreve">
                <p className="text-sm text-muted-foreground">
                    A aba <strong className="text-foreground">Tom de voz</strong> define o jeito de escrever da sua
                    assistente. São controles que você arrasta e uma{" "}
                    <strong className="text-foreground">conversa de exemplo que muda na hora</strong>, ao lado, mostrando
                    exatamente como ela vai falar. Nada é escrito por IA: cada posição tem um texto pronto.
                </p>
                <StepByStep steps={[
                    { title: "Como a IA fala", description: "Seis controles de estilo: proximidade (distante ou próxima), formalidade (coloquial ou formal), elaboração (direta ou detalhada), expressividade (contida ou entusiasmada), assertividade (consultiva ou diretiva) e tecnicidade (nome popular ou termo técnico)." },
                    { title: "Tratamento e emoji", description: 'Você ou senhor/senhora — vale para a conversa inteira, sem misturar. E a frequência de emoji: nunca, raro (só em despedida ou confirmação) ou natural.' },
                    { title: "Abordagem comercial", description: "O único controle que muda comportamento, não só escrita: quantas vezes a IA tenta depois que o cliente recua. Da esquerda (aceita na hora, não insiste) até a direita (pergunta o motivo real e tenta até três vezes)." },
                    { title: "Sobre a clínica", description: "Uma descrição curta e opcional para dar contexto (ex.: \"clínica de dermatologia com 15 anos, público 40+\"). É descrição, não ordem: a IA não promete nem oferece nada com base neste campo." },
                    { title: "Salvar", description: "Esta aba tem o Salvar dela. A partir daí, todas as conexões da conta passam a falar nesse tom — o tom é único por conta." },
                ]} />
                <Callout type="atencao" title="Algumas combinações se ajustam sozinhas">
                    Formalidade alta com emoji natural, por exemplo, não combina. Quando isso acontece, o próprio controle
                    se move para o valor possível e aparece um aviso em amarelo embaixo dele explicando o porquê. Não é
                    erro: é o sistema evitando um tom incoerente.
                </Callout>
                <Callout type="dica" title="O tom não muda as regras">
                    Formato das mensagens, travas de compliance, fluxo do atendimento e o que está escrito em{" "}
                    <strong>Restrições</strong> continuam valendo igual em qualquer tom. Recusa direta e pedido de
                    descadastro sempre encerram na hora, inclusive na abordagem mais comercial.
                </Callout>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/ia-config?tab=tone&tour=ia-tom-de-voz")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
                    </Button>
                </div>
            </TopicSection>

            {/* 6 */}
            <TopicSection id="ajustes" index={6} icon={Timer} title="Delay, voz e conexão com o cérebro da IA"
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

            {/* 7 */}
            <TopicSection id="horarios" index={7} icon={CalendarClock} title="Horários de agendamento"
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

            {/* 8 */}
            <TopicSection id="ia-e-crm" index={8} icon={KanbanSquare} title="IA e CRM andam juntos"
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

            {/* 9 */}
            <TopicSection id="desligando" index={9} icon={PowerOff} title="Desligando a IA"
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

            {/* 10 */}
            <TopicSection id="sandbox" index={10} icon={FlaskConical} title="Ambiente de teste da IA"
                subtitle="Converse com a sua IA sem mandar nada para cliente nenhum">
                <p className="text-sm text-muted-foreground">
                    O <strong className="text-foreground">Ambiente de teste</strong> é uma cópia de brincadeira do
                    atendimento: você digita como se fosse um paciente e a sua IA responde de verdade — usando o mesmo
                    cérebro, o mesmo catálogo de serviços e as mesmas salas de produção. A diferença é que{" "}
                    <strong className="text-foreground">nada sai por WhatsApp</strong> e nada é gravado na sua conta de
                    verdade: as mensagens, os agendamentos, as vendas e o CRM do teste vivem num espaço separado.
                </p>
                <p className="text-sm text-muted-foreground">
                    Você chega nele pelo botão <strong className="text-foreground">Testar IA no ambiente Sandbox</strong>,
                    na aba Config desta página. Não precisa ligar a IA para ninguém: basta ter os serviços e as salas
                    cadastrados.
                </p>
                <StepByStep steps={[
                    { title: "Contador de consumo", description: "No topo, quanto o teste já custou em tokens e em reais. Ele fica preso no alto da tela enquanto você rola a página, então o custo nunca some de vista. Esse valor NÃO entra no relatório de consumo nem na fatura da sua conta — é só para você ter noção do custo de cada conversa." },
                    { title: "A conversa", description: "Escreva como o paciente falaria e aguarde. A IA responde em alguns segundos. O botão Limpar memória faz a IA esquecer tudo o que foi conversado e recomeçar do zero — útil para testar o mesmo roteiro várias vezes." },
                    { title: "Agenda Real ou Agenda Liberada", description: "Agenda Real faz a IA respeitar a agenda de verdade da clínica (só oferece o que está livre mesmo). Agenda Liberada finge que está tudo vazio, para você conseguir testar o agendamento sem depender de ter horário disponível hoje." },
                    { title: "O painel de três abas", description: "Tudo o que não é a conversa fica num painel ao lado dela, dividido em três abas: Logs, Voz e Simuladores. Ele tem a mesma altura do chat e rola por dentro, então trocar de aba não mexe na conversa." },
                    { title: "Aba Logs", description: "Quatro blocos, um abaixo do outro: o Paciente fictício (nome, e-mail, CPF, Instagram e convênios, tudo editável), O que a IA fez (cada consulta que ela fez ao sistema, em português), a Etapa no CRM (em que etapa o card está e todo o caminho que ele percorreu) e os Agendamentos e vendas do teste." },
                    { title: "Aba Voz", description: "Os mesmos controles da aba Tom de voz, um abaixo do outro, só que em rascunho. Salvar no teste faz a PRÓXIMA mensagem do chat já sair no tom novo, sem mexer no atendimento real. Quando gostar do resultado, Salvar em produção publica para valer. O campo Sobre a clínica não fica aqui: ele é único e se edita na aba Tom de voz." },
                    { title: "Aba Simuladores", description: "Aqui você provoca as situações que normalmente dependem de esperar: uma campanha chegando, uma mensagem de recorrência, uma confirmação de agendamento, uma venda avulsa ou um convênio no cadastro do paciente. A IA recebe exatamente como receberia na vida real." },
                ]} />
                <Callout type="atencao" title="Resetar apaga tudo e não tem volta">
                    O botão <strong>Resetar ambiente</strong> limpa do banco a conversa, o paciente, os agendamentos, as
                    vendas, o CRM e o histórico de consumo do teste, e cria um ambiente novo e vazio. Ele pergunta antes
                    de apagar. Use quando terminar um teste — assim você não fica consumindo à toa.
                </Callout>
                <Callout type="dica" title="O template de confirmação chega sem os botões">
                    No WhatsApp de verdade, a confirmação de agendamento chega com os botões Confirmar/Cancelar. No teste
                    ela chega só como texto, de propósito: a graça aqui é ver <strong>a IA reagindo à sua resposta
                    escrita</strong>, não clicar em botão.
                </Callout>
                <Callout type="dica" title="O catálogo é o de verdade">
                    Serviços, salas e convênios que aparecem nos simuladores são os que estão cadastrados na sua conta —
                    é justamente o que você quer ver a IA usando. O que é de mentira são os dados gerados pelo teste.
                </Callout>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/ia-sandbox?tour=ia-sandbox")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
                    </Button>
                </div>
            </TopicSection>

            {/* 11 */}
            <TopicSection id="faq" index={11} icon={HelpCircle} title="Perguntas frequentes">
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
                            q: "Posso ter um tom de voz diferente em cada número?",
                            a: "Não. O tom de voz é único da conta: todas as conexões, WhatsApp e Instagram, falam do mesmo jeito. O que muda por conexão é só se a IA está ligada ou não.",
                        },
                        {
                            q: "Mudei o tom de voz e a IA parece a mesma. Por quê?",
                            a: "Confira se clicou no Salvar da própria aba Tom de voz (ela tem o botão dela) e lembre que o tom vale para as PRÓXIMAS mensagens — o que já foi respondido não muda. Também vale olhar a conversa de exemplo da tela: se ela mudou, o tom mudou. Controles no meio da régua produzem diferenças sutis de propósito.",
                        },
                        {
                            q: "Posso ter IA em um número e não em outro?",
                            a: "Pode. Em IA > Config, cada conexão tem seu próprio botão. O interruptor geral precisa estar ligado, e aí você escolhe conexão por conexão.",
                        },
                        {
                            q: "Preciso ligar a IA para testar no ambiente de teste?",
                            a: "Não. O ambiente de teste ignora todos os portões: não importa se a IA geral está desligada, se a conexão está sem IA ou em que fila a conversa estaria. Basta ter os serviços e as salas cadastrados. É justamente para você conseguir ajustar tudo antes de soltar a IA para os clientes.",
                        },
                        {
                            q: "O que eu gastar no ambiente de teste aparece na minha fatura?",
                            a: "O consumo do teste é contado separado e mostrado no topo da própria página do ambiente de teste. Ele não entra no Relatório do Consumo da conta. Mesmo assim, quando terminar, use Resetar ambiente: o teste continua consumindo enquanto você conversa.",
                        },
                        {
                            q: "Testei um tom novo no ambiente de teste. Meus clientes já estão recebendo assim?",
                            a: "Não, enquanto você só clicar em Salvar no teste. Esse botão guarda o tom como rascunho e só o chat do teste usa. Para o atendimento real passar a falar assim, clique em Salvar em produção — é o mesmo salvar da aba Tom de voz.",
                        },
                        {
                            q: "Os agendamentos que a IA criou no teste apareceram na minha agenda?",
                            a: "Não. Agendamento, venda, card de CRM e anotação criados no teste ficam só no ambiente de teste — a agenda, o financeiro e o funil da sua conta não são tocados. E o link de agendamento gerado lá também é de teste: ele abre com um aviso amarelo no topo.",
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
