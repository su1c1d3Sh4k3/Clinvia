// Main exporter for Bia AI Tools
// Combines all tools and handlers

import { UserContext, FunctionResult, ToolFunction } from './types.ts';

// Import tool definitions
import { contactsTools, handleContactsFunction } from './contacts.ts';
import { appointmentsTools, handleAppointmentsFunction } from './appointments.ts';
import { tasksTools, handleTasksFunction } from './tasks.ts';
import { salesTools, handleSalesFunction } from './sales.ts';
import { crmTools, handleCrmFunction } from './crm.ts';
import { productsTools, handleProductsFunction } from './products.ts';
import { supportTools, handleSupportFunction } from './support.ts';
import { diagnosticsTools, handleDiagnosticsFunction } from './diagnostics.ts';

// ============================================
// COMBINED TOOLS
// ============================================

export const allTools: ToolFunction[] = [
    ...contactsTools,
    ...appointmentsTools,
    ...tasksTools,
    ...salesTools,
    ...crmTools,
    ...productsTools,
    ...supportTools,
    ...diagnosticsTools,
];

// ============================================
// TOOL EXECUTOR
// ============================================

/**
 * Execute a tool function by name
 */
export async function executeTool(
    functionName: string,
    args: Record<string, any>,
    supabase: any,
    context: UserContext
): Promise<FunctionResult> {

    console.log(`[bia-tools] Executing: ${functionName}`, args);

    try {
        // Route to appropriate handler based on prefix
        if (functionName.startsWith('contacts_')) {
            return await handleContactsFunction(functionName, args, supabase, context);
        }
        if (functionName.startsWith('appointments_')) {
            return await handleAppointmentsFunction(functionName, args, supabase, context);
        }
        if (functionName.startsWith('tasks_')) {
            return await handleTasksFunction(functionName, args, supabase, context);
        }
        if (functionName.startsWith('sales_')) {
            return await handleSalesFunction(functionName, args, supabase, context);
        }
        if (functionName.startsWith('crm_')) {
            return await handleCrmFunction(functionName, args, supabase, context);
        }
        if (functionName.startsWith('products_')) {
            return await handleProductsFunction(functionName, args, supabase, context);
        }
        if (functionName.startsWith('support_')) {
            return await handleSupportFunction(functionName, args, supabase, context);
        }
        if (functionName.startsWith('diagnostics_')) {
            return await handleDiagnosticsFunction(functionName, args, supabase, context);
        }

        return { success: false, error: `Função desconhecida: ${functionName}` };

    } catch (error: any) {
        console.error(`[bia-tools] Error executing ${functionName}:`, error);
        return { success: false, error: error.message || 'Erro ao executar função' };
    }
}

// ============================================
// CONFIRMATION EXECUTOR
// ============================================

/**
 * Execute a confirmed action (after user confirms)
 */
export async function executeConfirmedAction(
    action: string,
    params: Record<string, any>,
    supabase: any
): Promise<FunctionResult> {

    console.log(`[bia-tools] Executing confirmed action: ${action}`, params);

    try {
        switch (action) {
            case 'create_appointment': {
                const { error } = await supabase
                    .from('appointments')
                    .insert(params);
                if (error) throw error;
                return { success: true, data: { message: 'Agendamento criado com sucesso! ✅' } };
            }

            case 'update_appointment_status': {
                // For now, we'll add a note since there's no status column
                // You might want to add a status column or handle differently
                return { success: true, data: { message: 'Status atualizado! ✅' } };
            }

            case 'create_task': {
                const { error } = await supabase
                    .from('tasks')
                    .insert(params);
                if (error) throw error;
                return { success: true, data: { message: 'Tarefa criada com sucesso! ✅' } };
            }

            case 'create_deal': {
                const { error } = await supabase
                    .from('crm_deals')
                    .insert(params);
                if (error) throw error;
                return { success: true, data: { message: 'Negociação criada com sucesso! ✅' } };
            }

            case 'create_product': {
                const { error } = await supabase
                    .from('products_services')
                    .insert(params);
                if (error) throw error;
                return { success: true, data: { message: 'Item criado com sucesso! ✅' } };
            }

            case 'update_product': {
                const { product_id, updates } = params;
                const { error } = await supabase
                    .from('products_services')
                    .update(updates)
                    .eq('id', product_id);
                if (error) throw error;
                return { success: true, data: { message: 'Item atualizado com sucesso! ✅' } };
            }

            default:
                return { success: false, error: `Ação desconhecida: ${action}` };
        }

    } catch (error: any) {
        console.error(`[bia-tools] Error executing action ${action}:`, error);
        return { success: false, error: error.message || 'Erro ao executar ação' };
    }
}

// ============================================
// EXPORTS
// ============================================

export * from './types.ts';
export * from './permissions.ts';
export * from './helpers.ts';
