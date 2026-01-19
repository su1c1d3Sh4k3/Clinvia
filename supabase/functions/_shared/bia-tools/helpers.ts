// Helper functions for Bia AI Function Calling
// Date resolution, name lookups, and formatting

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { LookupResult, TeamMember, Professional, Contact, ProductService, TaskBoard, CrmFunnel } from './types.ts';

// ============================================
// DATE RESOLUTION
// ============================================

/**
 * Resolve natural language date to ISO date string
 */
export function resolveDate(input: string): string {
    const now = new Date();
    const lowerInput = input.toLowerCase().trim();

    // Today
    if (lowerInput === 'hoje' || lowerInput === 'today') {
        return formatDateISO(now);
    }

    // Tomorrow
    if (lowerInput === 'amanhã' || lowerInput === 'amanha' || lowerInput === 'tomorrow') {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return formatDateISO(tomorrow);
    }

    // Yesterday
    if (lowerInput === 'ontem' || lowerInput === 'yesterday') {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        return formatDateISO(yesterday);
    }

    // Day of week
    const daysOfWeek: Record<string, number> = {
        'domingo': 0, 'sunday': 0,
        'segunda': 1, 'segunda-feira': 1, 'monday': 1,
        'terça': 2, 'terca': 2, 'terça-feira': 2, 'tuesday': 2,
        'quarta': 3, 'quarta-feira': 3, 'wednesday': 3,
        'quinta': 4, 'quinta-feira': 4, 'thursday': 4,
        'sexta': 5, 'sexta-feira': 5, 'friday': 5,
        'sábado': 6, 'sabado': 6, 'saturday': 6,
    };

    if (daysOfWeek[lowerInput] !== undefined) {
        const targetDay = daysOfWeek[lowerInput];
        const currentDay = now.getDay();
        let daysUntil = targetDay - currentDay;
        if (daysUntil <= 0) daysUntil += 7; // Next week
        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + daysUntil);
        return formatDateISO(targetDate);
    }

    // Try parsing as date (DD/MM, DD/MM/YYYY, YYYY-MM-DD)
    const brDateMatch = input.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if (brDateMatch) {
        const day = parseInt(brDateMatch[1]);
        const month = parseInt(brDateMatch[2]) - 1;
        const year = brDateMatch[3] ?
            (brDateMatch[3].length === 2 ? 2000 + parseInt(brDateMatch[3]) : parseInt(brDateMatch[3])) :
            now.getFullYear();
        return formatDateISO(new Date(year, month, day));
    }

    // ISO format
    const isoMatch = input.match(/^\d{4}-\d{2}-\d{2}$/);
    if (isoMatch) {
        return input;
    }

    // Default: try to parse
    const parsed = new Date(input);
    if (!isNaN(parsed.getTime())) {
        return formatDateISO(parsed);
    }

    // If all fails, return today
    return formatDateISO(now);
}

/**
 * Resolve time string to HH:MM format
 */
export function resolveTime(input: string): string {
    const cleaned = input.toLowerCase().replace(/[^0-9:h]/g, '');

    // Match patterns like "16h", "16:00", "16h30"
    const match = cleaned.match(/^(\d{1,2})(?:[:h](\d{2}))?$/);
    if (match) {
        const hours = match[1].padStart(2, '0');
        const minutes = match[2] || '00';
        return `${hours}:${minutes}`;
    }

    return '09:00'; // Default
}

/**
 * Format date as YYYY-MM-DD (local timezone, not UTC)
 */
