import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type {
    Revenue,
    Expense,
    TeamCost,
    MarketingCampaign,
    RevenueCategory,
    ExpenseCategory,
    FinancialSummary,
    AnnualBalanceItem,
    AgentRevenue,
    ProfessionalRevenue,
    RevenueFormData,
    ExpenseFormData,
    TeamCostFormData,
    MarketingCampaignFormData,
} from "@/types/financial";

// =============================================
// HELPER: Get owner_id for RLS compatibility
// When agents/supervisors create records, we need admin's user_id
// =============================================
async function getOwnerId(authUserId: string): Promise<string> {
    // First try to find team_member by auth_user_id (for agents/supervisors)
    let { data: teamMember } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('auth_user_id', authUserId)
        .maybeSingle();

    // Fallback: check if user is admin (user_id = auth.uid())
    if (!teamMember) {
        const { data: adminMember } = await supabase
            .from('team_members')
            .select('user_id')
            .eq('user_id', authUserId)
            .eq('role', 'admin')
            .maybeSingle();
        teamMember = adminMember;
    }

    return teamMember?.user_id || authUserId;
}

// =============================================
// HOOKS DE CONSULTA (READ)
// =============================================

// Resumo Financeiro Mensal
export function useFinancialSummary(month: number, year: number) {
    return useQuery({
        queryKey: ['financial-summary', month, year],
        queryFn: async (): Promise<FinancialSummary> => {
            const { data, error } = await supabase.rpc('get_financial_summary', {
                p_month: month,
                p_year: year
            });
            if (error) throw error;
            return data as FinancialSummary;
        },
    });
}

// Balanço Anual
export function useAnnualBalance(year?: number) {
    return useQuery({
        queryKey: ['annual-balance', year],
        queryFn: async (): Promise<AnnualBalanceItem[]> => {
            const { data, error } = await supabase.rpc('get_annual_balance', {
                p_year: year || new Date().getFullYear()
            });
            if (error) throw error;
            return data as AnnualBalanceItem[];
        },
    });
}

// Receita por Atendente
export function useRevenueByAgent() {
    return useQuery({
        queryKey: ['revenue-by-agent'],
        queryFn: async (): Promise<AgentRevenue[]> => {
            const { data, error } = await supabase.rpc('get_revenue_by_agent');
            if (error) throw error;
            return data as AgentRevenue[];
        },
    });
}

// Receita por Profissional
export function useRevenueByProfessional() {
    return useQuery({
        queryKey: ['revenue-by-professional'],
        queryFn: async (): Promise<ProfessionalRevenue[]> => {
            // First get all professionals with commission rate
            const { data: professionals, error: profError } = await supabase
                .from('professionals')
                .select('id, name, photo_url, commission');

            if (profError) throw profError;
            if (!professionals || professionals.length === 0) return [];

            // Then get all revenues with professional_id
            const { data: revenues, error: revError } = await supabase
                .from('revenues')
                .select('professional_id, amount')
                .not('professional_id', 'is', null);

            if (revError) throw revError;

            // Create map of professional commission rates
            const commissionRates = new Map<string, number>();
            professionals.forEach(p => commissionRates.set(p.id, p.commission || 0));

            // Aggregate revenues by professional
            const revenueMap = new Map<string, { total: number; count: number; commission: number }>();
            (revenues || []).forEach(rev => {
                if (rev.professional_id) {
                    const rate = commissionRates.get(rev.professional_id) || 0;
                    const current = revenueMap.get(rev.professional_id) || { total: 0, count: 0, commission: 0 };
                    const revenueAmount = Number(rev.amount);
                    const commissionAmount = (revenueAmount * rate) / 100;

                    revenueMap.set(rev.professional_id, {
                        total: current.total + revenueAmount,
                        count: current.count + 1,
                        commission: current.commission + commissionAmount
                    });
                }
            });

            // Build result with professionals that have revenue
            const result: ProfessionalRevenue[] = professionals
                .filter(p => revenueMap.has(p.id))
                .map(p => {
                    const stats = revenueMap.get(p.id)!;
                    return {
                        id: p.id,
                        name: p.name,
                        photo: p.photo_url,
                        revenue: stats.total,
                        appointments: stats.count,
                        commissionRate: commissionRates.get(p.id) || 0,
                        commissionTotal: stats.commission
                    };
                })
                .sort((a, b) => b.revenue - a.revenue);

            return result;
        },
    });
}

