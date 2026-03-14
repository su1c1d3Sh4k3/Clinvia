import { WizardStepId } from './wizard-state';

export interface ChatResponse {
  keywords: string[];
  response: string;
}

export const CHAT_RESPONSES_BY_STEP: Partial<Record<WizardStepId, ChatResponse[]>> = {
  'empresa-info': [
    {
      keywords: ['nome', 'agente', 'chamar', 'chama', 'batizar'],
      response: 'O nome do agente é como seu assistente vai se apresentar para os clientes! Pode ser um nome feminino ou masculino: Luna, Clara, Sofia, Max, Bruno, etc. Escolha algo que combine com a identidade da sua marca.',
    },
    {
      keywords: ['google', 'maps', 'link', 'localização', 'localizacao', 'mapa'],
      response: 'Para pegar o link do Google Maps: abra o Google Maps, encontre o endereço da sua empresa, clique em "Compartilhar" e copie o link curto. Ele fica no formato maps.app.goo.gl/...',
    },
    {
      keywords: ['instagram', 'insta', '@'],
      response: 'No campo Instagram, coloque apenas o @ da conta, sem o "https://instagram.com/". Exemplo: @minhaempresa',
    },
    {
      keywords: ['facebook', 'face', 'fb'],
      response: 'No campo Facebook, coloque o nome da página ou o link completo. Exemplo: /MinhaEmpresaOficial',
    },
    {
      keywords: ['site', 'url', 'http', 'www', 'website'],
      response: 'Coloque o endereço completo do seu site incluindo o https://. Exemplo: https://minhaempresa.com.br',
    },
    {
      keywords: ['obrigatorio', 'obrigatório', 'campo', 'pular', 'necessario', 'necessário', 'preciso'],
      response: 'Os campos obrigatórios são: Nome do agente IA, Nome da empresa e Endereço. Os demais (Google Maps, Site, Instagram, Facebook) são opcionais mas ajudam muito o agente a responder com mais precisão!',
    },
  ],
  'empresa-sobre': [
    {
      keywords: ['descricao', 'descrição', 'escrever', 'como', 'exemplo'],
      response: 'Na descrição, fale sobre o que sua empresa faz, seus diferenciais, tempo de mercado e especialidades. Exemplo: "Clínica de estética especializada em procedimentos faciais e corporais, com 10 anos de mercado e equipe altamente qualificada. Atendemos de forma personalizada com foco em resultados naturais."',
    },
    {
      keywords: ['horario', 'horário', 'funcionamento', 'atendimento', 'abre', 'fecha'],
      response: 'Escreva no formato que preferir. Exemplo: "Segunda a Sexta: 8h às 18h | Sábado: 9h às 13h | Domingo: Fechado". O agente usará essa informação para orientar os clientes.',
    },
    {
      keywords: ['pagamento', 'pix', 'cartao', 'cartão', 'dinheiro', 'boleto', 'credito', 'crédito', 'debito', 'débito'],
      response: 'Liste todas as formas aceitas. Exemplo: "PIX, Cartão de Crédito (até 12x), Cartão de Débito, Dinheiro". Inclua detalhes como número de parcelas se for relevante.',
    },
  ],
  'restricoes': [
    {
      keywords: ['exemplo', 'exemplos', 'tipo', 'tipos', 'quais', 'o que'],
      response: 'Aqui vão exemplos de boas restrições:\n• "Não agendar procedimentos de laser sem avaliação prévia"\n• "Casos de convênio transferir imediatamente para atendente"\n• "Não informar preços sem consultar tabela atualizada"\n• "Se o cliente mencionar emergência, transferir para humano"\n• "Não fazer promoções ou descontos sem autorização"',
    },
    {
      keywords: ['quantas', 'maximo', 'máximo', 'limite', 'quantidade'],
      response: 'Não há limite! Adicione quantas restrições precisar. Mas lembre-se: devem ser regras ESPECÍFICAS da sua empresa, não regras genéricas. O agente já possui regras gerais de bom comportamento.',
    },
    {
      keywords: ['transferir', 'humano', 'pessoa', 'atendente'],
      response: 'Para casos que precisam de transferência para humano, adicione uma restrição como: "Quando o cliente solicitar falar com [nome/cargo], transferir imediatamente para atendente humano".',
    },
  ],
  'qualificacao': [
    {
      keywords: ['qualificacao', 'qualificação', 'serve', 'para que', 'o que é', 'oque'],
      response: 'A qualificação são perguntas que o agente faz ANTES de prosseguir com um serviço. Exemplo: para um procedimento de preenchimento, o agente pode perguntar se o cliente tem alergia a produtos específicos. Isso protege o cliente e a empresa.',
    },
    {
      keywords: ['produto', 'servico', 'serviço', 'adicionar', 'selecionar'],
      response: 'Clique em "Adicionar Qualificação", selecione o produto/serviço na lista e escreva as perguntas de qualificação. Os produtos/serviços precisam estar cadastrados na seção de Produtos/Serviços do sistema.',
    },
    {
      keywords: ['exemplo', 'exemplos', 'como escrever', 'formato'],
      response: 'Exemplo de qualificação para Botox:\n"Verificar se o cliente: 1) Está grávida ou amamentando? 2) Tem alergia a toxina botulínica? 3) Está usando anticoagulantes? Se sim para algum, informar que será necessária avaliação presencial antes do agendamento."',
    },
    {
      keywords: ['pular', 'nao', 'não', 'sem', 'todos', 'qualquer'],
      response: 'Se seus serviços não precisam de qualificação específica, pode deixar vazio e clicar em Próximo. A qualificação só é necessária para serviços com contraindicações ou restrições específicas.',
    },
  ],
  'faq-empresa': [
    {
      keywords: ['formato', 'como', 'escrever', 'modelo', 'template'],
      response: 'Use esse formato:\nP: Como funciona o agendamento?\nR: Você pode agendar pelo WhatsApp ou pelo site.\n\nP: Onde vocês ficam?\nR: Estamos localizados na Rua X, número Y.\n\nColoque cada par P/R em linhas seguidas, com uma linha em branco entre eles.',
    },
    {
      keywords: ['exemplo', 'exemplos', 'perguntas', 'comuns', 'frequentes'],
      response: 'Perguntas comuns sobre empresas:\n• "Onde vocês ficam?"\n• "Quais são os horários de atendimento?"\n• "Como faço para cancelar uma consulta?"\n• "Vocês atendem convênio?"\n• "Tem estacionamento?"\n• "Como chego até vocês?"\n• "Qual o tempo de espera?"',
    },
    {
      keywords: ['produto', 'servico', 'serviço', 'procedimento'],
      response: 'Nessa tela são apenas perguntas sobre a EMPRESA (localização, horários, contato, cancelamentos). Para dúvidas específicas sobre produtos e serviços, haverá uma tela dedicada no próximo passo!',
    },
  ],
  'faq-produtos': [
    {
      keywords: ['exemplo', 'exemplos', 'perguntas', 'comuns'],
      response: 'Exemplos de perguntas sobre produtos:\n• "Quanto tempo dura o resultado?"\n• "Quantas sessões são necessárias?"\n• "Tem alguma contraindicação?"\n• "Qual o preparo antes do procedimento?"\n• "Quanto tempo leva a recuperação?"\n• "Pode tomar sol depois?"',
    },
    {
      keywords: ['formato', 'como', 'escrever'],
      response: 'Use o mesmo formato P/R:\nP: Quantas sessões de laser são necessárias?\nR: Geralmente entre 6 a 8 sessões, com intervalo de 30 dias entre elas.',
    },
    {
      keywords: ['produto', 'servico', 'serviço', 'selecionar', 'adicionar'],
      response: 'Selecione o produto/serviço na lista e adicione as perguntas específicas dele. Cada produto pode ter seu próprio FAQ. Adicione quantos produtos precisar!',
    },
  ],
  'convenios': [
    {
      keywords: ['valor', 'preco', 'preço', 'quanto', 'consulta', 'primeira'],
      response: 'O "Valor da Primeira Consulta" é o que o cliente paga na consulta inicial com o convênio. "Valor das Demais" é o valor das consultas subsequentes. Use o formato R$ X,XX.',
    },
    {
      keywords: ['previsao', 'previsão', 'dias', 'prazo', 'vaga', 'espera'],
      response: 'A "Previsão de Vaga" indica em quantos dias normalmente há disponibilidade de horário para aquele convênio. Exemplo: se costuma ter vagas em 15 dias, coloque 15.',
    },
    {
      keywords: ['nao', 'não', 'pular', 'trabalho', 'atendo', 'particular'],
      response: 'Sem problemas! Se você não trabalha com convênios ou atende apenas particular, deixe a lista vazia e clique em Próximo para pular essa etapa.',
    },
    {
      keywords: ['adicionar', 'mais', 'outro', 'varios', 'vários'],
      response: 'Clique em "+ Adicionar Convênio" para incluir mais planos. Você pode cadastrar quantos convênios quiser!',
    },
  ],
  'configuracoes': [
    {
      keywords: ['agendamento', 'agendar', 'agenda', 'horario', 'horário', 'scheduling'],
      response: 'Com o agendamento ativado, o agente tem acesso à agenda do sistema e pode marcar, verificar disponibilidade e confirmar horários automaticamente durante a conversa. É como ter um recepcionista virtual 24h!',
    },
    {
      keywords: ['desativar', 'desligado', 'nao', 'não', 'sem', 'apenas informacoes', 'informações'],
      response: 'Com o agendamento desativado, o agente informa preços, serviços e horários de funcionamento, mas não acessa a agenda. Qualquer solicitação de agendamento é encaminhada para um atendente humano.',
    },
    {
      keywords: ['diferenca', 'diferença', 'qual', 'melhor', 'recomenda', 'vantagem'],
      response: 'Para clínicas com agenda no sistema, recomendo ATIVAR o agendamento — aumenta muito a conversão e reduz o trabalho da equipe. Para empresas que não usam o módulo de agenda, deixe desativado.',
    },
  ],
  'resumo': [
    {
      keywords: ['editar', 'corrigir', 'voltar', 'mudar', 'alterar', 'errado'],
      response: 'Clique no ícone de lápis (✏️) ao lado de qualquer seção para voltar e fazer ajustes. Após corrigir, você retornará automaticamente ao resumo.',
    },
    {
      keywords: ['salvar', 'confirmar', 'finalizar', 'gravar'],
      response: 'Ao clicar em "Confirmar e Salvar", todas as informações serão gravadas no sistema e seu agente estará pronto! Você ainda poderá fazer ajustes individuais pelas abas da página a qualquer momento.',
    },
    {
      keywords: ['falta', 'faltando', 'obrigatorio', 'obrigatório', 'campo'],
      response: 'Os únicos campos obrigatórios são o Nome do agente, Nome da empresa e Endereço. Os demais são opcionais — você pode salvar mesmo que alguns estejam vazios e complementar depois.',
    },
  ],
};

