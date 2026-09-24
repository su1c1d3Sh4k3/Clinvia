import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
serve(async ()=>{
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const manual = `# Manual - Suporte\n\nPágina de acompanhamento de tickets de suporte técnico criados pela Bia.\n\n> **Acesso**: Todos os usuários podem visualizar os tickets da empresa.\n\n---\n\n## 📍 Como Acessar\n\nNo **menu lateral**, abra o submenu **"Administrativo"** (ícone de gráfico 📊) e clique em **"Suporte"** (ícone de fone 🎧).\n\nOu acesse diretamente via URL: \`/support\`\n\n---\n\n## 🎫 Como Funciona\n\nOs tickets de suporte são criados **automaticamente pela Bia** quando ela não consegue resolver um problema após 3 tentativas de ajuda.\n\n### Fluxo:\n1. O usuário reporta um problema para a Bia (botão de suporte 🎧)\n2. A Bia tenta ajudar usando diagnósticos e manuais\n3. Se após 3 tentativas o problema persiste, a Bia cria um ticket automaticamente\n4. O ticket aparece na página de Suporte com todas as informações\n\n---\n\n## 📋 Informações do Ticket\n\n| Campo | Descrição |\n|-------|-----------|\n| **Título** | Resumo curto do problema |\n| **Descrição Técnica** | Detalhes do problema + diagnósticos realizados pela Bia |\n| **Relato do Cliente** | O que o usuário reportou, na perspectiva dele |\n| **Prioridade** | 🟢 Baixa, 🟡 Média, 🟠 Alta, 🔴 Urgente |\n| **Status** | 📬 Aberto, 👁️ Visualizado, 🔧 Em Atendimento, ✅ Concluído |\n| **Resposta do Suporte** | Resposta da equipe técnica (quando disponível) |\n\n---\n\n## 🔍 Filtros\n\nUse os filtros no topo da página para encontrar tickets:\n- **Por Status**: Aberto, Visualizado, Em Atendimento, Concluído\n- **Por Prioridade**: Urgente, Alta, Média, Baixa\n\n---\n\n## ❓ Perguntas Frequentes\n\n**Como abro um ticket?**\nConverse com a Bia pelo botão de suporte (🎧). Se ela não resolver seu problema, criará um ticket automaticamente.\n\n**Posso criar um ticket manualmente?**\nNão. Os tickets são criados exclusivamente pela Bia para garantir que todas as tentativas de resolução sejam registradas.\n\n**Como sei se meu ticket foi respondido?**\nTickets com resposta do suporte aparecem com destaque verde na página.`;
  const encoder = new TextEncoder();
  const data = encoder.encode(manual);
  const { error } = await supabase.storage.from('manuals').upload('support.md', data, {
    contentType: 'text/markdown',
    upsert: true
  });
  if (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500
    });
  }
  return new Response(JSON.stringify({
    success: true,
    message: 'support.md uploaded'
  }));
});
