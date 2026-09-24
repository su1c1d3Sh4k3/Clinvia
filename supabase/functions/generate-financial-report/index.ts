import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { trackTokenUsage } from "../_shared/token-tracker.ts";
import { fetchProvider } from "../_shared/provider-errors.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-origin',
};

interface FinancialData {
    revenues: any[];
    expenses: any[];
    teamCosts: any[];
    campaigns: any[];
    revenueByAgent: Record<string, { name: string; total: number; count: number }>;
    revenueByProfessional: Record<string, { name: string; total: number; count: number }>;
}

interface ReportRequest {
    startDate: string;
    endDate: string;
    reportName: string;
}

serveMonitored("generate-financial-report", async (req) => {
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

        console.log(`[generate-financial-report] Generating report for user ${ownerId}, period: ${startDate} to ${endDate}`);

        // =============================================
        // 1. FETCH ALL FINANCIAL DATA
        // =============================================

        // Revenues
        const { data: revenues, error: revError } = await supabase
            .from('revenues')
            .select(`
                *,
                category:revenue_categories(id, name),
                team_member:team_members(id, name),
                professional:professionals(id, name)
            `)
            .eq('user_id', ownerId)
            .gte('due_date', startDate)
            .lte('due_date', endDate);

        if (revError) console.error('Revenue error:', revError);

        // Expenses
        const { data: expenses, error: expError } = await supabase
            .from('expenses')
            .select(`
                *,
                category:expense_categories(id, name)
            `)
            .eq('user_id', ownerId)
            .gte('due_date', startDate)
            .lte('due_date', endDate);

        if (expError) console.error('Expense error:', expError);

        // Team Costs
        const { data: teamCosts, error: teamError } = await supabase
            .from('team_costs')
            .select(`
                *,
                team_member:team_members(id, name),
                professional:professionals(id, name)
            `)
            .eq('user_id', ownerId)
            .gte('due_date', startDate)
            .lte('due_date', endDate);

        if (teamError) console.error('Team cost error:', teamError);

        // Marketing Campaigns
        const { data: campaigns, error: campError } = await supabase
            .from('marketing_campaigns')
            .select('*')
            .eq('user_id', ownerId)
            .lte('start_date', endDate)
            .or(`end_date.is.null,end_date.gte.${startDate}`);

        if (campError) console.error('Campaign error:', campError);

        // =============================================
        // 2. AGGREGATE DATA
        // =============================================

        const revenueList = revenues || [];
        const expenseList = expenses || [];
        const teamCostList = teamCosts || [];
        const campaignList = campaigns || [];

        // Revenue totals by status
        const revenueTotals = {
            total: revenueList.reduce((sum, r) => sum + Number(r.amount), 0),
            paid: revenueList.filter(r => r.status === 'paid').reduce((sum, r) => sum + Number(r.amount), 0),
            pending: revenueList.filter(r => r.status === 'pending').reduce((sum, r) => sum + Number(r.amount), 0),
            overdue: revenueList.filter(r => r.status === 'overdue').reduce((sum, r) => sum + Number(r.amount), 0),
            count: revenueList.length,
        };

        // Expense totals by status
        const expenseTotals = {
            total: expenseList.reduce((sum, e) => sum + Number(e.amount), 0),
            paid: expenseList.filter(e => e.status === 'paid').reduce((sum, e) => sum + Number(e.amount), 0),
            pending: expenseList.filter(e => e.status === 'pending').reduce((sum, e) => sum + Number(e.amount), 0),
            overdue: expenseList.filter(e => e.status === 'overdue').reduce((sum, e) => sum + Number(e.amount), 0),
            count: expenseList.length,
        };

        // Team costs total
        const teamCostTotals = {
            total: teamCostList.reduce((sum, t) => sum + Number(t.base_salary) + Number(t.commission) + Number(t.bonus) - Number(t.deductions), 0),
            salaries: teamCostList.reduce((sum, t) => sum + Number(t.base_salary), 0),
            commissions: teamCostList.reduce((sum, t) => sum + Number(t.commission), 0),
            bonuses: teamCostList.reduce((sum, t) => sum + Number(t.bonus), 0),
            deductions: teamCostList.reduce((sum, t) => sum + Number(t.deductions), 0),
            count: teamCostList.length,
        };

        // Marketing totals
        const marketingTotals = {
            investment: campaignList.reduce((sum, c) => sum + Number(c.investment), 0),
            leads: campaignList.reduce((sum, c) => sum + Number(c.leads_count || 0), 0),
            conversions: campaignList.reduce((sum, c) => sum + Number(c.conversions_count || 0), 0),
            count: campaignList.length,
        };
        marketingTotals.costPerLead = marketingTotals.leads > 0 ? marketingTotals.investment / marketingTotals.leads : 0;
        marketingTotals.costPerConversion = marketingTotals.conversions > 0 ? marketingTotals.investment / marketingTotals.conversions : 0;
        marketingTotals.conversionRate = marketingTotals.leads > 0 ? (marketingTotals.conversions / marketingTotals.leads) * 100 : 0;

        // Revenue by agent
        const revenueByAgent: Record<string, { name: string; total: number; count: number }> = {};
        revenueList.forEach(r => {
            if (r.team_member?.id) {
                const id = r.team_member.id;
                if (!revenueByAgent[id]) {
                    revenueByAgent[id] = { name: r.team_member.name || 'Sem nome', total: 0, count: 0 };
                }
                revenueByAgent[id].total += Number(r.amount);
                revenueByAgent[id].count++;
            }
        });

        // Revenue by professional
        const revenueByProfessional: Record<string, { name: string; total: number; count: number }> = {};
        revenueList.forEach(r => {
            if (r.professional?.id) {
                const id = r.professional.id;
                if (!revenueByProfessional[id]) {
                    revenueByProfessional[id] = { name: r.professional.name || 'Sem nome', total: 0, count: 0 };
                }
                revenueByProfessional[id].total += Number(r.amount);
                revenueByProfessional[id].count++;
            }
        });

        // Revenue by category
        const revenueByCategory: Record<string, { name: string; total: number; count: number }> = {};
        revenueList.forEach(r => {
            const catName = r.category?.name || 'Sem categoria';
            if (!revenueByCategory[catName]) {
                revenueByCategory[catName] = { name: catName, total: 0, count: 0 };
            }
            revenueByCategory[catName].total += Number(r.amount);
            revenueByCategory[catName].count++;
        });

        // Expense by category
        const expenseByCategory: Record<string, { name: string; total: number; count: number }> = {};
        expenseList.forEach(e => {
            const catName = e.category?.name || 'Sem categoria';
            if (!expenseByCategory[catName]) {
                expenseByCategory[catName] = { name: catName, total: 0, count: 0 };
            }
            expenseByCategory[catName].total += Number(e.amount);
            expenseByCategory[catName].count++;
        });

        // Balance
        const balance = {
            grossProfit: revenueTotals.total - expenseTotals.total,
            netProfit: revenueTotals.total - expenseTotals.total - teamCostTotals.total,
            profitMargin: revenueTotals.total > 0 ? ((revenueTotals.total - expenseTotals.total - teamCostTotals.total) / revenueTotals.total) * 100 : 0,
        };

        // =============================================
        // 3. BUILD PROMPT FOR OPENAI
        // =============================================

        const rawData = {
            period: { startDate, endDate },
            revenues: revenueTotals,
            expenses: expenseTotals,
            teamCosts: teamCostTotals,
            marketing: marketingTotals,
            balance,
            revenueByAgent: Object.values(revenueByAgent),
            revenueByProfessional: Object.values(revenueByProfessional),
            revenueByCategory: Object.values(revenueByCategory),
            expenseByCategory: Object.values(expenseByCategory),
        };

        const prompt = `Você é um consultor financeiro empresarial experiente. Analise os dados financeiros abaixo e gere um relatório executivo completo e profissional.

PERÍODO: ${startDate} a ${endDate}

DADOS FINANCEIROS:

📊 RECEITAS:
- Total: R$ ${revenueTotals.total.toFixed(2)} (${revenueTotals.count} lançamentos)
- Recebido (Pago): R$ ${revenueTotals.paid.toFixed(2)}
- Pendente: R$ ${revenueTotals.pending.toFixed(2)}
- Em atraso: R$ ${revenueTotals.overdue.toFixed(2)}
- Por categoria: ${Object.values(revenueByCategory).map(c => `${c.name}: R$ ${c.total.toFixed(2)}`).join(', ') || 'Nenhuma'}

💸 DESPESAS:
- Total: R$ ${expenseTotals.total.toFixed(2)} (${expenseTotals.count} lançamentos)
- Pagas: R$ ${expenseTotals.paid.toFixed(2)}
- Pendentes: R$ ${expenseTotals.pending.toFixed(2)}
- Em atraso: R$ ${expenseTotals.overdue.toFixed(2)}
- Por categoria: ${Object.values(expenseByCategory).map(c => `${c.name}: R$ ${c.total.toFixed(2)}`).join(', ') || 'Nenhuma'}

👥 CUSTOS COM EQUIPE:
- Total: R$ ${teamCostTotals.total.toFixed(2)} (${teamCostTotals.count} colaboradores)
- Salários base: R$ ${teamCostTotals.salaries.toFixed(2)}
- Comissões: R$ ${teamCostTotals.commissions.toFixed(2)}
- Bônus: R$ ${teamCostTotals.bonuses.toFixed(2)}
- Deduções: R$ ${teamCostTotals.deductions.toFixed(2)}

📢 MARKETING:
- Investimento total: R$ ${marketingTotals.investment.toFixed(2)} (${marketingTotals.count} campanhas)
- Leads gerados: ${marketingTotals.leads}
- Conversões: ${marketingTotals.conversions}
- Custo por lead: R$ ${marketingTotals.costPerLead.toFixed(2)}
- Custo por conversão: R$ ${marketingTotals.costPerConversion.toFixed(2)}
- Taxa de conversão: ${marketingTotals.conversionRate.toFixed(1)}%

📈 BALANÇO:
- Lucro bruto (Receitas - Despesas): R$ ${balance.grossProfit.toFixed(2)}
- Lucro líquido (após custos equipe): R$ ${balance.netProfit.toFixed(2)}
- Margem de lucro: ${balance.profitMargin.toFixed(1)}%

👤 RECEITAS POR ATENDENTE:
${Object.values(revenueByAgent).map(a => `- ${a.name}: R$ ${a.total.toFixed(2)} (${a.count} vendas)`).join('\\n') || '- Nenhum dado disponível'}

👨‍⚕️ RECEITAS POR PROFISSIONAL:
${Object.values(revenueByProfessional).map(p => `- ${p.name}: R$ ${p.total.toFixed(2)} (${p.count} atendimentos)`).join('\\n') || '- Nenhum dado disponível'}

---

INSTRUÇÕES PARA O RELATÓRIO:
Gere um relatório executivo completo em formato JSON. IMPORTANTE:
- Todos os campos de texto devem ser STRINGS SIMPLES, não objetos aninhados
- Não use JSON dentro dos campos de texto
- Escreva de forma profissional e direta

ESTRUTURA DO JSON:

{
  "scores": {
    "saudeFinanceira": (número 0-100 avaliando a saúde financeira geral),
    "qualidadeMarketing": (número 0-100 avaliando a eficiência do marketing),
    "desempenhoColaboradores": (número 0-100 avaliando performance da equipe)
  },
  "resumoExecutivo": "Parágrafo resumindo a saúde financeira geral (TEXTO SIMPLES)",
  "receitas": "Análise das receitas - tendências, categorias principais, status dos recebíveis (TEXTO SIMPLES, máximo 200 palavras)",
  "despesas": "Análise das despesas - principais gastos, oportunidades de corte (TEXTO SIMPLES, máximo 200 palavras)",
  "receitasXDespesas": "Comparativo e análise do balanço (TEXTO SIMPLES)",
  "marketing": "ROI do marketing, eficiência das campanhas, recomendações (TEXTO SIMPLES)",
  "receitasPorAtendente": "Análise da performance dos atendentes (TEXTO SIMPLES)",
  "receitasPorProfissional": "Análise da performance dos profissionais (TEXTO SIMPLES)",
  "pontosPositivos": ["ponto 1", "ponto 2", "ponto 3"],
  "pontosNegativos": ["ponto 1", "ponto 2", "ponto 3"],
  "pontosDeMelhoria": ["ação 1", "ação 2", "ação 3"],
  "insights": {
    "curtoPrazo": ["ação para 30 dias 1", "ação para 30 dias 2"],
    "medioPrazo": ["ação para 3-6 meses 1", "ação para 3-6 meses 2"],
    "longoPrazo": ["estratégia para 6-12 meses 1", "estratégia para 6-12 meses 2"]
  }
}

CRITÉRIOS PARA OS SCORES:
- saudeFinanceira: Considere margem de lucro, recebíveis em atraso, balanço geral
- qualidadeMarketing: Considere ROI, taxa de conversão, custo por lead
- desempenhoColaboradores: Considere receitas por atendente/profissional, produtividade

FORMATO DE RESPOSTA: Retorne APENAS o JSON válido, sem markdown ou texto adicional.
`;

        // =============================================
        // 4. CALL OPENAI API
        // =============================================

        console.log('[generate-financial-report] Calling OpenAI API...');

        const openaiResponse = await fetchProvider('https://api.openai.com/v1/chat/completions', {
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
                        content: 'Você é um consultor financeiro empresarial experiente. Responda sempre em JSON válido.'
                    },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 4000,
            })
        });

        if (!openaiResponse.ok) {
            const errorText = await openaiResponse.text();
            console.error('[generate-financial-report] OpenAI error:', errorText);
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
            // Remove markdown code blocks if present
            let cleanContent = reportContent;
            if (cleanContent.startsWith('```json')) {
                cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (cleanContent.startsWith('```')) {
                cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }
            parsedReport = JSON.parse(cleanContent);
        } catch (parseError) {
            console.error('[generate-financial-report] JSON parse error:', parseError);
            // If parsing fails, create a structured response from the text
            parsedReport = {
                resumoExecutivo: reportContent,
                parseError: true,
            };
        }

        // =============================================
        // 5. SAVE REPORT TO DATABASE
        // =============================================

        const { data: savedReport, error: saveError } = await supabase
            .from('financial_reports')
            .insert({
                user_id: ownerId,
                name: reportName,
                start_date: startDate,
                end_date: endDate,
                content: parsedReport,
                raw_data: rawData,
                status: 'completed',
            })
            .select()
            .single();

        if (saveError) {
            console.error('[generate-financial-report] Save error:', saveError);
            throw saveError;
        }

        console.log('[generate-financial-report] Report saved successfully:', savedReport.id);

        // Track token usage
        if (openaiData.usage) {
            await trackTokenUsage(supabase, {
                ownerId,
                teamMemberId: null,
                functionName: 'generate-financial-report',
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
        console.error('[generate-financial-report] Error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