// Categorias de Receitas
export function useRevenueCategories() {
    return useQuery({
        queryKey: ['revenue-categories'],
        queryFn: async (): Promise<RevenueCategory[]> => {
            const { data, error } = await supabase
                .from('revenue_categories')
                .select('*')
                .order('name');
            if (error) throw error;
            return data || [];
        },
    });
}

// Categorias de Despesas
export function useExpenseCategories() {
    return useQuery({
        queryKey: ['expense-categories'],
        queryFn: async (): Promise<ExpenseCategory[]> => {
            const { data, error } = await supabase
                .from('expense_categories')
                .select('*')
                .order('name');
            if (error) throw error;
            return data || [];
        },
    });
}

// Receitas
export function useRevenues(startDate?: string, endDate?: string) {
    return useQuery({
        queryKey: ['revenues', startDate, endDate],
        queryFn: async (): Promise<Revenue[]> => {
            let query = supabase
                .from('revenues')
                .select(`
                    *,
                    category:revenue_categories(id, name),
                    team_member:team_members(id, name),
                    professional:professionals(id, name)
                `);

            if (startDate && endDate) {
                query = query
                    .gte('due_date', startDate)
                    .lte('due_date', endDate);
            }

            const { data, error } = await query.order('due_date', { ascending: false });
            if (error) throw error;
            return data || [];
        },
    });
}

// Despesas
export function useExpenses(startDate?: string, endDate?: string) {
    return useQuery({
        queryKey: ['expenses', startDate, endDate],
        queryFn: async (): Promise<Expense[]> => {
            let query = supabase
                .from('expenses')
                .select(`
                    *,
                    category:expense_categories(id, name)
                `);

            if (startDate && endDate) {
                query = query
                    .gte('due_date', startDate)
                    .lte('due_date', endDate);
            }

            const { data, error } = await query.order('due_date', { ascending: false });
            if (error) throw error;
            return data || [];
        },
    });
}

// Custos com Equipe
export function useTeamCosts(startDate?: string, endDate?: string) {
    return useQuery({
        queryKey: ['team-costs', startDate, endDate],
        queryFn: async (): Promise<TeamCost[]> => {
            let query = supabase
                .from('team_costs')
                .select(`
                    *,
                    team_member:team_members(id, name, avatar_url),
                    professional:professionals(id, name, photo_url)
                `);

            if (startDate && endDate) {
                query = query
                    .gte('due_date', startDate)
                    .lte('due_date', endDate);
            }

            const { data, error } = await query.order('due_date', { ascending: false });
            if (error) throw error;
            return data || [];
        },
    });
}

// Campanhas de Marketing
export function useMarketingCampaigns(startDate?: string, endDate?: string) {
    return useQuery({
        queryKey: ['marketing-campaigns', startDate, endDate],
        queryFn: async (): Promise<MarketingCampaign[]> => {
            let query = supabase
                .from('marketing_campaigns')
                .select('*');

            // Filter campaigns that are active during the period
            // A campaign is active if: start_date <= endDate AND (end_date IS NULL OR end_date >= startDate)
            if (startDate && endDate) {
                query = query
                    .lte('start_date', endDate) // Campaign started before or during the period end
                    .or(`end_date.is.null,end_date.gte.${startDate}`); // Campaign ends after period start or has no end date
            }

            const { data, error } = await query.order('start_date', { ascending: false });

            // Debug log
            console.log('[useMarketingCampaigns] Query result:', { data, error, startDate, endDate });

            if (error) throw error;
            return data || [];
        },
    });
}

// Team Members (para selects) - Busca de team_members (fonte única de verdade)
export function useTeamMembers() {
    return useQuery({
        queryKey: ['team-members-list'],
        queryFn: async () => {
            const { data: teamMembers, error } = await supabase
                .from('team_members')
                .select('id, user_id, name, avatar_url, role, commission')
                .order('name');

            if (error) {
                console.error('Error fetching team members:', error);
                throw error;
            }

            // Retornar com id = team_members.id (para FK em revenues)
            return (teamMembers || []).map((tm: any) => ({
                id: tm.id,           // team_members.id - usar para FK
                user_id: tm.user_id, // profiles.id - para referência
                name: tm.name,
                avatar_url: tm.avatar_url,
                role: tm.role,
                commission: tm.commission || 0
            }));
        },
    });
}