const DEFAULT_RESPONSES: Record<WizardStepId, string> = {
  'empresa-info': 'Entendido! Preencha os campos com as informações da sua empresa. Se tiver dúvidas sobre algum campo específico, pergunte aqui!',
  'empresa-sobre': 'Pode descrever com suas próprias palavras, sem preocupação com o formato. Estou aqui para ajudar!',
  'restricoes': 'Adicione as regras específicas que o agente deve seguir. Se precisar de exemplos, é só pedir!',
  'qualificacao': 'Posso ajudar com exemplos de perguntas de qualificação para qualquer tipo de serviço. É só me dizer o produto!',
  'faq-empresa': 'Pense nas perguntas que seus clientes fazem com mais frequência sobre a empresa. Posso sugerir perguntas se precisar!',
  'faq-produtos': 'Quais dúvidas os clientes costumam ter sobre seus produtos e serviços? Posso dar exemplos por categoria!',
  'convenios': 'Cadastre todos os convênios que você atende. Se precisar de ajuda com algum campo, pergunte aqui!',
  'configuracoes': 'Ficou com alguma dúvida sobre o modo de agendamento? Estou aqui para explicar melhor!',
  'resumo': 'Revise todas as informações e quando estiver pronto, clique em Confirmar e Salvar!',
};

export function findBiaResponse(stepId: WizardStepId, userMessage: string): string {
  const normalized = userMessage.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const responses = CHAT_RESPONSES_BY_STEP[stepId] ?? [];

  for (const item of responses) {
    if (item.keywords.some(kw => normalized.includes(kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))) {
      return item.response;
    }
  }

  return DEFAULT_RESPONSES[stepId] ?? 'Entendi! Se tiver mais dúvidas sobre essa etapa, estou aqui para ajudar.';
}
