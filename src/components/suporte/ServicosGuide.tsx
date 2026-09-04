import { useNavigate } from "react-router-dom";
import {
    Package, GitBranch, FolderPlus, PlusCircle, UserCheck, CircleDollarSign,
    HelpCircle, ExternalLink, Repeat, LayoutTemplate, HeartHandshake,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Callout, LearnChip, StepByStep, SubNav, TopicSection } from "./blocks";
import { HierarchyExplorer } from "./simulators-servicos";

// ---------------------------------------------------------------------------
// Manual da página Serviços (/products-services)
// ---------------------------------------------------------------------------

const TOPICS = [
    { id: "o-que-e", label: "O que é" },
    { id: "hierarquia", label: "A hierarquia" },
    { id: "templates", label: "Utilizar templates" },
    { id: "adicionando", label: "Adicionando" },
    { id: "categorias-proprias", label: "Categorias próprias" },
    { id: "profissionais", label: "Profissionais vinculados" },
    { id: "precos", label: "Preços" },
    { id: "convenio", label: "Aba Convênio" },
    { id: "recorrencia", label: "Mensagens de recorrência" },
    { id: "faq", label: "FAQ" },
];

export function ServicosGuide() {
    const navigate = useNavigate();

    return (
        <div className="space-y-8">
            {/* Hero */}
            <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <Package className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Manual de Serviços</h1>
                        <p className="text-sm text-muted-foreground">
                            O catálogo da clínica: a fonte de verdade de preços e procedimentos para a IA, a Agenda, as vendas e o CRM.
                        </p>
                    </div>
                </div>
                <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        O que você vai aprender
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <LearnChip topicId="hierarquia">Categoria → Serviço → Aplicação</LearnChip>
                        <LearnChip topicId="templates">Catálogo pronto em 1 clique</LearnChip>
                        <LearnChip topicId="adicionando">Montar o catálogo em minutos</LearnChip>
                        <LearnChip topicId="profissionais">Quem executa o quê</LearnChip>
                        <LearnChip topicId="precos">De onde a IA tira os preços</LearnChip>
                        <LearnChip topicId="convenio">Valor de convênio</LearnChip>
                    </div>
                </div>
            </div>

            <SubNav topics={TOPICS} />

            {/* 1 */}
            <TopicSection id="o-que-e" index={1} icon={Package} title="O que é a página Serviços?"
                subtitle="O catálogo que alimenta todo o resto">
                <p className="text-sm text-muted-foreground">
                    Tudo que a clínica vende mora aqui. E não é só uma lista: é daqui que a{" "}
                    <strong className="text-foreground">IA tira preços e durações</strong> para responder clientes, que a{" "}
                    <strong className="text-foreground">Agenda sabe quem executa cada procedimento</strong>, e que as{" "}
                    <strong className="text-foreground">vendas puxam o valor correto</strong>. Catálogo desatualizado =
                    IA respondendo errado.
                </p>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/products-services?tour=servicos-tour")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
                    </Button>
                </div>
            </TopicSection>

            {/* 2 */}
            <TopicSection id="hierarquia" index={2} icon={GitBranch} title="A hierarquia em 3 níveis"
                subtitle="Categoria → Serviço → Aplicação (a sua versão)">
                <HierarchyExplorer />
                <Callout type="atencao" title="A categoria Avaliação é especial">
                    Compras só de Avaliação classificam o contato como <strong>Lead</strong> (não Cliente), e o link público
                    de agendamento sempre oferece as avaliações. Por isso essa categoria é protegida — não renomeie nem
                    tente apagá-la.
                </Callout>
            </TopicSection>

            {/* 3 */}
            <TopicSection id="templates" index={3} icon={LayoutTemplate} title="Utilizar templates"
                subtitle="O catálogo pronto — o jeito mais rápido de começar">
                <p className="text-sm text-muted-foreground">
                    O botão azul <strong className="text-foreground">Utilizar templates</strong> abre um catálogo pronto
                    de categorias, serviços e aplicações (com preços, tempo de retorno e duração sugeridos). Tudo já vem{" "}
                    <strong className="text-foreground">marcado e editável</strong>: você desmarca o que a clínica não
                    oferece, ajusta o que quiser e importa de uma vez.
                </p>
                <StepByStep steps={[
                    { title: "Escolha como importar os nomes", description: "Na caixa do topo, decida entre MAIÚSCULAS ou Normal (só a primeira letra). Vale para categorias, serviços e aplicações — as descrições nunca são alteradas." },
                    { title: "Desmarque o que não usa", description: "As caixinhas são em cascata: desmarcar a categoria desmarca os serviços e aplicações dela; desmarcar todas as aplicações de um serviço desmarca o serviço. O contador do rodapé mostra quantas aplicações serão criadas." },
                    { title: "Renomeie categorias e serviços", description: "O lápis ao lado da categoria renomeia na hora, direto na linha. O lápis na aba do serviço abre a edição completa (nome, descrição e a aba Recorrência)." },
                    { title: "Ajuste a tabela de aplicações", description: "Nome, descrição, valor, preço mínimo, retorno (meses), tempo (minutos) e comissão (%) são campos livres. A comissão vem 0 — preencha se a clínica trabalha com comissionamento." },
                    { title: "Importar", description: "O botão do rodapé cria tudo de uma vez. Depois é só vincular os profissionais em cada aplicação." },
                ]} />
                <Callout type="atencao" title="Nada é substituído">
                    Se a clínica <strong>já tem</strong> a categoria ou o serviço cadastrado, o sistema{" "}
                    <strong>reaproveita o que existe</strong> e só acrescenta o que falta. Aplicação com o mesmo nome
                    dentro do mesmo serviço é ignorada — seus preços e vínculos atuais ficam intactos.
                </Callout>
                <Callout type="dica" title="Pode importar em partes">
                    Nada impede usar o botão várias vezes: importe hoje só as categorias que precisa e volte depois para
                    trazer as outras. O que já existe nunca duplica.
                </Callout>
            </TopicSection>

            {/* 4 */}
            <TopicSection id="adicionando" index={4} icon={PlusCircle} title="Adicionando serviços"
                subtitle="O caminho manual: Adicionar Serviço por Categoria">
                <StepByStep steps={[
                    { title: "Escolha a categoria", description: "O botão 'Adicionar Serviço por Categoria' abre a lista de categorias (modelos prontos + as suas)." },
                    { title: "Escolha os serviços", description: "Marque os procedimentos que a clínica oferece. Não achou? Use '+ Criar novo serviço' dentro da categoria." },
                    { title: "Personalize a aplicação", description: "Defina preço, duração e profissionais de cada um. Cada linha criada é uma aplicação SUA — os modelos são só ponto de partida." },
                    { title: "Ou importe em massa", description: "O botão Importar aceita planilha para montar o catálogo inteiro de uma vez." },
                ]} />
                <Callout type="dica" title="A página só mostra o que você tem">
                    Categorias sem nenhuma aplicação sua não aparecem na listagem — cadastrou a primeira aplicação, a
                    categoria surge com ela.
                </Callout>
            </TopicSection>

            {/* 5 */}
            <TopicSection id="categorias-proprias" index={5} icon={FolderPlus} title="Categorias próprias"
                subtitle="Quando os modelos prontos não bastam">
                <p className="text-sm text-muted-foreground">
                    O botão <strong className="text-foreground">Adicionar Categoria</strong> cria uma categoria exclusiva da
                    sua clínica (nome, descrição e tipo). O tipo <strong className="text-foreground">padrão</strong> usa a
                    hierarquia completa; o tipo <strong className="text-foreground">direto</strong> funciona como
                    Consultas/Avaliação — aplicações direto na categoria, sem o nível intermediário.
                </p>
                <Callout type="pratica" title="Exemplos reais">
                    "Harmonização Corporal" com vários procedimentos? Categoria padrão. "Retorno" ou "Sessão avulsa" que
                    não se subdivide? Categoria direta.
                </Callout>
            </TopicSection>

            {/* 6 */}
            <TopicSection id="profissionais" index={6} icon={UserCheck} title="Profissionais vinculados"
                subtitle="O vínculo que controla a Agenda e a IA">
                <p className="text-sm text-muted-foreground">
                    Cada aplicação lista <strong className="text-foreground">quais profissionais a executam</strong>. Esse
                    vínculo controla três coisas:
                </p>
                <StepByStep steps={[
                    { title: "Agenda", description: "Ao agendar aquele serviço, só aparecem os profissionais vinculados — impossível marcar botox com quem não aplica botox." },
                    { title: "IA e link público", description: "A IA só oferece horários dos profissionais vinculados ao serviço pedido; o link público idem." },
                    { title: "Filtro da grade", description: "O filtro por serviço na Agenda mostra só as colunas de quem executa aquele procedimento." },
                ]} />
                <Callout type="atencao" title='"O profissional não aparece para agendar"'>
                    Causa nº 1: ele não está vinculado à aplicação do serviço. Edite a aplicação aqui em Serviços e marque
                    o profissional — o vínculo mora na aplicação, não no cadastro do profissional.
                </Callout>
            </TopicSection>

            {/* 7 */}
            <TopicSection id="precos" index={7} icon={CircleDollarSign} title="Preços: uma fonte única"
                subtitle="O valor da aplicação manda em tudo">
                <p className="text-sm text-muted-foreground">
                    O preço cadastrado na aplicação é o que a <strong className="text-foreground">IA informa</strong>, o que
                    o <strong className="text-foreground">agendamento usa ao criar a venda</strong> e o que a{" "}
                    <strong className="text-foreground">negociação do CRM registra</strong>. Mudou a tabela de preços?
                    Atualize aqui — todos os canais passam a usar o valor novo na hora.
                </p>
                <Callout type="evite" title="Não quer a IA falando preço?">
                    Não resolva apagando o preço do catálogo (isso quebra vendas e agendamentos). Use as{" "}
                    <strong>Restrições</strong> na aba Empresa da IA: "não informe valores de X, direcione para avaliação".
                </Callout>
            </TopicSection>

            {/* 8 */}
            <TopicSection id="convenio" index={8} icon={HeartHandshake} title="Aba Convênio"
                subtitle="O mesmo catálogo, só com o que o plano cobre — e o valor cobrado nele">
                <p className="text-sm text-muted-foreground">
                    Quando a conta tem convênio cadastrado, a página ganha duas abas:{" "}
                    <strong className="text-foreground">Serviços regulares</strong> e{" "}
                    <strong className="text-foreground">Convênio</strong>. A aba Convênio tem exatamente a mesma cara da
                    outra — <strong className="text-foreground">categorias, serviços e a tabela de aplicações</strong> —
                    só que exibindo apenas o que está marcado em algum convênio. É a mesma tabela, não um cadastro
                    separado: o que você editar ali muda o serviço de verdade.
                </p>
                <StepByStep steps={[
                    { title: "Marque o serviço no convênio", description: "Equipe → Convênios → Configurar. A categoria Avaliação já entra sozinha em todo convênio — os demais serviços você marca ali." },
                    { title: "A coluna Valor convênio aparece", description: "Ao lado da coluna Valor, nas duas abas. Aplicação que não está em nenhum convênio mostra um traço." },
                    { title: "Edite a aplicação para definir o valor", description: "Lápis da aplicação → campo Valor de Convênio (R$). Enquanto ficar em branco, o valor exibido é o de venda (em cinza) e acompanha qualquer reajuste que você fizer na tabela normal." },
                ]} />
                <Callout type="atencao" title="A Avaliação sempre aparece nesta aba">
                    Todo convênio cadastrado cobre automaticamente os serviços da categoria <strong>Avaliação</strong> —
                    por isso ela aparece na aba Convênio mesmo que você não tenha marcado nada. Aproveite para conferir o
                    valor cobrado nela pelo plano.
                </Callout>
                <Callout type="atencao" title="O valor de convênio é um só">
                    Mesmo que a clínica atenda dez planos, a aplicação tem <strong>um único</strong> valor de convênio —
                    não existe preço por plano. Ele vale para todos os convênios em que aquele serviço está marcado.
                </Callout>
                <Callout type="dica" title="Não dá para criar nem apagar pela aba Convênio">
                    Ali a estrutura é espelho: você edita a aplicação e liga/desliga o status, mas criar e excluir
                    continua sendo feito na aba Serviços regulares — é lá que a aplicação realmente mora. Por isso os
                    botões de adicionar somem enquanto a aba Convênio está aberta.
                </Callout>
                <Callout type="pratica" title="O que a IA passa a responder">
                    Perguntas de convênio recebem o valor de convênio; perguntas de particular recebem o valor de venda. A
                    IA também só oferece, no modo convênio, os serviços marcados naquele plano — e cita quais
                    profissionais atendem por ele.
                </Callout>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/equipe?tab=convenios")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Abrir Convênios
                    </Button>
                </div>
            </TopicSection>

            {/* 9 */}
            <TopicSection id="recorrencia" index={9} icon={Repeat} title="Mensagens de recorrência"
                subtitle="Configuração por serviço + template padrão da conta">
                <p className="text-sm text-muted-foreground">
                    A recorrência é configurada <strong className="text-foreground">no serviço</strong> (não em cada
                    aplicação): clique no <strong className="text-foreground">lápis ao lado do nome do serviço</strong>{" "}
                    para abrir a edição com a aba <strong className="text-foreground">Recorrência</strong> — toggle de
                    ativação, tempos (dias), descontos e mensagens das 3 abordagens. Por padrão, todos os serviços com
                    recorrência ativa usam o <strong className="text-foreground">template padrão da conta</strong> (3
                    mensagens prontas: Prévia / Vencimento / Pós-vencimento, editáveis em Conexões → Templates → aba
                    Recorrência). Escrever mensagens aqui cria um{" "}
                    <strong className="text-foreground">template personalizado só deste serviço</strong>.
                </p>
                <StepByStep steps={[
                    { title: "Ative a recorrência do serviço", description: "Lápis ao lado do nome do serviço → aba Recorrência → toggle 'Recorrência ativa'. A configuração vale para todas as aplicações daquele serviço." },
                    { title: "Defina os tempos (dias)", description: "Quantos dias após o procedimento cada abordagem 1/2/3 deve ser enviada. Os campos são sempre manuais — sem valor, a abordagem não é agendada." },
                    { title: "Defina o desconto (%)", description: "Cada abordagem tem desconto opcional — ele vira o desconto da campanha e a variável {{desconto}} do texto." },
                    { title: "(Opcional) personalize as mensagens", description: "Cada abordagem já mostra o texto do template padrão da conta, com o selo 'Padrão da conta'. Clique em 'Editar só para este serviço' para escrever o seu — os chips de variáveis ({{nome_cliente}}, {{servico}}, {{preco}}, {{desconto}}, {{meses}}, {{data_procedimento}}...) inserem no cursor e variável fora do catálogo bloqueia o salvamento. O botão 'Voltar ao padrão da conta' desfaz a personalização." },
                ]} />
                <Callout type="atencao" title="Padrão da conta × template do serviço">
                    Editar em <strong>Conexões → Templates → Recorrência</strong> muda o{" "}
                    <strong>padrão de todos os serviços</strong>. Editar pelo lápis do serviço → aba Recorrência cria um
                    template <strong>só daquele serviço</strong> — os demais continuam no padrão. Enquanto a mensagem
                    ficar em branco (selo "Padrão da conta"), o serviço acompanha automaticamente qualquer mudança que
                    você fizer no padrão.
                </Callout>
                <Callout type="dica" title="Prévia em tempo real">
                    Abaixo do campo aparece uma prévia com dados de exemplo (Maria, Botox Full Face...) — confira como o
                    cliente vai receber antes de salvar.
                </Callout>
                <Callout type="atencao" title="API oficial (Meta)">
                    O template padrão da conta é enviado para aprovação da Meta automaticamente ao conectar a instância.
                    Ao clicar em <strong>Editar só para este serviço</strong>, um alerta avisa antes que{" "}
                    <strong>o template será encaminhado para aprovação da Meta</strong> (de alguns minutos até 24 horas,
                    com os disparos de recorrência deste serviço pausados nesse período; os outros serviços seguem
                    normais com o padrão da conta) — o selo ao lado do
                    nome do serviço mostra o status: <strong>aprovado</strong> (verde), <strong>pendente</strong> (âmbar)
                    ou <strong>negado</strong> (vermelho). Editou de novo? Nova versão é submetida e o selo volta a
                    pendente. Quem usa API não oficial recebe o texto livre com as variáveis substituídas (sem aprovação).
                </Callout>
            </TopicSection>

            {/* 10 */}
            <TopicSection id="faq" index={10} icon={HelpCircle} title="Perguntas frequentes">
                <Accordion type="single" collapsible className="rounded-xl border px-4">
                    {[
                        {
                            q: "Qual a diferença entre serviço e aplicação?",
                            a: "O serviço é o nome genérico ('Botox Full Face'); a aplicação é a SUA versão dele, com preço, duração e profissionais. O sistema inteiro (agenda, IA, vendas) trabalha com as aplicações.",
                        },
                        {
                            q: "Usei os templates e uma categoria minha já existia. Perdi algo?",
                            a: "Não. A importação reaproveita categorias e serviços que já existem e só cria o que falta. Aplicação com o mesmo nome dentro do mesmo serviço é ignorada — nenhum preço, duração ou vínculo de profissional seu é sobrescrito.",
                        },
                        {
                            q: "Cadastrei o serviço mas a IA não oferece. Por quê?",
                            a: "Confira: 1) a aplicação tem pelo menos um profissional vinculado? 2) a aplicação está ativa? 3) o profissional tem horário de trabalho configurado? Sem esses três, não há horário para oferecer.",
                        },
                        {
                            q: "Posso ter preços diferentes por profissional?",
                            a: "Crie aplicações separadas (ex.: 'Botox — Dra. Ana' e 'Botox — Dr. Caio'), cada uma com seu preço e seu profissional vinculado.",
                        },
                        {
                            q: "Mudei o preço. As vendas antigas mudam?",
                            a: "Não — vendas já registradas mantêm o valor da época. O preço novo vale para as próximas vendas, agendamentos e respostas da IA.",
                        },
                        {
                            q: "Por que não consigo apagar a categoria Avaliação?",
                            a: "Ela é estrutural: define quem é Lead e alimenta o link público de agendamento. É protegida contra renomear/apagar de propósito.",
                        },
                        {
                            q: "A coluna Valor convênio não aparece na tabela",
                            a: "Ela só existe quando a conta tem pelo menos um serviço marcado em algum convênio. Vá em Equipe → Convênios → Configurar e marque os serviços atendidos — a coluna aparece em seguida nas duas abas.",
                        },
                        {
                            q: "Não vejo as abas Serviços regulares e Convênio",
                            a: "Elas só aparecem quando existe pelo menos um convênio cadastrado em Equipe → Convênios. Sem convênio, a página continua com a lista única de categorias, como antes.",
                        },
                        {
                            q: "O valor de convênio está cinza. Está errado?",
                            a: "Não. Cinza significa que você ainda não digitou um valor próprio, então a aplicação está cobrando o mesmo valor de venda. Se a tabela particular for reajustada, o convênio acompanha. Digite um valor no campo 'Valor de Convênio (R$)' para congelar um preço só do convênio.",
                        },
                        {
                            q: "Sumiu uma categoria da listagem!",
                            a: "A página só exibe categorias com aplicações suas. Se todas as aplicações de uma categoria foram removidas/desativadas, ela some da lista — os dados não foram perdidos; cadastre uma aplicação e ela volta.",
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