// Professionals (para selects)
export function useProfessionals() {
    return useQuery({
        queryKey: ['professionals-list'],
        queryFn: async () => {
            console.log('DEBUG: Fetching professionals...');
            const { data, error } = await supabase
                .from('professionals')
                .select('id, name, photo_url, role, service_ids, work_days, commission')
                .order('name');

            console.log('DEBUG: Professionals query result:', { data, error });

            if (error) {
                console.error('DEBUG: Error fetching professionals:', error);
                throw error;
            }
            return data || [];
        },
    });
}

// Products & Services (para selects)
export function useProductsServices(type?: 'product' | 'service') {
    return useQuery({
        queryKey: ['products-services-list', type],
        queryFn: async () => {
            let query = supabase
                .from('products_services')
                .select('id, name, type, price')
                .order('name');

            if (type) {
                query = query.eq('type', type);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        },
    });
}

// =============================================
// HOOKS DE MUTAÇÃO (CREATE/UPDATE/DELETE)
// =============================================

// === RECEITAS ===
export function useCreateRevenue() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: RevenueFormData) => {
            const { data: user } = await supabase.auth.getUser();
            if (!user.user) throw new Error('Usuário não autenticado');

            // CRITICAL FIX: Get owner_id from team_members for RLS compatibility
            // When agent creates revenue, we need to use admin's user_id, not agent's auth.uid()
            let ownerId = user.user.id; // Default to auth.uid() (for admins)

            // First try to find team_member by auth_user_id (for agents/supervisors)
            let { data: teamMember } = await supabase
                .from('team_members')
                .select('user_id')
                .eq('auth_user_id', user.user.id)
                .maybeSingle();

            // Fallback: check if user is admin (user_id = auth.uid())
            if (!teamMember) {
                const { data: adminMember } = await supabase
                    .from('team_members')
                    .select('user_id')
                    .eq('user_id', user.user.id)
                    .eq('role', 'admin')
                    .maybeSingle();
                teamMember = adminMember;
            }

            if (teamMember) {
                ownerId = teamMember.user_id; // Use owner's ID for RLS
            }

            // Explicit mapping to database columns only
            // Convert empty strings AND string "undefined" to null for UUID fields
            const isValidUUID = (value: string | undefined): string | null => {
                if (!value || value.trim() === '' || value === 'undefined') return null;
                return value;
            };

            const dbData = {
                user_id: ownerId, // Use owner_id instead of auth.uid() for RLS
                category_id: isValidUUID(data.category_id),
                product_service_id: isValidUUID(data.product_service_id),
                item: data.item,
                description: data.description || null,
                amount: data.amount,
                payment_method: data.payment_method,
                due_date: data.due_date,
                paid_date: isValidUUID(data.paid_date),
                status: data.status,
                team_member_id: isValidUUID(data.team_member_id),
                professional_id: isValidUUID(data.professional_id),
                contact_id: isValidUUID(data.contact_id),
                is_recurring: data.is_recurring,
                recurrence_period: data.is_recurring && data.recurrence_period ? data.recurrence_period : null,
            };

            console.log('=== REVENUE INSERT DEBUG ===');
            console.log('form data (original):', JSON.stringify(data, null, 2));
            console.log('db data (mapped):', JSON.stringify(dbData, null, 2));

            const { data: result, error } = await supabase
                .from('revenues')
                .insert(dbData)
                .select()
                .single();

            if (error) {
                console.error('Revenue insert error:', error);
                throw error;
            }

            // AUTO-CREATE COMMISSION EXPENSE if professional has commission > 0
            if (result && dbData.professional_id) {
                // Fetch professional's commission rate
                const { data: professional } = await supabase
                    .from('professionals')
                    .select('id, name, commission')
                    .eq('id', dbData.professional_id)
                    .single();

                if (professional && professional.commission > 0) {
                    const commissionAmount = (data.amount * professional.commission) / 100;

                    // Get or create "Comissão" expense category
                    let { data: commissionCategory } = await supabase
                        .from('expense_categories')
                        .select('id')
                        .eq('user_id', ownerId)
                        .eq('name', 'Comissão')
                        .single();

                    if (!commissionCategory) {
                        const { data: newCategory } = await supabase
                            .from('expense_categories')
                            .insert({ user_id: ownerId, name: 'Comissão', description: 'Comissões de profissionais' })
                            .select('id')
                            .single();
                        commissionCategory = newCategory;
                    }

                    // Calculate last day of current month
                    const now = new Date();
                    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                    const lastDayStr = lastDayOfMonth.toISOString().split('T')[0];

                    // Create commission expense
                    const commissionExpense = {
                        user_id: ownerId,
                        category_id: commissionCategory?.id || null,
                        item: `Comissão ${professional.name}`,
                        description: 'Comissionamento de profissional',
                        amount: commissionAmount,
                        payment_method: 'other',
                        due_date: lastDayStr,
                        paid_date: null,
                        status: 'pending',
                        is_recurring: false,
                        recurrence_period: null,
                        commission_revenue_id: result.id, // Link to the revenue
                    };

                    const { error: expenseError } = await supabase
                        .from('expenses')
                        .insert(commissionExpense);

                    if (expenseError) {
                        console.error('Commission expense creation error:', expenseError);
                        // Don't throw - revenue was created successfully
                    } else {
                        console.log('Commission expense created:', commissionAmount);
                    }
                }
            }

            // AUTO-CREATE COMMISSION EXPENSE if team_member has commission > 0
            if (result && dbData.team_member_id) {
                // Fetch team_member's commission rate
                const { data: teamMember } = await supabase
                    .from('team_members')
                    .select('id, name, commission')
                    .eq('id', dbData.team_member_id)
                    .single();

                if (teamMember && teamMember.commission > 0) {
                    const commissionAmount = (data.amount * teamMember.commission) / 100;

                    // Use same "Comissão" category
                    let { data: commissionCategory } = await supabase
                        .from('expense_categories')
                        .select('id')
                        .eq('user_id', ownerId)
                        .eq('name', 'Comissão')
                        .single();

                    if (!commissionCategory) {
                        const { data: newCategory } = await supabase
                            .from('expense_categories')
                            .insert({ user_id: ownerId, name: 'Comissão', description: 'Comissões de colaboradores' })
                            .select('id')
                            .single();
                        commissionCategory = newCategory;
                    }

                    // Calculate last day of current month
                    const now = new Date();
                    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                    const lastDayStr = lastDayOfMonth.toISOString().split('T')[0];

                    // Create commission expense for team_member
                    const commissionExpense = {
                        user_id: ownerId,
                        category_id: commissionCategory?.id || null,
                        item: `Comissão ${teamMember.name}`,
                        description: 'Comissionamento de atendente',
                        amount: commissionAmount,
                        payment_method: 'other',
                        due_date: lastDayStr,
                        paid_date: null,
                        status: 'pending',
                        is_recurring: false,
                        recurrence_period: null,
                        commission_revenue_id: result.id, // Link to the revenue
                    };

                    const { error: expenseError } = await supabase
                        .from('expenses')
                        .insert(commissionExpense);

                    if (expenseError) {
                        console.error('Team member commission expense creation error:', expenseError);
                        // Don't throw - revenue was created successfully
                    } else {
                        console.log('Team member commission expense created:', commissionAmount);
                    }
                }
            }

            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['revenues'] });
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
            queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
            queryClient.invalidateQueries({ queryKey: ['annual-balance'] });
            queryClient.invalidateQueries({ queryKey: ['revenue-by-agent'] });
            queryClient.invalidateQueries({ queryKey: ['revenue-by-professional'] });
            toast.success('Receita criada com sucesso');
        },
        onError: (error) => {
            toast.error('Erro ao criar receita: ' + error.message);
        },
    });
}

