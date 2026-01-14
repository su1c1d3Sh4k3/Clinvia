import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { trackTokenUsage } from "../_shared/token-tracker.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SalesData {
    sales: any[];
    installments: any[];
    salesByAgent: Record<string, { name: string; total: number; count: number; topProduct: string }>;
    salesByProfessional: Record<string, { name: string; total: number; count: number; topProduct: string }>;
    salesByProduct: Record<string, { name: string; type: string; total: number; count: number }>;
}

interface ReportRequest {
    startDate: string;
    endDate: string;
    reportName: string;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { startDate, endDate, reportName }: ReportRequest = await req.json();

        if (!startDate || !endDate || !reportName) {
            throw new Error('startDate, endDate e reportName são obrigatórios');
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

        if (!OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY não configurada');
        }

        // Get user from auth header
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            throw new Error('Authorization header required');
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) {
            throw new Error('Usuário não autenticado');
        }

        // Get owner_id for RLS compatibility
        let ownerId = user.id;
        const { data: teamMember } = await supabase
            .from('team_members')
            .select('user_id')
            .eq('auth_user_id', user.id)
            .maybeSingle();
        if (teamMember?.user_id) {
            ownerId = teamMember.user_id;
        }

        console.log(`[generate-sales-report] Generating report for user ${ownerId}, period: ${startDate} to ${endDate}`);

        // =============================================
        // 1. FETCH ALL SALES DATA
        // =============================================

        // Sales
        const { data: sales, error: salesError } = await supabase
            .from('sales')
            .select(`
                *,
                product_service:products_services(id, name, type, price),
                team_member:team_members(id, name),
                professional:professionals(id, name)
            `)
            .eq('user_id', ownerId)
            .gte('sale_date', startDate)
            .lte('sale_date', endDate);

        if (salesError) console.error('Sales error:', salesError);

        // Installments in period
        const { data: installments, error: instError } = await supabase
            .from('sale_installments')
            .select(`
                *,
                sale:sales!sale_id(user_id, product_service_id)
            `)
            .gte('due_date', startDate)
            .lte('due_date', endDate);

        if (instError) console.error('Installments error:', instError);

        // =============================================
        // 2. AGGREGATE DATA
        // =============================================

        const salesList = sales || [];
        const instList = (installments || []).filter((i: any) => i.sale?.user_id === ownerId);

        // Sales totals
        const salesTotals = {
            total: salesList.reduce((sum, s) => sum + Number(s.total_amount), 0),
            count: salesList.length,
            quantity: salesList.reduce((sum, s) => sum + Number(s.quantity), 0),
            products: salesList.filter(s => s.category === 'product').length,
            services: salesList.filter(s => s.category === 'service').length,
            cash: salesList.filter(s => s.payment_type === 'cash').reduce((sum, s) => sum + Number(s.total_amount), 0),
            installment: salesList.filter(s => s.payment_type === 'installment').reduce((sum, s) => sum + Number(s.total_amount), 0),
        };

        // Installments totals
        const installmentsTotals = {
            total: instList.reduce((sum: number, i: any) => sum + Number(i.amount), 0),
            paid: instList.filter((i: any) => i.status === 'paid').reduce((sum: number, i: any) => sum + Number(i.amount), 0),
            pending: instList.filter((i: any) => i.status === 'pending').reduce((sum: number, i: any) => sum + Number(i.amount), 0),
            overdue: instList.filter((i: any) => i.status === 'overdue').reduce((sum: number, i: any) => sum + Number(i.amount), 0),
            count: instList.length,
        };

        // Average ticket
        const averageTicket = salesTotals.count > 0 ? salesTotals.total / salesTotals.count : 0;

        // Sales by product/service
        const salesByProduct: Record<string, { name: string; type: string; total: number; count: number }> = {};
        salesList.forEach(s => {
            if (s.product_service?.id) {
                const id = s.product_service.id;
                if (!salesByProduct[id]) {
                    salesByProduct[id] = {
                        name: s.product_service.name || 'Sem nome',
                        type: s.product_service.type || 'product',
                        total: 0,
                        count: 0
                    };
                }
                salesByProduct[id].total += Number(s.total_amount);
                salesByProduct[id].count += Number(s.quantity);
            }
        });

