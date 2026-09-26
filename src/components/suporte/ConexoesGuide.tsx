import { useNavigate } from "react-router-dom";
import {
    Plug, Scale, QrCode, BadgeCheck, FileText, MessageSquareText, Gauge,
    ShieldAlert, HelpCircle, ExternalLink, Instagram,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Callout, LearnChip, StepByStep, SubNav, TopicSection } from "./blocks";
import { QualityTierDemo } from "./simulators-conexoes";

// ---------------------------------------------------------------------------
// Manual de Conexões (/whatsapp-connection)
// ---------------------------------------------------------------------------

const TOPICS = [
    { id: "o-que-e", label: "O que é" },
    { id: "provedores", label: "Oficial vs não oficial" },
    { id: "conectando", label: "Conectando" },
    { id: "templates", label: "Templates (Meta)" },
    { id: "mensagens-nao-oficiais", label: "Mensagens não oficiais" },
    { id: "qualidade", label: "Qualidade e limites" },
    { id: "restricoes", label: "Restrições" },
    { id: "faq", label: "FAQ" },
];

export function ConexoesGuide() {
    const navigate = useNavigate();

    return (
        <div className="space-y-8">
            {/* Hero */}
            <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <Plug className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Manual de Conexões</h1>
                        <p className="text-sm text-muted-foreground">
                            Os canais da clínica: WhatsApp oficial (Meta), WhatsApp não oficial e Instagram — como conectar, manter saudável e editar as mensagens automáticas.
                        </p>
                    </div>
                </div>
                <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        O que você vai aprender
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <LearnChip topicId="provedores">Oficial vs não oficial — qual usar</LearnChip>
                        <LearnChip topicId="templates">O que são templates aprovados</LearnChip>
                        <LearnChip topicId="qualidade">Selo de qualidade e limite diário</LearnChip>
                        <LearnChip topicId="restricoes">O que fazer quando a Meta restringe</LearnChip>
                    </div>
                </div>
            </div>

            <SubNav topics={TOPICS} />

            {/* 1 */}
            <TopicSection id="o-que-e" index={1} icon={Plug} title="O que é a página Conexões?"
                subtitle="Cada número/conta conectada é uma 'instância'">
                <p className="text-sm text-muted-foreground">
                    Aqui você conecta e monitora os canais por onde a clínica conversa:{" "}
                    <strong className="text-foreground">WhatsApp oficial (API da Meta)</strong>,{" "}
                    <strong className="text-foreground">WhatsApp não oficial (QR code)</strong> e{" "}
                    <strong className="text-foreground">Instagram Direct</strong>. Pode ter vários ao mesmo tempo — todos
                    desembocam no mesmo inbox. As abas <strong className="text-foreground">Templates</strong> e{" "}
                    <strong className="text-foreground">Mensagens API não oficial</strong> aparecem conforme o que você
                    tem conectado.
                </p>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/whatsapp-connection?tour=conexoes-tour")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
                    </Button>
                </div>
            </TopicSection>

            {/* 2 */}
            <TopicSection id="provedores" index={2} icon={Scale} title="Oficial vs não oficial"
                subtitle="A decisão mais importante da página">
                <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full min-w-[560px] text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                                <th className="p-2.5 font-semibold"></th>
                                <th className="p-2.5 font-semibold">WhatsApp Oficial (Meta)</th>
                                <th className="p-2.5 font-semibold">WhatsApp não oficial</th>
                            </tr>
                        </thead>
                        <tbody className="[&_td]:p-2.5 [&_tr]:border-b last:[&_tr]:border-b-0 text-muted-foreground">
                            <tr><td className="font-medium text-foreground">Conexão</td><td>Login Facebook (sem celular ligado)</td><td>QR code, como o WhatsApp Web</td></tr>
                            <tr><td className="font-medium text-foreground">Estabilidade</td><td>Alta — infra da própria Meta</td><td>Depende da sessão; pode desconectar</td></tr>
                            <tr><td className="font-medium text-foreground">Iniciar conversa</td><td>Só com template aprovado (fora da janela 24h)</td><td>Texto livre, sempre</td></tr>
                            <tr><td className="font-medium text-foreground">Campanhas</td><td>Template aprovado + limite de tier</td><td>Texto livre, sem custo Meta</td></tr>
                            <tr><td className="font-medium text-foreground">Editar/apagar msg</td><td>Não existe na API</td><td>Sim</td></tr>
                            <tr><td className="font-medium text-foreground">Risco de banimento</td><td>Baixo (regras claras)</td><td>Existe — evite spam pesado</td></tr>
                        </tbody>
                    </table>
                </div>
                <Callout type="dica" title="Combinação comum">
                    Número oficial para campanhas e mensagens automáticas (confiabilidade e métricas) + número não oficial
                    para o dia a dia da equipe. O selo azul no card indica a instância oficial.
                </Callout>
            </TopicSection>

            {/* 3 */}
            <TopicSection id="conectando" index={3} icon={QrCode} title="Conectando cada canal"
                subtitle="Três fluxos, todos guiados">
                <StepByStep steps={[
                    { title: "WhatsApp não oficial", description: "Nova conexão > escaneie o QR code com o celular (Aparelhos conectados). Se o card ficar 'desconectado', basta reconectar pelo mesmo botão." },
                    { title: "WhatsApp oficial (Meta)", description: "Botão de conexão Meta > login no Facebook da empresa > escolha/crie o número. O sistema registra e verifica tudo sozinho — e AVISA no card se algo ficou pendente." },
                    { title: "Instagram", description: "Conecte a conta profissional via login Meta. As DMs caem no inbox como um canal próprio, com o número informado pela IA para contato configurável no card.", icon: Instagram },
                ]} />
                <Callout type="dica" title="A fila do Instagram é automática (igual à do WhatsApp)">
                    A conta do Instagram <strong>não escolhe fila</strong>. Um Direct novo cai em{" "}
                    <strong>Atendimento IA</strong> quando o switch geral da IA <em>e</em> o switch da IA{" "}
                    <strong>daquela conta</strong> estão ligados; se qualquer um dos dois estiver desligado, cai em{" "}
                    <strong>Atendimento Humano</strong>. Desligar a IA da conta devolve na hora as conversas abertas dela
                    para a fila humana.
                </Callout>
                <Callout type="atencao" title="Instagram: escolha o “Número informado pela IA para contato”">
                    No card de cada conta do Instagram há o campo <strong>Número informado pela IA para contato</strong>, onde você aponta uma
                    das suas conexões de WhatsApp. Ele serve para duas coisas:
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                        <li>A IA passa a ter o <strong>link direto do WhatsApp</strong> daquele número para mandar ao
                            cliente que chamou no Direct.</li>
                        <li>É a conexão em que o <strong>agendamento pelo link</strong> feito por um cliente do Instagram
                            é registrado.</li>
                    </ul>
                    <p className="mt-2">
                        Sem esse campo preenchido, a IA <strong>não consegue gerar link de agendamento</strong> para
                        conversas do Instagram.
                    </p>
                </Callout>
                <Callout type="dica" title="Por que o link do Instagram pede nome e telefone">
                    O Instagram não informa o telefone de quem manda DM — o contato nasce só com o @ do cliente. Por isso,
                    o link de agendamento enviado numa conversa do Direct abre pedindo <strong>nome completo e
                    telefone</strong> (com máscara <strong>55 (DDD) 9 XXXX-XXXX</strong>) antes de mostrar qualquer coisa.
                    Com o telefone confirmado, o sistema encontra (ou cria) o contato de WhatsApp, atualiza o nome com o
                    que o cliente digitou, amarra o perfil do Instagram a ele e registra o agendamento{" "}
                    <strong>sempre no contato de WhatsApp</strong>, nunca no do Instagram.
                </Callout>
                <Callout type="dica" title="Caiu? Você é avisado por e-mail">
                    Além da notificação dentro do sistema, quando uma conexão perde o WhatsApp o dono da conta recebe um
                    e-mail com o nome do número e o passo a passo para reconectar. Para não virar enxurrada, é no máximo
                    um aviso a cada 24h por conexão.
                </Callout>
                <Callout type="atencao" title="Card conectado ≠ tudo certo (Meta)">
                    No número oficial, o sistema verifica automaticamente registro, assinatura de webhook e status do nome
                    de exibição a cada visita à página — problemas aparecem como badge no card com os passos de correção.
                </Callout>
            </TopicSection>

            {/* 4 */}
            <TopicSection id="templates" index={4} icon={FileText} title="Templates (número oficial)"
                subtitle="Mensagens pré-aprovadas pela Meta">
                <p className="text-sm text-muted-foreground">
                    Fora da janela de 24h (após a última mensagem do cliente), o número oficial{" "}
                    <strong className="text-foreground">só envia templates aprovados pela Meta</strong>. Na aba Templates
                    você cria, edita e acompanha o status de cada um (Pendente → Aprovado/Rejeitado).
                </p>
                <StepByStep steps={[
                    { title: "Três abas por tipo", description: "A lista é dividida em Templates Personalizados (criados por você), Automáticos (confirmação/lembrete/pesquisa) e Recorrência (mensagens de recorrência dos serviços). As mesmas abas aparecem nos modais de envio de template (nova mensagem e chat)." },
                    { title: "Crie com variáveis", description: "Use {{1}}, {{2}} para os campos dinâmicos (nome, data...). A Meta avalia em minutos a algumas horas." },
                    { title: "Cabeçalho: 5 formatos", description: "No campo Cabeçalho escolha Sem cabeçalho, Texto, Imagem (JPG/PNG até 5 MB), Vídeo (MP4 até 16 MB), Documento (PDF até 100 MB) ou Localização (latitude, longitude, nome e endereço). O arquivo ou o ponto do mapa é FIXO: vai igual em TODOS os envios daquele template — para trocar, edite o template e envie o novo arquivo (volta para revisão da Meta)." },
                    { title: "Botões: 4 tipos", description: "Até 10 botões por template: Resposta rápida (o cliente responde com um toque), Abrir link (URL fixa), Ligar (telefone fixo) e Copiar código (um cupom fixo que o cliente copia com um toque). A Meta permite no máximo 2 de link, 1 de telefone e 1 de cupom; cada texto tem até 25 caracteres e não pode repetir." },
                    { title: "Templates do sistema", description: "Confirmação, lembrete e pesquisa de satisfação são criados automaticamente (badge azul 'Template Automatizado'). Você pode editar o texto — os botões de resposta, não." },
                    { title: "Ligue/desligue por template", description: "Cada template automatizado tem um switch — desligado, aquela mensagem automática não é enviada." },
                    { title: "Dá para editar em revisão", description: "O botão Editar aparece também enquanto o template está Pendente — se você percebeu o erro logo depois de enviar, corrija na hora. A revisão recomeça do zero com o texto novo." },
                ]} />
                <Callout type="atencao" title="Categoria não se muda depois de criar">
                    Marketing, Utilidade e Autenticação são definidos na criação e a Meta não aceita trocar depois — nem
                    enquanto o template está pendente. Para corrigir a categoria é preciso criar outro template, com outro
                    nome, e apagar o antigo. Isso pesa: Marketing pode ser bloqueado pelo cliente (opt-out) e é freado
                    quando a qualidade do número cai, enquanto Utilidade, além de mais barato, passa nessas duas situações.
                </Callout>
                <Callout type="atencao" title="Cabeçalho de mídia some da campanha se o arquivo não estiver salvo">
                    O arquivo que a Meta aprova serve só para a aprovação — em cada disparo o sistema reenvia a mídia salva
                    no template. Se o arquivo (ou a localização, ou o cupom) não estiver gravado, o template nem aparece na
                    lista de campanhas, porque a Meta recusaria o envio.
                </Callout>
                <Callout type="evite" title="Rejeitado? Não insista igual">
                    A Meta rejeita textos com cara de spam, promessas exageradas ou categoria errada. Ajuste o texto antes de
                    reenviar — rejeições repetidas pesam contra o número. Limites da Meta: 1 edição/24h, 10 edições/30 dias.
                </Callout>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline"
                        onClick={() => navigate("/whatsapp-connection?tab=templates&tour=conexoes-templates")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
                    </Button>
                </div>
            </TopicSection>

            {/* 5 */}
            <TopicSection id="mensagens-nao-oficiais" index={5} icon={MessageSquareText} title="Mensagens API não oficial"
                subtitle="As mesmas automações, sem aprovação">
                <p className="text-sm text-muted-foreground">
                    Para conexões não oficiais, as mensagens automáticas (confirmação, lembrete, pesquisa) são{" "}
                    <strong className="text-foreground">texto livre</strong> — a aba "Mensagens API não oficial" deixa você
                    editar cada texto com variáveis como {"{{nome_cliente}}"} e {"{{data}}"}, com efeito imediato e switch
                    independente por mensagem.
                </p>
                <Callout type="dica" title="Dois textos, o mesmo fluxo">
                    Se você tem os dois provedores, o texto Meta (template) e o texto não oficial são editados separadamente
                    — o sistema escolhe sozinho qual usar conforme o número que envia.
                </Callout>
                <Callout type="atencao" title="A confirmação não cita mais o profissional">
                    O sistema só guarda o nome da <strong>sala</strong> do agendamento. Em sala avulsa ("Sala 2",
                    "Consultório 1") o paciente recebia "procedimento de Botox <strong>com Sala 2</strong>", então a variável
                    saiu: a confirmação de 24h usa nome do cliente, horário, clínica e serviço. No WhatsApp{" "}
                    <strong>oficial</strong>, isso vale para os templates enviados à aprovação a partir de agora — números já
                    conectados continuam com o template que a Meta aprovou, e para trocar é preciso editá-lo na aba Templates.
                </Callout>
            </TopicSection>

            {/* 6 */}
            <TopicSection id="qualidade" index={6} icon={Gauge} title="Qualidade e limites (Meta)"
                subtitle="O selo do número e o tier diário">
                <p className="text-sm text-muted-foreground">
                    O card da instância oficial mostra o <strong className="text-foreground">selo de qualidade</strong>{" "}
                    (<span className="text-emerald-600 font-medium">verde</span> = saudável,{" "}
                    <span className="text-amber-600 font-medium">amarelo</span> = clientes bloqueando/denunciando,{" "}
                    <span className="text-red-600 font-medium">vermelho</span> = risco de restrição) e o{" "}
                    <strong className="text-foreground">tier</strong>: quantos contatos únicos você pode iniciar em 24h.
                </p>
                <QualityTierDemo />
            </TopicSection>

            {/* 7 */}
            <TopicSection id="restricoes" index={7} icon={ShieldAlert} title="Restrições da Meta"
                subtitle="Quando o número é penalizado — e como sair">
                <StepByStep steps={[
                    { title: "Onde aparece", description: "Badge âmbar no card da instância (com os passos de correção), alerta no painel de Qualidade Meta, aviso no assistente de campanhas e um e-mail para o dono da conta — nunca passa despercebido." },
                    { title: "Causa típica", description: "Nome de exibição recusado pela Meta ou qualidade vermelha por excesso de denúncias/bloqueios de clientes." },
                    { title: "Como resolver", description: "Siga os passos do badge (ex.: corrigir o nome de exibição no Gerenciador da Meta). Qualidade se recupera sozinha com dias de bom uso: menos volume, mais relevância." },
                ]} />
                <Callout type="atencao" title="Prevenção vale mais">
                    Restrição quase sempre nasce de campanha agressiva: base fria, volume acima do tier, texto spam. Use o
                    aviso de 7 dias (não repetir contato) e confira o painel de qualidade ANTES de cada disparo grande.
                </Callout>
            </TopicSection>

            {/* 8 */}
            <TopicSection id="faq" index={8} icon={HelpCircle} title="Perguntas frequentes">
                <Accordion type="single" collapsible className="rounded-xl border px-4">
                    {[
                        {
                            q: "O WhatsApp não oficial desconectou sozinho. E agora?",
                            a: "Acontece (troca de senha, celular sem internet, limpeza de aparelhos conectados). Reconecte pelo QR code no card. Mensagens recebidas durante a queda não são recuperadas — por isso números críticos merecem a API oficial.",
                        },
                        {
                            q: "Respondo pelo celular no número oficial. As mensagens aparecem no sistema?",
                            a: "Sim — o modo coexistência traz para o inbox as mensagens enviadas pelo app WhatsApp Business do próprio número. Se não estiverem aparecendo, avise o suporte para reativar a assinatura de eventos.",
                        },
                        {
                            q: "Posso usar o mesmo número como oficial e não oficial?",
                            a: "Não — o cadastro na API oficial desliga o número do app comum (exceto no modo coexistência). Trate como caminhos distintos: um número por provedor.",
                        },
                        {
                            q: "Apareceu 'Register endpoint is not available for SMB businesses' ao conectar o número oficial.",
                            a: "Esse aviso vem da Meta quando o número escolhido é de coexistência (continua ativo no app WhatsApp Business). Nesses casos a própria Meta já registra o número e bloqueia a etapa de registro — o sistema agora pula essa etapa sozinho. Se o erro reaparecer, atualize o app WhatsApp Business (mínimo 2.24.17) e refaça o cadastro até o fim, sem fechar a janela da Meta.",
                        },
                        {
                            q: "A IA não manda link de agendamento nas conversas do Instagram.",
                            a: "Falta preencher o campo \"Número informado pela IA para contato\" no card da conta do Instagram (aba Instagram desta página). O Instagram não informa o telefone do cliente, então o link precisa saber em qual conexão de WhatsApp o agendamento será registrado. Escolha o número e a IA volta a enviar o link — e também o link direto de WhatsApp para o cliente falar com a clínica.",
                        },
                        {
                            q: "Cliente do Instagram agendou pelo link. Em que contato isso foi parar?",
                            a: "No contato de WhatsApp, sempre. Antes de mostrar a agenda, o link pede nome completo e telefone (máscara 55 (DDD) 9 XXXX-XXXX). Com o telefone, o sistema procura o contato de WhatsApp pelos últimos 8 dígitos, cria se não existir, atualiza o nome com o que o cliente digitou e vincula o perfil do Instagram a esse contato. O contato do Instagram nunca recebe o agendamento.",
                        },
                        {
                            q: "Minha conexão sumiu da lista 'Conexões' do menu lateral.",
                            a: "Essa lista do rodapé do menu mostra apenas as conexões online, de WhatsApp e de Instagram. Se a sua não está lá, ela caiu: abra Conexões e reconecte (QR, no caso do número não oficial). O status completo, incluindo o que está desconectado, fica sempre nesta página.",
                        },
                        {
                            q: "Uma conexão sumiu da própria tela de Conexões. Perdi as conversas dela?",
                            a: "Não. Quando o número deixa de existir no provedor (foi apagado lá), o cadastro dele sai desta tela, das listas de escolha e do aviso vermelho de desconexão — não há o que reconectar. Tudo o que passou por ele continua no lugar: conversas, histórico de atendimentos, campanhas e agendamentos antigos seguem aparecendo com o nome da conexão. O nome também fica reservado: ao criar uma conexão nova, escolha um nome diferente, senão o sistema recusa para não misturar as mensagens das duas.",
                        },
                        {
                            q: "Meu template está 'Pendente' há horas. É normal?",
                            a: "Sim, a aprovação leva de minutos a algumas horas (raramente mais). Campanhas com número oficial só disparam com template Aprovado — o sistema segura e avisa.",
                        },
                        {
                            q: "O que é a 'instância primária de automações'?",
                            a: "O número escolhido para enviar confirmações/lembretes/pesquisas quando você tem várias conexões (Configurações > Automações). Prefira uma instância Meta — escolher não oficial exibe um alerta de risco.",
                        },
                        {
                            q: "Qualidade caiu para amarelo. Paro tudo?",
                            a: "Pause campanhas grandes por alguns dias e mantenha só conversas 1-a-1 e automações essenciais. Amarelo se recupera; insistir em volume no amarelo é o caminho para o vermelho e restrições.",
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