export function useUpdateRevenue() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: Partial<RevenueFormData> }) => {
            const { data: result, error } = await supabase
                .from('revenues')
                .update(data)
                .eq('id', id)
                .select('*, professional:professionals(id, name, commission)')
                .single();
            if (error) throw error;

            // SYNC COMMISSION EXPENSE if amount changed and has professional
            if (result && data.amount !== undefined && result.professional_id) {
                const professional = result.professional;
                if (professional && professional.commission > 0) {
                    const newCommissionAmount = (data.amount * professional.commission) / 100;

                    // Update the linked commission expense
                    const { error: updateError } = await supabase
                        .from('expenses')
                        .update({
                            amount: newCommissionAmount,
                            item: `Comissão ${professional.name}`
                        })
                        .eq('commission_revenue_id', id);

                    if (updateError) {
                        console.error('Commission expense update error:', updateError);
                    }
                }
            }

            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['revenues'] });
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
            queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
            queryClient.invalidateQueries({ queryKey: ['annual-balance'] });
            queryClient.invalidateQueries({ queryKey: ['revenue-by-professional'] });
            toast.success('Receita atualizada com sucesso');
        },
        onError: (error) => {
            toast.error('Erro ao atualizar receita: ' + error.message);
        },
    });
}

export function useDeleteRevenue() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            // Commission expense will be deleted automatically via ON DELETE CASCADE
            const { error } = await supabase
                .from('revenues')
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['revenues'] });
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
            queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
            queryClient.invalidateQueries({ queryKey: ['annual-balance'] });
            queryClient.invalidateQueries({ queryKey: ['revenue-by-professional'] });
            toast.success('Receita excluída com sucesso');
        },
        onError: (error) => {
            toast.error('Erro ao excluir receita: ' + error.message);
        },
    });
}

