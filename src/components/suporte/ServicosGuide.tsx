import { useNavigate } from "react-router-dom";
import {
    Package, GitBranch, FolderPlus, PlusCircle, UserCheck, CircleDollarSign,
    HelpCircle, ExternalLink,
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
    { id: "adicionando", label: "Adicionando" },
    { id: "categorias-proprias", label: "Categorias próprias" },
    { id: "profissionais", label: "Profissionais vinculados" },
    { id: "precos", label: "Preços" },
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
                        <LearnChip topicId="adicionando">Montar o catálogo em minutos</LearnChip>
                        <LearnChip topicId="profissionais">Quem executa o quê</LearnChip>
                        <LearnChip topicId="precos">De onde a IA tira os preços</LearnChip>
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
            <TopicSection id="adicionando" index={3} icon={PlusCircle} title="Adicionando serviços"
                subtitle="O caminho feliz: Adicionar Serviço por Categoria">
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

            {/* 4 */}
            <TopicSection id="categorias-proprias" index={4} icon={FolderPlus} title="Categorias próprias"
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

            {/* 5 */}
            <TopicSection id="profissionais" index={5} icon={UserCheck} title="Profissionais vinculados"
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

            {/* 6 */}
            <TopicSection id="precos" index={6} icon={CircleDollarSign} title="Preços: uma fonte única"
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

            {/* 7 */}
            <TopicSection id="faq" index={7} icon={HelpCircle} title="Perguntas frequentes">
                <Accordion type="single" collapsible className="rounded-xl border px-4">
                    {[
                        {
                            q: "Qual a diferença entre serviço e aplicação?",
                            a: "O serviço é o nome genérico ('Botox Full Face'); a aplicação é a SUA versão dele, com preço, duração e profissionais. O sistema inteiro (agenda, IA, vendas) trabalha com as aplicações.",
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