        // Top products sorted
        const topProducts = Object.values(salesByProduct).sort((a, b) => b.total - a.total).slice(0, 5);

        // Sales by agent
        const salesByAgent: Record<string, { name: string; total: number; count: number; products: Record<string, number> }> = {};
        salesList.forEach(s => {
            if (s.team_member?.id) {
                const id = s.team_member.id;
                if (!salesByAgent[id]) {
                    salesByAgent[id] = { name: s.team_member.name || 'Sem nome', total: 0, count: 0, products: {} };
                }
                salesByAgent[id].total += Number(s.total_amount);
                salesByAgent[id].count += Number(s.quantity);
                // Track products
                const prodName = s.product_service?.name || 'Outros';
                salesByAgent[id].products[prodName] = (salesByAgent[id].products[prodName] || 0) + Number(s.total_amount);
            }
        });

        // Get top product for each agent
        const agentData = Object.values(salesByAgent).map(a => ({
            name: a.name,
            total: a.total,
            count: a.count,
            topProduct: Object.entries(a.products).sort((x, y) => y[1] - x[1])[0]?.[0] || '-'
        })).sort((a, b) => b.total - a.total);

        // Sales by professional
        const salesByProfessional: Record<string, { name: string; total: number; count: number; products: Record<string, number> }> = {};
        salesList.forEach(s => {
            if (s.professional?.id) {
                const id = s.professional.id;
                if (!salesByProfessional[id]) {
                    salesByProfessional[id] = { name: s.professional.name || 'Sem nome', total: 0, count: 0, products: {} };
                }
                salesByProfessional[id].total += Number(s.total_amount);
                salesByProfessional[id].count += Number(s.quantity);
                const prodName = s.product_service?.name || 'Outros';
                salesByProfessional[id].products[prodName] = (salesByProfessional[id].products[prodName] || 0) + Number(s.total_amount);
            }
        });

        const profData = Object.values(salesByProfessional).map(p => ({
            name: p.name,
            total: p.total,
            count: p.count,
            topProduct: Object.entries(p.products).sort((x, y) => y[1] - x[1])[0]?.[0] || '-'
        })).sort((a, b) => b.total - a.total);

        // =============================================
        // 3. BUILD PROMPT FOR OPENAI
        // =============================================

        const rawData = {
            period: { startDate, endDate },
            sales: salesTotals,
            installments: installmentsTotals,
            averageTicket,
            topProducts,
            salesByAgent: agentData,
            salesByProfessional: profData,
        };