// === DESPESAS ===
export function useCreateExpense() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: ExpenseFormData) => {
            const { data: user } = await supabase.auth.getUser();
            if (!user.user) throw new Error('Usuário não autenticado');

            const ownerId = await getOwnerId(user.user.id);

            const { data: result, error } = await supabase
                .from('expenses')
                .insert({ ...data, user_id: ownerId })
                .select()
                .single();
            if (error) throw error;
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
            queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
            queryClient.invalidateQueries({ queryKey: ['annual-balance'] });
            toast.success('Despesa criada com sucesso');
        },
        onError: (error) => {
            toast.error('Erro ao criar despesa: ' + error.message);
        },
    });
}

export function useUpdateExpense() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: Partial<ExpenseFormData> }) => {
            const { data: result, error } = await supabase
                .from('expenses')
                .update(data)
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
            queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
            queryClient.invalidateQueries({ queryKey: ['annual-balance'] });
            toast.success('Despesa atualizada com sucesso');
        },
        onError: (error) => {
            toast.error('Erro ao atualizar despesa: ' + error.message);
        },
    });
}

export function useDeleteExpense() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('expenses')
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
            queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
            queryClient.invalidateQueries({ queryKey: ['annual-balance'] });
            toast.success('Despesa excluída com sucesso');
        },
        onError: (error) => {
            toast.error('Erro ao excluir despesa: ' + error.message);
        },
    });
}

// === CUSTOS COM EQUIPE ===
export function useCreateTeamCost() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: TeamCostFormData) => {
            const { data: user } = await supabase.auth.getUser();
            if (!user.user) throw new Error('Usuário não autenticado');

            const ownerId = await getOwnerId(user.user.id);

            const { data: result, error } = await supabase
                .from('team_costs')
                .insert({ ...data, user_id: ownerId })
                .select()
                .single();
            if (error) throw error;
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['team-costs'] });
            queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
            queryClient.invalidateQueries({ queryKey: ['annual-balance'] });
            toast.success('Custo com equipe criado com sucesso');
        },
        onError: (error) => {
            toast.error('Erro ao criar custo com equipe: ' + error.message);
        },
    });
}

export function useUpdateTeamCost() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: Partial<TeamCostFormData> }) => {
            const { data: result, error } = await supabase
                .from('team_costs')
                .update(data)
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['team-costs'] });
            queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
            queryClient.invalidateQueries({ queryKey: ['annual-balance'] });
            toast.success('Custo com equipe atualizado com sucesso');
        },
        onError: (error) => {
            toast.error('Erro ao atualizar custo com equipe: ' + error.message);
        },
    });
}

export function useDeleteTeamCost() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('team_costs')
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['team-costs'] });
            queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
            queryClient.invalidateQueries({ queryKey: ['annual-balance'] });
            toast.success('Custo com equipe excluído com sucesso');
        },
        onError: (error) => {
            toast.error('Erro ao excluir custo com equipe: ' + error.message);
        },
    });
}

