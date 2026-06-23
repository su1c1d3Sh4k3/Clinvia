import { WizardStage, WizardStepId } from './wizard-state';

export const WIZARD_STAGES: WizardStage[] = [
  {
    id: 'empresa',
    label: 'Dados da Empresa',
    iconName: 'Building2',
    steps: ['empresa-info', 'empresa-sobre'],
  },
  {
    id: 'faq',
    label: 'F.A.Q',
    iconName: 'HelpCircle',
    steps: ['faq-empresa', 'faq-produtos'],
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    iconName: 'Settings',
    steps: ['configuracoes', 'resumo'],
  },
];

export const STEP_ORDER: WizardStepId[] = [
  'empresa-info',
  'empresa-sobre',
  'faq-empresa',
  'faq-produtos',
  'configuracoes',
  'resumo',
];

export const STEP_LABELS: Record<WizardStepId, string> = {
  'empresa-info': 'Informações Básicas',
  'empresa-sobre': 'Sobre a Empresa',
  'faq-empresa': 'FAQ da Empresa',
  'faq-produtos': 'FAQ de Produtos',
  'configuracoes': 'Definição da IA',
  'resumo': 'Resumo Final',
};

export const STEP_DESCRIPTIONS: Record<WizardStepId, string> = {
  'empresa-info': 'Dados básicos de identificação',
  'empresa-sobre': 'Descrição, horários e pagamento',
  'faq-empresa': 'Dúvidas sobre a empresa',
  'faq-produtos': 'Dúvidas sobre produtos e serviços',
  'configuracoes': 'Agendamento inteligente',
  'resumo': 'Revisão e aprovação final',
};

// Mensagens sequenciais da Bia para cada step (aparecem uma por uma)
export const BIA_MESSAGES: Record<WizardStepId, string[]> = {
  'empresa-info': [
    "Olá! Eu sou a **Bia**, sua assistente de configuração de IA! 👋",
    "Vou te guiar pelo preenchimento do briefing completo da sua empresa. Essas informações são o **coração** do seu agente de atendimento — quanto mais detalhado você for, melhor ele vai funcionar!",
    "Vamos começar com o básico: me conta um pouco sobre você e sua empresa. Preencha os campos abaixo — os marcados com \\* são obrigatórios.",
  ],
  'empresa-sobre': [
    "Ótimo trabalho! Agora quero entender melhor o que a sua empresa faz. 🏢",
    "Uma boa **descrição** ajuda o agente a se apresentar e contextualizar as conversas com muito mais qualidade.",
    "Também preciso saber sobre o **horário de funcionamento** e as **formas de pagamento** aceitas. Preencha com as informações do seu jeito!",
  ],
  'faq-empresa': [
    "Perguntas frequentes são essenciais para um atendimento rápido e preciso! ❓",
    "Nessa tela, cadastre as dúvidas mais comuns que os clientes têm sobre **a empresa** — horários, localização, formas de contato, cancelamentos, etc.",
    "Use o formato **P: Pergunta? / R: Resposta.** Coloque cada par em linhas separadas. Quanto mais dúvidas você cadastrar, mais autônomo e eficiente será o agente!",
  ],
  'faq-produtos': [
    "Agora as dúvidas específicas sobre seus **produtos e serviços**! 💊",
    "Pense nas perguntas que os clientes mais fazem sobre cada produto ou procedimento: duração, preparo, contraindicações, resultados esperados, etc.",
    "Selecione o produto e adicione os pares de pergunta/resposta. Posso te dar exemplos de perguntas comuns — é só me pedir no chat abaixo!",
  ],
  'configuracoes': [
    "Quase lá! Temos uma configuração muito importante a definir. ⚙️",
    "Sua IA pode ter acesso à **agenda do sistema** e realizar agendamentos automaticamente durante o atendimento. Isso transforma o agente em um verdadeiro vendedor que fecha consultas e serviços.",
    "Se desativado, o agente pode informar preços e serviços, mas qualquer questão de agendamento será encaminhada para um humano. Qual opção faz mais sentido para você?",
  ],
  'resumo': [
    "Incrível! Você concluiu todas as etapas! 🎉",
    "Aqui está o **resumo completo** do seu briefing. Revise com calma — se precisar corrigir algo, clique no ícone de edição ao lado de cada seção.",
    "Quando estiver tudo certo, clique em **Confirmar e Salvar** para ativar as configurações do seu agente!",
  ],
};