        const prompt = `Você é um consultor de vendas empresarial experiente. Analise os dados de vendas abaixo e gere um relatório executivo completo e profissional.

PERÍODO: ${startDate} a ${endDate}

DADOS DE VENDAS:

📊 RESUMO GERAL:
- Total vendido: R$ ${salesTotals.total.toFixed(2)} (${salesTotals.count} vendas)
- Quantidade de itens: ${salesTotals.quantity}
- Ticket médio: R$ ${averageTicket.toFixed(2)}
- Vendas de produtos: ${salesTotals.products}
- Vendas de serviços: ${salesTotals.services}
- Vendas à vista: R$ ${salesTotals.cash.toFixed(2)}
- Vendas parceladas: R$ ${salesTotals.installment.toFixed(2)}

💰 PARCELAS NO PERÍODO:
- Total em parcelas: R$ ${installmentsTotals.total.toFixed(2)} (${installmentsTotals.count} parcelas)
- Pagas: R$ ${installmentsTotals.paid.toFixed(2)}
- Pendentes: R$ ${installmentsTotals.pending.toFixed(2)}
- Em atraso: R$ ${installmentsTotals.overdue.toFixed(2)}

🏆 TOP 5 PRODUTOS/SERVIÇOS:
${topProducts.map((p, i) => `${i + 1}. ${p.name} (${p.type}): R$ ${p.total.toFixed(2)} - ${p.count} unidades`).join('\\n') || '- Nenhum dado disponível'}

👤 VENDAS POR ATENDENTE:
${agentData.map(a => `- ${a.name}: R$ ${a.total.toFixed(2)} (${a.count} itens) - Top: ${a.topProduct}`).join('\\n') || '- Nenhum dado disponível'}

👨‍⚕️ VENDAS POR PROFISSIONAL:
${profData.map(p => `- ${p.name}: R$ ${p.total.toFixed(2)} (${p.count} itens) - Top: ${p.topProduct}`).join('\\n') || '- Nenhum dado disponível'}

---

INSTRUÇÕES PARA O RELATÓRIO:
Gere um relatório executivo de vendas em formato JSON. IMPORTANTE:
- Todos os campos de texto devem ser STRINGS SIMPLES
- Escreva de forma profissional e direta
- Foque em insights acionáveis para aumentar vendas

ESTRUTURA DO JSON:

{
  "scores": {
    "performanceVendas": (número 0-100 avaliando performance geral de vendas),
    "mixProdutos": (número 0-100 avaliando diversificação de produtos/serviços),
    "desempenhoEquipe": (número 0-100 avaliando performance da equipe)
  },
  "resumoExecutivo": "Parágrafo resumindo a performance de vendas geral (TEXTO SIMPLES)",
  "analiseVendas": "Análise detalhada das vendas - volume, ticket médio, tendências (TEXTO SIMPLES, máximo 200 palavras)",
  "topProdutos": "Análise dos produtos/serviços mais vendidos e oportunidades (TEXTO SIMPLES)",
  "formasPagamento": "Análise de vendas à vista vs parcelado, recebíveis futuros (TEXTO SIMPLES)",
  "performanceAtendentes": "Análise da performance dos vendedores (TEXTO SIMPLES)",
  "performanceProfissionais": "Análise da performance dos profissionais (TEXTO SIMPLES)",
  "pontosPositivos": ["ponto 1", "ponto 2", "ponto 3"],
  "pontosAtencao": ["ponto 1", "ponto 2", "ponto 3"],
  "oportunidades": ["oportunidade 1", "oportunidade 2", "oportunidade 3"],
  "recomendacoes": {
    "curtoPrazo": ["ação imediata 1", "ação imediata 2"],
    "medioPrazo": ["ação 3-6 meses 1", "ação 3-6 meses 2"],
    "longoPrazo": ["estratégia 6-12 meses 1", "estratégia 6-12 meses 2"]
  }
}

FORMATO DE RESPOSTA: Retorne APENAS o JSON válido, sem markdown ou texto adicional.
`;

        // =============================================
        // 4. CALL OPENAI API
        // =============================================