// === CAMPANHAS DE MARKETING ===
// Valid enum values for campaign_status
const VALID_CAMPAIGN_STATUS = ['active', 'paused', 'finished'] as const;
type ValidCampaignStatus = typeof VALID_CAMPAIGN_STATUS[number];

function ensureValidCampaignStatus(status: string | undefined): ValidCampaignStatus {
    if (status && VALID_CAMPAIGN_STATUS.includes(status as ValidCampaignStatus)) {
        return status as ValidCampaignStatus;
    }
    console.warn('[ensureValidCampaignStatus] Invalid status received:', status, '- defaulting to "active"');
    return 'active'; // Default fallback
}

export function useCreateMarketingCampaign() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: MarketingCampaignFormData) => {
            const { data: user } = await supabase.auth.getUser();
            if (!user.user) throw new Error('Usuário não autenticado');

            const ownerId = await getOwnerId(user.user.id);

            // Sanitize data - ensure status is a valid enum value
            const insertData = {
                name: data.name,
                origin: data.origin,
                investment: data.investment,
                leads_count: data.leads_count,
                conversions_count: data.conversions_count,
                start_date: data.start_date,
                end_date: data.end_date || null,
                status: ensureValidCampaignStatus(data.status),
                notes: data.notes || null,
                user_id: ownerId,
            };

            // DEBUG: Log data before insert
            console.log('[useCreateMarketingCampaign] Data to insert:', JSON.stringify(insertData, null, 2));
            console.log('[useCreateMarketingCampaign] Status value:', insertData.status, 'Type:', typeof insertData.status);

            const { data: result, error } = await supabase
                .from('marketing_campaigns')
                .insert(insertData)
                .select()
                .single();
            if (error) throw error;
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['marketing-campaigns'] });
            toast.success('Campanha de marketing criada com sucesso');
        },
        onError: (error) => {
            toast.error('Erro ao criar campanha: ' + error.message);
        },
    });
}


export function useUpdateMarketingCampaign() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: Partial<MarketingCampaignFormData> }) => {
            // Sanitize status if present
            const updateData = {
                ...data,
                status: data.status ? ensureValidCampaignStatus(data.status) : undefined,
            };

            console.log('[useUpdateMarketingCampaign] Data to update:', JSON.stringify(updateData, null, 2));

            const { data: result, error } = await supabase
                .from('marketing_campaigns')
                .update(updateData)
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['marketing-campaigns'] });
            toast.success('Campanha de marketing atualizada com sucesso');
        },
        onError: (error) => {
            toast.error('Erro ao atualizar campanha: ' + error.message);
        },
    });
}


export function useDeleteMarketingCampaign() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('marketing_campaigns')
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['marketing-campaigns'] });
            toast.success('Campanha de marketing excluída com sucesso');
        },
        onError: (error) => {
            toast.error('Erro ao excluir campanha: ' + error.message);
        },
    });
}

// === CATEGORIAS ===
export function useCreateRevenueCategory() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: { name: string; description?: string }) => {
            const { data: user } = await supabase.auth.getUser();
            if (!user.user) throw new Error('Usuário não autenticado');

            const ownerId = await getOwnerId(user.user.id);

            const { data: result, error } = await supabase
                .from('revenue_categories')
                .insert({ ...data, user_id: ownerId })
                .select()
                .single();
            if (error) throw error;
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['revenue-categories'] });
            toast.success('Categoria de receita criada com sucesso');
        },
        onError: (error) => {
            toast.error('Erro ao criar categoria: ' + error.message);
        },
    });
}

export function useCreateExpenseCategory() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: { name: string; description?: string }) => {
            const { data: user } = await supabase.auth.getUser();
            if (!user.user) throw new Error('Usuário não autenticado');

            const ownerId = await getOwnerId(user.user.id);

            const { data: result, error } = await supabase
                .from('expense_categories')
                .insert({ ...data, user_id: ownerId })
                .select()
                .single();
            if (error) throw error;
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
            toast.success('Categoria de despesa criada com sucesso');
        },
        onError: (error) => {
            toast.error('Erro ao criar categoria: ' + error.message);
        },
    });
}