export function formatDateISO(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Format date as DD/MM/YYYY
 */
export function formatDateBR(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('pt-BR');
}

/**
 * Format currency as R$ X.XXX,XX
 */
export function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

/**
 * Get date range for period
 */
export function getDateRange(period: 'week' | 'month' | 'year'): { start: string; end: string } {
    const now = new Date();
    const end = formatDateISO(now);
    let start: Date;

    switch (period) {
        case 'week':
            start = new Date(now);
            start.setDate(start.getDate() - 7);
            break;
        case 'month':
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        case 'year':
            start = new Date(now.getFullYear(), 0, 1);
            break;
    }

    return { start: formatDateISO(start), end };
}

// ============================================
// NAME LOOKUPS
// ============================================

/**
 * Lookup team member by name
 */
export async function lookupTeamMember(
    supabase: any,
    name: string,
    ownerId: string
): Promise<LookupResult<TeamMember>> {
    const { data, error } = await supabase
        .from('team_members')
        .select('id, name, role, auth_user_id')
        .eq('user_id', ownerId)
        .ilike('name', `%${name}%`);

    if (error || !data) {
        return { found: false, exact_match: false, single: false, items: [] };
    }

    const exactMatch = data.find((m: any) => m.name.toLowerCase() === name.toLowerCase());

    return {
        found: data.length > 0,
        exact_match: !!exactMatch,
        single: data.length === 1,
        items: exactMatch ? [exactMatch] : data,
        message: data.length > 1 && !exactMatch ?
            `Encontrei ${data.length} pessoas com esse nome: ${data.map((m: any) => m.name).join(', ')}. Qual deles?` :
            undefined
    };
}

/**
 * Lookup professional by name
 */
export async function lookupProfessional(
    supabase: any,
    name: string,
    ownerId: string
): Promise<LookupResult<Professional>> {
    const { data, error } = await supabase
        .from('professionals')
        .select('id, name, role')
        .eq('user_id', ownerId)
        .ilike('name', `%${name}%`);

    if (error || !data) {
        return { found: false, exact_match: false, single: false, items: [] };
    }

    const exactMatch = data.find((p: any) => p.name.toLowerCase() === name.toLowerCase());

    return {
        found: data.length > 0,
        exact_match: !!exactMatch,
        single: data.length === 1,
        items: exactMatch ? [exactMatch] : data,
        message: data.length > 1 && !exactMatch ?
            `Encontrei ${data.length} profissionais: ${data.map((p: any) => p.name).join(', ')}. Qual deles?` :
            undefined
    };
}

/**
 * Lookup contact by name
 */
export async function lookupContact(
    supabase: any,
    name: string,
    ownerId: string
): Promise<LookupResult<Contact>> {
    const { data, error } = await supabase
        .from('contacts')
        .select('id, push_name, phone, email, channel')
        .eq('user_id', ownerId)
        .ilike('push_name', `%${name}%`)
        .limit(10);

    if (error || !data) {
        return { found: false, exact_match: false, single: false, items: [] };
    }

    const exactMatch = data.find((c: any) => c.push_name?.toLowerCase() === name.toLowerCase());

    return {
        found: data.length > 0,
        exact_match: !!exactMatch,
        single: data.length === 1,
        items: exactMatch ? [exactMatch] : data,
        message: data.length > 1 && !exactMatch ?
            `Encontrei ${data.length} contatos: ${data.map((c: any) => c.push_name).join(', ')}. Qual deles?` :
            undefined
    };
}

/**
 * Lookup product/service by name
 */
export async function lookupProduct(
    supabase: any,
    name: string,
    ownerId: string,
    type?: 'product' | 'service'
): Promise<LookupResult<ProductService>> {
    let query = supabase
        .from('products_services')
        .select('id, type, name, description, price, stock_quantity, duration_minutes')
        .eq('user_id', ownerId)
        .ilike('name', `%${name}%`);

    if (type) {
        query = query.eq('type', type);
    }

    const { data, error } = await query.limit(10);

    if (error || !data) {
        return { found: false, exact_match: false, single: false, items: [] };
    }

    const exactMatch = data.find((p: any) => p.name.toLowerCase() === name.toLowerCase());

    return {
        found: data.length > 0,
        exact_match: !!exactMatch,
        single: data.length === 1,
        items: exactMatch ? [exactMatch] : data,
        message: data.length > 1 && !exactMatch ?
            `Encontrei ${data.length} itens: ${data.map((p: any) => p.name).join(', ')}. Qual deles?` :
            undefined
    };
}

/**
 * Lookup task board by name
 */
export async function lookupTaskBoard(
    supabase: any,
    name: string,
    ownerId: string
): Promise<LookupResult<TaskBoard>> {
    const { data, error } = await supabase
        .from('task_boards')
        .select('id, name, start_hour, end_hour')
        .eq('user_id', ownerId)
        .ilike('name', `%${name}%`);

    if (error || !data) {
        return { found: false, exact_match: false, single: false, items: [] };
    }

    const exactMatch = data.find((b: any) => b.name.toLowerCase() === name.toLowerCase());

    return {
        found: data.length > 0,
        exact_match: !!exactMatch,
        single: data.length === 1,
        items: exactMatch ? [exactMatch] : data,
        message: data.length > 1 && !exactMatch ?
            `Encontrei ${data.length} quadros: ${data.map((b: any) => b.name).join(', ')}. Qual deles?` :
            undefined
    };
}

/**
 * Lookup CRM funnel by name
 */
export async function lookupFunnel(
    supabase: any,
    name: string,
    ownerId: string
): Promise<LookupResult<CrmFunnel>> {
    const { data, error } = await supabase
        .from('crm_funnels')
        .select('id, name')
        .eq('user_id', ownerId)
        .ilike('name', `%${name}%`);

    if (error || !data) {
        return { found: false, exact_match: false, single: false, items: [] };
    }

    const exactMatch = data.find((f: any) => f.name.toLowerCase() === name.toLowerCase());

    return {
        found: data.length > 0,
        exact_match: !!exactMatch,
        single: data.length === 1,
        items: exactMatch ? [exactMatch] : data,
        message: data.length > 1 && !exactMatch ?
            `Encontrei ${data.length} funis: ${data.map((f: any) => f.name).join(', ')}. Qual deles?` :
            undefined
    };
}

// ============================================
// LIST HELPERS
// ============================================

/**
 * Get all task boards
 */
export async function getAllTaskBoards(supabase: any, ownerId: string): Promise<TaskBoard[]> {
    const { data } = await supabase
        .from('task_boards')
        .select('id, name, start_hour, end_hour')
        .eq('user_id', ownerId)
        .order('name');

    return data || [];
}

/**
 * Get all professionals
 */
export async function getAllProfessionals(supabase: any, ownerId: string): Promise<Professional[]> {
    const { data } = await supabase
        .from('professionals')
        .select('id, name, role')
        .eq('user_id', ownerId)
        .order('name');

    return data || [];
}

/**
 * Get all funnels with stages
 */
export async function getAllFunnels(supabase: any, ownerId: string): Promise<CrmFunnel[]> {
    const { data } = await supabase
        .from('crm_funnels')
        .select(`
            id, 
            name,
            crm_stages (id, name, order_index, stagnation_limit_days)
        `)
        .eq('user_id', ownerId)
        .order('name');

    return (data || []).map((f: any) => ({
        ...f,
        stages: f.crm_stages || []
    }));
}