        console.log('[generate-sales-report] Calling OpenAI API...');

        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'system',
                        content: 'Você é um consultor de vendas empresarial experiente. Responda sempre em JSON válido.'
                    },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 4000,
            })
        });

        if (!openaiResponse.ok) {
            const errorText = await openaiResponse.text();
            console.error('[generate-sales-report] OpenAI error:', errorText);
            throw new Error(`OpenAI API error: ${openaiResponse.status}`);
        }

        const openaiData = await openaiResponse.json();
        const reportContent = openaiData.choices?.[0]?.message?.content;

        if (!reportContent) {
            throw new Error('OpenAI não retornou conteúdo');
        }

        // Parse JSON response
        let parsedReport;
        try {
            let cleanContent = reportContent;
            if (cleanContent.startsWith('```json')) {
                cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (cleanContent.startsWith('```')) {
                cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }
            parsedReport = JSON.parse(cleanContent);
        } catch (parseError) {
            console.error('[generate-sales-report] JSON parse error:', parseError);
            parsedReport = {
                resumoExecutivo: reportContent,
                parseError: true,
            };
        }

        // =============================================
        // 5. SAVE REPORT TO DATABASE
        // =============================================

        // Format content as readable text for storage
        const formattedContent = formatReportAsText(parsedReport, rawData);

        const { data: savedReport, error: saveError } = await supabase
            .from('sales_reports')
            .insert({
                user_id: ownerId,
                name: reportName,
                start_date: startDate,
                end_date: endDate,
                content: formattedContent,
                status: 'completed',
            })
            .select()
            .single();

        if (saveError) {
            console.error('[generate-sales-report] Save error:', saveError);
            throw saveError;
        }

        console.log('[generate-sales-report] Report saved successfully:', savedReport.id);

        // Track token usage
        if (openaiData.usage) {
            await trackTokenUsage(supabase, {
                ownerId,
                teamMemberId: null,
                functionName: 'generate-sales-report',
                model: 'gpt-4o',
                usage: openaiData.usage
            });
        }

        return new Response(
            JSON.stringify({
                success: true,
                report: savedReport,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('[generate-sales-report] Error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});

// Helper function to format report as readable text
function formatReportAsText(report: any, rawData: any): string {
    const sections: string[] = [];

    sections.push(`📊 RELATÓRIO DE VENDAS`);
    sections.push(`Período: ${rawData.period.startDate} a ${rawData.period.endDate}`);
    sections.push('');

    if (report.scores) {
        sections.push(`📈 SCORES:`);
        sections.push(`• Performance de Vendas: ${report.scores.performanceVendas || 0}/100`);
        sections.push(`• Mix de Produtos: ${report.scores.mixProdutos || 0}/100`);
        sections.push(`• Desempenho da Equipe: ${report.scores.desempenhoEquipe || 0}/100`);
        sections.push('');
    }

    if (report.resumoExecutivo) {
        sections.push(`📝 RESUMO EXECUTIVO:`);
        sections.push(report.resumoExecutivo);
        sections.push('');
    }

    if (report.analiseVendas) {
        sections.push(`💰 ANÁLISE DE VENDAS:`);
        sections.push(report.analiseVendas);
        sections.push('');
    }

    if (report.topProdutos) {
        sections.push(`🏆 TOP PRODUTOS/SERVIÇOS:`);
        sections.push(report.topProdutos);
        sections.push('');
    }

    if (report.formasPagamento) {
        sections.push(`💳 FORMAS DE PAGAMENTO:`);
        sections.push(report.formasPagamento);
        sections.push('');
    }

    if (report.performanceAtendentes) {
        sections.push(`👤 PERFORMANCE DOS ATENDENTES:`);
        sections.push(report.performanceAtendentes);
        sections.push('');
    }

    if (report.performanceProfissionais) {
        sections.push(`👨‍⚕️ PERFORMANCE DOS PROFISSIONAIS:`);
        sections.push(report.performanceProfissionais);
        sections.push('');
    }

    if (report.pontosPositivos?.length) {
        sections.push(`✅ PONTOS POSITIVOS:`);
        report.pontosPositivos.forEach((p: string) => sections.push(`• ${p}`));
        sections.push('');
    }

    if (report.pontosAtencao?.length) {
        sections.push(`⚠️ PONTOS DE ATENÇÃO:`);
        report.pontosAtencao.forEach((p: string) => sections.push(`• ${p}`));
        sections.push('');
    }

    if (report.oportunidades?.length) {
        sections.push(`💡 OPORTUNIDADES:`);
        report.oportunidades.forEach((p: string) => sections.push(`• ${p}`));
        sections.push('');
    }

    if (report.recomendacoes) {
        sections.push(`📋 RECOMENDAÇÕES:`);
        if (report.recomendacoes.curtoPrazo?.length) {
            sections.push(`Curto Prazo (30 dias):`);
            report.recomendacoes.curtoPrazo.forEach((p: string) => sections.push(`  • ${p}`));
        }
        if (report.recomendacoes.medioPrazo?.length) {
            sections.push(`Médio Prazo (3-6 meses):`);
            report.recomendacoes.medioPrazo.forEach((p: string) => sections.push(`  • ${p}`));
        }
        if (report.recomendacoes.longoPrazo?.length) {
            sections.push(`Longo Prazo (6-12 meses):`);
            report.recomendacoes.longoPrazo.forEach((p: string) => sections.push(`  • ${p}`));
        }
    }

    return sections.join('\n');
}
