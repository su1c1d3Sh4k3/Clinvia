import { useNavigate } from "react-router-dom";
import {
    Calendar, CalendarDays, MousePointerClick, UserCog, Wallet, BellRing, Upload, Link2,
    KanbanSquare, HelpCircle, ExternalLink, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Callout, LearnChip, StepByStep, SubNav, TopicSection } from "./blocks";
import { ConfirmationFlowSimulator, DailyScheduleDemo } from "./simulators-agenda";

// ---------------------------------------------------------------------------
// Manual da Agenda
// ---------------------------------------------------------------------------

const TOPICS = [
    { id: "o-que-e", label: "O que é" },
    { id: "calendario", label: "O calendário" },
    { id: "visao-mes", label: "Visão mês" },
    { id: "criando", label: "Criando agendamento" },
    { id: "horarios", label: "Horários do profissional" },
    { id: "fechar-dia", label: "Fechar a agenda no dia" },
    { id: "venda-automatica", label: "Venda automática" },
    { id: "confirmacoes", label: "Mensagens automáticas" },
    { id: "importacao", label: "Importação" },
    { id: "link-publico", label: "Link público" },
    { id: "status-e-crm", label: "Status e CRM" },
    { id: "faq", label: "FAQ" },
];

export function AgendaGuide() {
    const navigate = useNavigate();

    return (
        <div className="space-y-8">
            {/* Hero */}
            <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <Calendar className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Manual da Agenda</h1>
                        <p className="text-sm text-muted-foreground">
                            O centro operacional da clínica: agendamentos, profissionais, confirmações automáticas e o elo com vendas e CRM.
                        </p>
                    </div>
                </div>
                <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        O que você vai aprender
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <LearnChip topicId="criando">Criar um agendamento em 30s</LearnChip>
                        <LearnChip topicId="visao-mes">Ver o mês inteiro em calendário</LearnChip>
                        <LearnChip topicId="venda-automatica">Por que todo agendamento vira venda</LearnChip>
                        <LearnChip topicId="confirmacoes">As 3 mensagens automáticas</LearnChip>
                        <LearnChip topicId="status-e-crm">O que cada status dispara</LearnChip>
                    </div>
                </div>
            </div>

            <SubNav topics={TOPICS} />

            {/* 1 */}
            <TopicSection id="o-que-e" index={1} icon={Calendar} title="O que é a Agenda?"
                subtitle="Muito mais que um calendário">
                <p className="text-sm text-muted-foreground">
                    A Agenda mostra <strong className="text-foreground">um dia por vez, com uma coluna por
                    profissional</strong>. Mas ela não é só visual: cada agendamento criado aqui{" "}
                    <strong className="text-foreground">gera uma venda pendente, move o card do cliente no CRM e liga as
                    mensagens automáticas</strong> de confirmação, lembrete e pesquisa de satisfação.
                </p>
                <Callout type="dica" title="Quem alimenta a Agenda?">
                    Você (botão Criar Agendamento), a IA (agendando direto na conversa), o cliente (link público de
                    agendamento), a importação por planilha e até o Google Calendar sincronizado. Tudo cai na mesma grade.
                </Callout>
            </TopicSection>

            {/* 2 */}
            <TopicSection id="calendario" index={2} icon={MousePointerClick} title="Navegando no calendário"
                subtitle="Grade por profissional, hover e visão solo">
                <StepByStep steps={[
                    { title: "Escolha o dia", description: "Use as setas ‹ › no topo, o botão Hoje, ou o mini-calendário na barra lateral (passe o mouse sobre os ícones à esquerda para expandi-la)." },
                    { title: "Profissionais ou Salas", description: "Ao lado do botão Hoje há o alternador Profissionais | Salas. Em Profissionais a grade traz só as agendas de quem está cadastrado em Equipe > Profissionais; em Salas, só as salas avulsas (laser, consultório, equipamento) que não têm profissional vinculado. A lista de botões da barra lateral acompanha o modo escolhido." },
                    { title: "Leia a grade", description: "Cada coluna é um profissional; a área cinza é fora do horário dele. Passe o mouse sobre um evento para ver o card completo com botões de status." },
                    { title: "Visão solo", description: "Clique no nome do profissional no cabeçalho para ver só a agenda dele; a seta restaura a visão geral." },
                    { title: "Lista de profissionais", description: "Na barra lateral, logo abaixo do calendário, há um botão para cada agenda do modo atual: clique e a grade mostra só aquela. O botão Todos volta à visão geral. Ideal para clínicas com muitos profissionais — a escolha continua valendo quando você troca de dia." },
                    { title: "Filtre e busque", description: "Na barra lateral, filtre por categoria/serviço (só aparecem profissionais que executam aquele serviço); no topo, busque cliente agendado no dia." },
                ]} />
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/scheduling?tour=agenda-tour")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
                    </Button>
                </div>
            </TopicSection>

            {/* 3 */}
            <TopicSection id="visao-mes" index={3} icon={CalendarDays} title="Visão mês (calendário)"
                subtitle="O mês inteiro de um profissional numa tela só">
                <p className="text-sm text-muted-foreground">
                    O botão com o ícone de <strong className="text-foreground">calendário</strong>, ao lado das setas de
                    data, troca a grade do dia por um{" "}
                    <strong className="text-foreground">calendário do mês</strong>. Cada quadrado é um dia, com os
                    agendamentos no formato <em>primeiro nome - serviço - horário</em>. Para voltar, clique no ícone de
                    grade que aparece no mesmo lugar.
                </p>
                <StepByStep steps={[
                    { title: "Escolha o profissional", description: "Nesta visão a tela mostra UM profissional por vez: troque pelo card Profissionais do menu lateral (o mesmo da visão grade). O nome de quem está sendo exibido aparece no topo do calendário." },
                    { title: "Navegue por mês", description: "As setas ‹ › passam a andar de mês em mês e o botão Hoje volta para o mês atual." },
                    { title: "Leia o quadrado do dia", description: "Ao lado do número do dia aparece o gráfico de ocupação daquele dia. Se o dia não tem nenhum agendamento, no lugar do gráfico aparece o cadeado para fechar a agenda." },
                    { title: "Veja o dia inteiro", description: "Se houver mais agendamentos do que cabe no quadrado, aparece um +N. Clicando no dia (ou no +N) abre a lista completa daquele dia, com os horários livres logo abaixo." },
                    { title: "Agende pelo horário livre", description: "No modal do dia, cada horário livre é um botão: clicar já abre o modal de agendamento com data, hora e profissional preenchidos. Clicar num agendamento da lista abre o modal dele." },
                ]} />
                <Callout type="dica" title="A escolha fica salva no seu usuário">
                    O modo escolhido é gravado no seu perfil: ele continua valendo quando você troca de página, sai e
                    entra de novo, ou acessa de outro dispositivo. Cada pessoa da equipe pode usar o modo que preferir —
                    um na grade, outro no calendário.
                </Callout>
                <Callout type="atencao" title="Os horários livres são de 30 em 30 minutos">
                    O calendário mostra as opções a cada meia hora só para facilitar a escolha. A duração real do
                    atendimento continua sendo a do procedimento selecionado no modal de agendamento — e as validações de
                    conflito, intervalo e horário de trabalho continuam valendo.
                </Callout>
            </TopicSection>

            {/* 4 */}
            <TopicSection id="criando" index={4} icon={MousePointerClick} title="Criando um agendamento"
                subtitle="Clique no horário vago ou no botão Criar Agendamento">
                <StepByStep steps={[
                    { title: "Abra o modal", description: "Clique direto num horário vago da coluna do profissional (já preenche data/hora/profissional) ou use o botão Criar Agendamento no topo." },
                    { title: "Escolha o cliente", description: "Todo agendamento PRECISA de um cliente vinculado — é ele que recebe as confirmações e movimenta o CRM." },
                    { title: "Escolha a conexão", description: "Campo obrigatório: é a conexão que diz em qual funil do CRM o agendamento entra (cada número tem o seu). Com uma conexão só, ela já vem selecionada." },
                    { title: "Serviço e profissional", description: "Selecione o serviço do catálogo; só aparecem profissionais vinculados àquele serviço, e o preço vem do cadastro." },
                    { title: "Pagamento (opcional)", description: "Já pode registrar a forma de pagamento (à vista, parcelado, misto). Se deixar pendente, acerta depois na aba Vendas do cliente." },
                ]} />
                <Callout type="atencao" title="Conflitos e horários são validados">
                    O sistema bloqueia sobreposição de horários do mesmo profissional e não deixa agendar fora do horário de
                    trabalho dele — inclusive quando é a IA ou o link público agendando.
                </Callout>
            </TopicSection>

            {/* 5 */}
            <TopicSection id="horarios" index={5} icon={UserCog} title="Horários da sala"
                subtitle="Global ou dia a dia — e vale para IA e link público">
                <Callout type="dica" title="Cada coluna da grade é uma sala">
                    A sala de um profissional leva o nome dele e é criada junto com o cadastro, em{" "}
                    <strong>Equipe &gt; Profissionais</strong>. Salas avulsas (laser, procedimentos) ficam em{" "}
                    <strong>Equipe &gt; Salas</strong> e atendem com qualquer profissional disponível. Inativar uma sala tira
                    a coluna da agenda e cancela os agendamentos futuros dela.
                </Callout>
                <p className="text-sm text-muted-foreground">
                    No cadastro da sala (barra lateral &gt; Adicionar Sala, ou lápis no cabeçalho da coluna)
                    você define dias de trabalho, horário e intervalo. Precisa de horários diferentes por dia? Ligue{" "}
                    <strong className="text-foreground">"Configurar horário individualmente"</strong>:
                </p>
                <DailyScheduleDemo />
            </TopicSection>

            {/* 6 */}
            <TopicSection id="fechar-dia" index={6} icon={Lock} title="Fechar a agenda no dia"
                subtitle="O cadeado ao lado do nome do profissional">
                <p className="text-sm text-muted-foreground">
                    Feriado, folga, congresso, atestado: quando o profissional não vai atender em um dia específico,
                    clique no <strong className="text-foreground">cadeado ao lado do nome dele</strong>, no cabeçalho da
                    coluna. O dia inteiro vira intervalo e{" "}
                    <strong className="text-foreground">nenhum horário é oferecido em lugar nenhum</strong> — nem na
                    grade, nem no modal de criar agendamento, nem para a IA, nem no link público.
                </p>
                <StepByStep steps={[
                    { title: "Encontre o cadeado", description: "Ele fica ao lado do nome do profissional, no cabeçalho da coluna do dia que está aberto na tela. Passe o mouse e aparece 'Fechar agenda no neste dia'." },
                    { title: "Clique para fechar", description: "O cadeado fica vermelho e a coluna inteira é preenchida como intervalo. É por dia e por profissional: os outros profissionais e os outros dias continuam normais." },
                    { title: "Clique de novo para liberar", description: "O sistema pergunta 'Deseja liberar o dia desse profissional para receber agendamentos'. Responda Sim e a agenda volta ao horário normal na hora." },
                ]} />
                <Callout type="atencao" title="O cadeado só aparece se o dia estiver vazio">
                    Se o profissional já tem <strong className="text-foreground">qualquer agendamento ativo</strong>{" "}
                    naquele dia, o cadeado não aparece — o sistema não deixa fechar por cima de cliente marcado. Cancele
                    ou reagende os atendimentos primeiro e o cadeado volta a aparecer.
                </Callout>
                <Callout type="dica" title="Na visão mês o cadeado fica no quadrado do dia">
                    No modo calendário o mesmo cadeado aparece dentro do quadrado de cada dia sem agendamento (no lugar do
                    gráfico de ocupação) — dá para fechar vários dias de folga do mês seguidos, sem trocar de tela.
                </Callout>
                <Callout type="dica" title="Diferente de tirar o dia do horário de trabalho">
                    O cadeado é pontual: fecha <strong className="text-foreground">só aquela data</strong> e não mexe no
                    cadastro. Se a folga é toda semana (ex.: nunca atende às quartas), o certo é desmarcar o dia nos dias
                    de trabalho do profissional.
                </Callout>
            </TopicSection>

            {/* 7 */}
            <TopicSection id="venda-automatica" index={7} icon={Wallet} title="Todo agendamento vira venda"
                subtitle="A regra financeira mais importante da Agenda">
                <StepByStep steps={[
                    { title: "Agendou → venda pendente", description: "Ao criar o agendamento, o sistema cria (ou vincula) automaticamente uma venda com pagamento pendente para aquele serviço." },
                    { title: "Compra sem horário → consumida", description: "Se o cliente já tinha comprado o serviço e ainda não tinha marcado, o agendamento 'consome' essa venda em vez de criar outra." },
                    { title: "Concluiu → Ganho no CRM", description: "Marcar o agendamento como Concluído fecha o ciclo: o card do cliente vai para Ganho e a venda aparece nos dashboards." },
                ]} />
                <Callout type="dica" title="Nada se perde">
                    Na aba Vendas do perfil do cliente, cada venda mostra o agendamento vinculado — e vendas sem horário
                    marcado ficam sinalizadas como "Aguardando Agendamento" para a equipe correr atrás.
                </Callout>
            </TopicSection>

            {/* 8 */}
            <TopicSection id="confirmacoes" index={8} icon={BellRing} title="Mensagens automáticas"
                subtitle="Confirmação, lembrete e pesquisa — sem mexer um dedo">
                <p className="text-sm text-muted-foreground">
                    Todo agendamento ativa três mensagens automáticas no WhatsApp do cliente. Clique em cada etapa:
                </p>
                <ConfirmationFlowSimulator />
                <Callout type="atencao" title="Enquanto o cliente responde botões, a IA espera">
                    Durante uma confirmação ou pesquisa ativa, as respostas do cliente vão para o fluxo automático — a IA não
                    interfere. Se ele pedir um atendente (ou fugir dos botões), a equipe é chamada.
                </Callout>
            </TopicSection>

            {/* 9 */}
            <TopicSection id="importacao" index={9} icon={Upload} title="Importando agendamentos"
                subtitle="Migre de outro sistema por planilha">
                <StepByStep steps={[
                    { title: "Suba a planilha", description: "Barra lateral > Importar Agendamentos. Aceita Excel/CSV com cliente, telefone, serviço, profissional, data e hora." },
                    { title: "Mapeie as colunas", description: "O assistente pergunta qual coluna é o quê e vincula clientes pelo telefone (últimos 8 dígitos), criando os que faltam." },
                    { title: "Revise e confirme", description: "Você vê a prévia linha a linha antes de gravar. Passados viram Concluído (com venda), futuros viram Pendente (com card Agendado no CRM)." },
                ]} />
            </TopicSection>

            {/* 10 */}
            <TopicSection id="link-publico" index={10} icon={Link2} title="Link público de agendamento"
                subtitle="O cliente marca sozinho, sem falar com ninguém">
                <p className="text-sm text-muted-foreground">
                    O sistema gera um <strong className="text-foreground">link exclusivo por cliente</strong> onde ele mesmo
                    escolhe serviço, profissional e horário — vendo apenas horários realmente livres. O link mostra só{" "}
                    <strong className="text-foreground">avaliações e serviços que ele já comprou</strong> e ainda não marcou,
                    sem exibir preços.
                </p>
                <Callout type="pratica" title="Onde usar">
                    A IA envia esse link quando o cliente prefere escolher com calma, e ele também aparece nas mensagens de
                    reagendamento. Agendou pelo link? Cai na Agenda e no CRM igual a qualquer outro.
                </Callout>
                <Callout type="evite" title="Link antigo não abre mais">
                    Cada link carrega a <strong className="text-foreground">conexão</strong> pela qual ele foi enviado — é ela
                    que diz em qual funil do CRM o agendamento entra. Links gerados antes do funil por conexão não têm essa
                    informação e mostram o aviso "peça um link novo à clínica": basta a IA (ou a equipe) enviar o link de novo
                    pela conversa.
                </Callout>
            </TopicSection>

            {/* 11 */}
            <TopicSection id="status-e-crm" index={11} icon={KanbanSquare} title="Status do agendamento e CRM"
                subtitle="Cada status dispara uma reação em cadeia">
                <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full min-w-[560px] text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                                <th className="p-2.5 font-semibold">Status</th>
                                <th className="p-2.5 font-semibold">Quando usar</th>
                                <th className="p-2.5 font-semibold">O que acontece</th>
                            </tr>
                        </thead>
                        <tbody className="[&_td]:p-2.5 [&_tr]:border-b last:[&_tr]:border-b-0">
                            <tr><td className="font-medium">Pendente</td><td className="text-muted-foreground">Recém-criado</td><td className="text-muted-foreground">Card do cliente em "Agendado" no CRM; confirmação 24h antes</td></tr>
                            <tr><td className="font-medium">Confirmado</td><td className="text-muted-foreground">Cliente confirmou</td><td className="text-muted-foreground">Só muda a cor — lembrete de 2h segue normal</td></tr>
                            <tr><td className="font-medium">Concluído</td><td className="text-muted-foreground">Atendimento realizado</td><td className="text-muted-foreground">Card vai para Ganho, venda contabiliza, pesquisa em 24h</td></tr>
                            <tr><td className="font-medium">Cancelado</td><td className="text-muted-foreground">Cliente desmarcou</td><td className="text-muted-foreground">Card vai para Perdido; venda vinculada fica sinalizada</td></tr>
                            <tr><td className="font-medium">Não compareceu</td><td className="text-muted-foreground">Faltou sem avisar</td><td className="text-muted-foreground">Card vai para Perdido; alerta na venda para a equipe reengajar</td></tr>
                        </tbody>
                    </table>
                </div>
                <Callout type="evite" title="Não deixe agendamentos passados sem status">
                    Marque Concluído/Cancelado/Não compareceu no fim do dia — é isso que mantém CRM, vendas e dashboards
                    fiéis à realidade. O botão Relatório Diário (barra lateral) gera o PDF do dia para conferência.
                </Callout>
            </TopicSection>

            {/* 12 */}
            <TopicSection id="faq" index={12} icon={HelpCircle} title="Perguntas frequentes">
                <Accordion type="single" collapsible className="rounded-xl border px-4">
                    {[
                        {
                            q: "Um profissional não aparece na grade. Por quê?",
                            a: "Cinco causas comuns: 1) a agenda está no modo errado — o alternador Profissionais | Salas ao lado do botão Hoje mostra um grupo por vez (salas avulsas só aparecem em Salas); 2) o profissional (ou a sala) está inativo em Equipe > Profissionais / Salas — a chave desligada tira a coluna da agenda; 3) a grade está na visão solo de outro profissional — clique em Todos na lista da barra lateral; 4) há um filtro de categoria/serviço ativo e ele não executa aquele serviço; 5) o dia selecionado não está nos dias de trabalho dele. Limpe o filtro e confira o cadastro.",
                        },
                        {
                            q: "A IA ofereceu um horário que eu não queria abrir. Como restringir?",
                            a: "A IA só oferece horários dentro do horário de trabalho do profissional. Ajuste o horário (ou use o horário individual por dia) no cadastro dele — a IA, o link público e a grade obedecem na hora. Se for só um dia específico (folga, feriado), use o cadeado no cabeçalho da coluna daquele dia.",
                        },
                        {
                            q: "O cadeado de fechar a agenda sumiu. Por quê?",
                            a: "Ele só aparece quando o profissional não tem nenhum agendamento ativo naquele dia — o sistema não deixa fechar o dia por cima de cliente marcado. Cancele ou reagende os atendimentos e o cadeado reaparece.",
                        },
                        {
                            q: "Cancelei um agendamento. A cobrança some?",
                            a: "A venda vinculada não é apagada — ela fica sinalizada com alerta de cancelamento para a equipe decidir (estornar, reagendar, abonar). Nada financeiro é destruído automaticamente.",
                        },
                        {
                            q: "O cliente não recebeu a confirmação de 24h. O que verificar?",
                            a: "1) O telefone do cliente está correto no cadastro? 2) A conexão de WhatsApp está ativa em Conexões? 3) O template da confirmação está ligado (Conexões > Templates ou Mensagens API não oficial)? 4) No número oficial (Meta), o template precisa estar aprovado.",
                        },
                        {
                            q: "Posso sincronizar com o Google Calendar?",
                            a: "Sim — conecte a conta no cadastro do profissional. Os agendamentos do sistema vão para o Google e eventos criados lá aparecem na grade (sem cliente vinculado, portanto sem automações de CRM/mensagens).",
                        },
                        {
                            q: "Agendei manualmente pelo WhatsApp com o cliente. Preciso lançar na Agenda?",
                            a: "Sim, sempre. Só o que está na Agenda dispara confirmações, lembretes, pesquisa, venda e CRM. Combinou pelo chat? Use o atalho de agendamento no painel lateral do inbox — leva 30 segundos.",
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
