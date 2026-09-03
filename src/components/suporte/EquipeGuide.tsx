import { useNavigate } from "react-router-dom";
import {
    ShieldCheck, UserPlus, SlidersHorizontal, Wifi, HelpCircle, ExternalLink, Users, ScanEye, Stethoscope,
    HeartHandshake,
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
    { id: "profissionais-salas", label: "Profissionais e Salas" },
    { id: "convenios", label: "Convênios" },
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
                        <LearnChip topicId="profissionais-salas">Profissionais e Salas</LearnChip>
                        <LearnChip topicId="convenios">Atendimento por convênio</LearnChip>
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
                    criar, editar e apagar). Cinco abas:{" "}
                    <strong className="text-foreground">Equipe Comercial</strong> (quem usa o sistema),{" "}
                    <strong className="text-foreground">Profissionais</strong> (quem atende os clientes),{" "}
                    <strong className="text-foreground">Salas</strong> (as agendas),{" "}
                    <strong className="text-foreground">Convênios</strong> (planos atendidos) e{" "}
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
            <TopicSection id="profissionais-salas" index={3} icon={Stethoscope} title="Profissionais e Salas"
                subtitle="Quem atende × onde a agenda acontece">
                <p className="text-sm text-muted-foreground">
                    São duas coisas diferentes, em duas abas. O <strong className="text-foreground">Profissional</strong> é a
                    pessoa que atende (nome, foto e cargo). A <strong className="text-foreground">Sala</strong> é a agenda: é
                    nela que os agendamentos são marcados e é ela que aparece como coluna na Agenda.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border p-3.5">
                        <p className="text-sm font-semibold">Sala do profissional</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Criada <strong>automaticamente</strong> ao cadastrar o profissional, com o mesmo nome e os
                            horários informados no cadastro. Renomear o profissional renomeia a sala (e vice-versa).
                        </p>
                    </div>
                    <div className="rounded-xl border p-3.5">
                        <p className="text-sm font-semibold">Sala avulsa</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Criada pelo botão <strong>Adicionar Sala</strong>, na aba Salas. Não pertence a ninguém: serve para
                            ambientes que atendem com qualquer profissional disponível (sala de laser, sala de procedimentos).
                        </p>
                    </div>
                </div>
                <StepByStep steps={[
                    { title: "Cadastre o profissional", description: "Aba Profissionais > Adicionar Profissional. Informe nome, cargo, foto e os dias/horários de atendimento. A sala dele nasce junto — você não precisa criar nada na aba Salas." },
                    { title: "Vincule aos serviços", description: "Em Serviços, cada serviço define quais salas o executam. É esse vínculo que faz a sala aparecer como opção ao agendar e para a IA." },
                    { title: "Crie salas avulsas se precisar", description: "Aba Salas > Adicionar Sala, com nome e horários próprios. Ela entra na Agenda como mais uma coluna." },
                    { title: "Inative em vez de excluir", description: "A chave Ativo/Ativa tira a agenda de circulação sem apagar nada — o histórico e os relatórios continuam completos." },
                ]} />
                <Callout type="atencao" title="Inativar cancela os agendamentos futuros">
                    Ao desligar a chave, o sistema avisa quantos agendamentos futuros existem e, se você confirmar, todos eles
                    passam para <strong>cancelado</strong>. O que já aconteceu é preservado. A sala de um profissional não é
                    inativada sozinha: desligue o profissional e a sala dele acompanha.
                </Callout>
                <Callout type="atencao" title="Não dá para excluir com agenda marcada">
                    A exclusão é bloqueada enquanto houver <strong>agendamentos futuros</strong> na sala — cancele ou reagende
                    antes. Excluir o profissional exclui a sala dele junto; salas de profissional não são excluídas pela aba
                    Salas.
                </Callout>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/equipe?tab=profissionais")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Abrir Profissionais
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate("/equipe?tab=salas")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Abrir Salas
                    </Button>
                </div>
            </TopicSection>

            {/* 4 */}
            <TopicSection id="convenios" index={4} icon={HeartHandshake} title="Convênios"
                subtitle="Quais planos a clínica atende, em quais serviços, salas e horários">
                <p className="text-sm text-muted-foreground">
                    Na aba <strong className="text-foreground">Convênios</strong> você cadastra os planos atendidos. O que
                    for configurado aqui é o que a <strong className="text-foreground">IA</strong>, o{" "}
                    <strong className="text-foreground">link público de agendamento</strong> e as{" "}
                    <strong className="text-foreground">APIs</strong> usam para oferecer horário de convênio. Marcar a
                    agenda manualmente continua livre: nada disso te impede de encaixar um paciente.
                </p>
                <StepByStep steps={[
                    { title: "Crie o convênio", description: "Aba Convênios > Adicionar Convênio. Informe o nome (ex.: Unimed) e, se quiser, uma descrição — ela é enviada junto para a IA (útil para regras do tipo 'somente titular' ou 'consulta com coparticipação')." },
                    { title: "Marque os serviços atendidos", description: "No mesmo modal, um seletor por categoria: expanda a pasta e marque os serviços. Marcar a categoria seleciona todos de uma vez. Esses serviços passam a ser apresentados à IA com a observação (apto para convênio)." },
                    { title: "Marque as salas que atendem", description: "Ainda no modal, escolha quais salas recebem esse convênio. Uma sala só aparece na lista se estiver com o Atendimento de Convênio ligado no cadastro dela." },
                    { title: "Defina os dias e horários dedicados", description: "No cadastro da sala (aba Salas ou Profissionais), logo abaixo dos Dias de Atendimento, ligue Atendimento de Convênio e escolha os dias e a faixa de início e fim reservada para convênio. Dá para configurar horário individual por dia." },
                ]} />
                <Callout type="atencao" title="O horário de convênio sai das buscas normais">
                    A faixa reservada deixa de ser oferecida no atendimento particular: quando a IA ou o link público
                    procuram horário comum, esses intervalos são pulados; quando a busca é de convênio, só aparecem esses
                    intervalos e só nas salas marcadas para aquele plano. É assim que você garante que o horário
                    reservado não seja ocupado por outro paciente.
                </Callout>
                <Callout type="dica" title="Habilitar todos os convênios">
                    Se a clínica aceita qualquer plano, ligue a chave{" "}
                    <strong>Habilitar todos os convênios</strong> no topo da aba. A IA passa a responder
                    "Habilitado para todos os convênios" em vez de listar nomes (a descrição, se houver, vai junto), e a
                    lista cadastrada fica guardada sem ser usada. Os serviços e salas continuam sendo configurados
                    normalmente pelo botão Configurar.
                </Callout>
                <Callout type="pratica" title="Exemplo: Unimed nas terças e quintas à tarde">
                    Cadastre o convênio Unimed, marque as consultas atendidas, marque a sala da Dra. Ana e, no cadastro
                    dessa sala, ligue Atendimento de Convênio nas terças e quintas das 14h às 16h. Resultado: quem procura
                    horário particular nunca recebe 14h-16h dessas duas datas, e quem procura Unimed só recebe esses
                    horários — na sala da Dra. Ana.
                </Callout>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/equipe?tab=convenios&tour=convenio-cadastrar")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
                    </Button>
                </div>
            </TopicSection>

            {/* 5 */}
            <TopicSection id="convidando" index={5} icon={UserPlus} title="Convidando membros"
                subtitle="Da recepção ao sistema em 2 minutos">
                <StepByStep steps={[
                    { title: "Adicionar membro", description: "Na aba Equipes, informe nome, e-mail e papel. A pessoa recebe um e-mail de convite com o login, a senha provisória e o cargo — e já entra na conta da clínica." },
                    { title: "Escolha o papel com calma", description: "O papel define o alcance (veja o tópico anterior). Supervisor com acesso financeiro vê a aba Vendas; sem, não." },
                    { title: "Se for Agente, defina o escopo", description: <>Aparecem três campos extras: <strong>Instâncias liberadas</strong>, <strong>Filas atribuídas</strong> e <strong>Tags visíveis</strong>. Marque o que ele pode ver — ou deixe "Todas" para não restringir (próximo tópico).</>, },
                    { title: "Desativar quando sair", description: "Funcionário saiu? Remova/desative o membro — o histórico de atendimentos dele permanece registrado." },
                ]} />
                <Callout type="atencao" title="Nunca compartilhe um login">
                    Cada pessoa com seu acesso: é isso que permite saber quem atendeu cada conversa, medir tempos por
                    atendente e desligar acessos individualmente sem trocar senha de todo mundo.
                </Callout>
                <Callout type="dica" title="O convite não chegou?">
                    Confira a caixa de spam por <strong>nao-responda@clinbia.ai</strong> e se o e-mail foi digitado
                    corretamente. Se preferir, passe a senha provisória por outro canal: o cadastro funciona mesmo que o
                    e-mail falhe, e o sistema pede a troca da senha no primeiro acesso.
                </Callout>
            </TopicSection>

            {/* 6 */}
            <TopicSection id="escopo" index={6} icon={ScanEye} title="Escopo de visão do Atendente"
                subtitle="Quais conexões, filas e tags cada agente enxerga">
                <p className="text-sm text-muted-foreground">
                    Agentes podem ter a visão <strong className="text-foreground">limitada por três filtros</strong>, definidos
                    ao criar ou editar o membro (e visíveis nas colunas da tabela de membros):
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
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
                    <div className="rounded-xl border p-3.5">
                        <p className="text-sm font-semibold">Tags visíveis</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Quais tags o agente pode ver: ele só enxerga conversas de contatos que tenham ao menos uma das tags
                            marcadas — contatos <strong>sem tag nenhuma ficam ocultos</strong>. "Todas" = sem restrição.
                        </p>
                    </div>
                </div>
                <p className="text-sm text-muted-foreground">
                    Os três filtros funcionam <strong className="text-foreground">juntos (E, não OU)</strong>: o agente só
                    enxerga a conversa se a conexão dela estiver liberada, a fila dela estiver atribuída{" "}
                    <strong className="text-foreground">e</strong> o contato tiver uma tag visível. O escopo vale para o{" "}
                    <strong className="text-foreground">Inbox, o CRM (kanban e monitoramento) e os números do Dashboard</strong>{" "}
                    — a página Clientes continua mostrando todos os contatos da conta.
                </p>
                <Callout type="dica" title="Tag de campanha excluída? A restrição se desfaz sozinha">
                    Quando uma campanha encerra, a tag dela é excluída do sistema. Tags excluídas são ignoradas no escopo — se
                    <strong> nenhuma</strong> das tags marcadas para o agente existir mais, ele volta automaticamente a ver
                    todas as conversas, sem precisar editar o membro.
                </Callout>
                <Callout type="pratica" title="Exemplo: clínica com 2 números">
                    A recepcionista da unidade A recebe só a instância "Número Unidade A" e as filas Atendimento Humano e
                    Suporte. Pronto: ela não vê (nem é notificada sobre) conversas da unidade B ou do Financeiro — menos ruído,
                    mais foco.
                </Callout>
                <Callout type="atencao" title="O escopo também controla as transferências">
                    No inbox, o botão <strong>Transferir Atendimento</strong> só lista atendentes cujo escopo cobre a fila
                    escolhida, a conexão da conversa e as tags do contato. Se um agente "sumiu" da lista de transferência,
                    confira o escopo dele aqui. Admins e supervisores nunca são filtrados.
                </Callout>
            </TopicSection>

            {/* 7 */}
            <TopicSection id="permissoes" index={7} icon={SlidersHorizontal} title="Permissões finas"
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
                <p className="text-sm text-muted-foreground">
                    Logo abaixo da lista de módulos existe a subcategoria{" "}
                    <strong className="text-foreground">Abas do Dashboard</strong>: uma chave de{" "}
                    <strong className="text-foreground">Acesso</strong> por aba (Minha Conta, Monitoramento, CRM, Vendas,
                    Agendamentos, Campanhas, Recorrência e Satisfação). É por aqui que você libera abas do Dashboard para
                    Atendentes — antes eles só enxergavam o CRM.
                </p>
                <Callout type="atencao" title="Sem nenhuma aba, o Dashboard some">
                    Se você desligar todas as abas de um nível, a página Dashboard desaparece do menu dessa pessoa.
                    Quem abrir um link direto para uma aba bloqueada cai automaticamente na primeira aba liberada.
                    Minha Conta (custos de IA e Meta) vem desligada para Supervisor e Agente — ligue só se quiser
                    expor os valores da conta.
                </Callout>
            </TopicSection>

            {/* 8 */}
            <TopicSection id="online" index={8} icon={Wifi} title="Quem está online"
                subtitle="O termômetro da operação em tempo real">
                <p className="text-sm text-muted-foreground">
                    O Dashboard (aba Monitoramento) mostra o <strong className="text-foreground">status online</strong> de
                    cada membro: quem está com o sistema aberto e ativo nos últimos 2 minutos aparece como disponível.
                    Junto com o atendente responsável de cada conversa, você enxerga a distribuição de carga da equipe.
                </p>
            </TopicSection>

            {/* 9 */}
            <TopicSection id="faq" index={9} icon={HelpCircle} title="Perguntas frequentes">
                <Accordion type="single" collapsible className="rounded-xl border px-4">
                    {[
                        {
                            q: "Um supervisor ou agente não vê a aba Vendas do Dashboard.",
                            a: "Vá em Equipe > Permissões, abra o bloco do nível e ligue 'Vendas' na subcategoria Abas do Dashboard. Cada aba do Dashboard tem a própria chave de Acesso.",
                        },
                        {
                            q: "Quero que o atendente veja Monitoramento e Agendamentos no Dashboard.",
                            a: "Equipe > Permissões > bloco Agente > subcategoria Abas do Dashboard: ligue Monitoramento e Agendamentos, salve e peça para a pessoa recarregar a página.",
                        },
                        {
                            q: "O agente diz que 'não tem o botão' de apagar/editar.",
                            a: "É o esperado: sem a permissão fina, o botão nem aparece. Ajuste em Equipe > Permissões e peça para a pessoa recarregar a página.",
                        },
                        {
                            q: "A sala não aparece na lista de salas do convênio.",
                            a: "Só aparecem salas com o Atendimento de Convênio ligado. Abra o cadastro da sala (ou do profissional dono dela), ligue a chave Atendimento de Convênio, marque os dias e a faixa de horário e salve — ela passa a aparecer no modal do convênio.",
                        },
                        {
                            q: "A IA não está oferecendo o horário de convênio.",
                            a: "Confira os quatro elos: o convênio existe na aba Convênios, o serviço está marcado nele, a sala está marcada nele, e essa sala tem dias/horário de convênio configurados. Faltando qualquer um, a busca de convênio volta vazia. Lembre que a faixa de convênio precisa estar dentro do expediente da sala — o que ficar fora do horário de atendimento é ignorado.",
                        },
                        {
                            q: "Um agente não enxerga conversas/cards que o admin vê.",
                            a: "Primeira coisa a conferir: se a conversa está atribuída a OUTRO atendente — atendimento atribuído é exclusivo do responsável (nenhum outro atendente vê; admins e supervisores veem tudo). Depois, o escopo de visão dele (colunas Instâncias liberadas e Filas atribuídas na aba Equipes). Se a conversa está numa conexão ou fila fora do escopo, é o comportamento esperado. Escopo em 'Todas' e mesmo assim faltando dados? Confirme que o membro foi convidado pela página Equipe (e não criou conta avulsa própria); persistindo, acione o suporte Clinvia.",
                        },
                        {
                            q: "Como restrinjo um atendente a um único número ou setor?",
                            a: "Edite o membro na aba Equipes e marque, em Instâncias liberadas, Filas atribuídas e Tags visíveis, apenas o que ele deve ver. A restrição só existe para Agentes — supervisores e admins sempre veem tudo.",
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
