// Appointments functions for Bia AI
// Query and create appointments

import { UserContext, FunctionResult, ToolFunction } from './types.ts';
import { hasPermission, canViewAll } from './permissions.ts';
import { resolveDate, resolveTime, formatDateBR, formatCurrency, lookupProfessional, lookupContact, lookupProduct } from './helpers.ts';

// ============================================
// TOOL DEFINITIONS
// ============================================

export const appointmentsTools: ToolFunction[] = [
    {
        type: 'function',
        function: {
            name: 'appointments_get_today',
            description: 'Busca os agendamentos de hoje. Use quando o usuário perguntar "quais agendamentos de hoje" ou similar.',
            parameters: {
                type: 'object',
                properties: {
                    professional_name: {
                        type: 'string',
                        description: 'Nome do profissional para filtrar (opcional)'
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'appointments_get_by_date',
            description: 'Busca agendamentos de uma data específica',
            parameters: {
                type: 'object',
                properties: {
                    date: {
                        type: 'string',
                        description: 'Data (hoje, amanhã, DD/MM, ou YYYY-MM-DD)'
                    },
                    professional_name: {
                        type: 'string',
                        description: 'Nome do profissional para filtrar (opcional)'
                    }
                },
                required: ['date']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'appointments_get_by_professional',
            description: 'Busca agendamentos de um profissional específico',
            parameters: {
                type: 'object',
                properties: {
                    professional_name: {
                        type: 'string',
                        description: 'Nome do profissional'
                    },
                    start_date: {
                        type: 'string',
                        description: 'Data inicial (opcional, padrão: hoje)'
                    },
                    end_date: {
                        type: 'string',
                        description: 'Data final (opcional, padrão: 7 dias)'
                    }
                },
                required: ['professional_name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'appointments_get_by_service',
            description: 'Busca agendamentos de um serviço específico',
            parameters: {
                type: 'object',
                properties: {
                    service_name: {
                        type: 'string',
                        description: 'Nome do serviço'
                    },
                    start_date: {
                        type: 'string',
                        description: 'Data inicial (opcional)'
                    },
                    end_date: {
                        type: 'string',
                        description: 'Data final (opcional)'
                    }
                },
                required: ['service_name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'appointments_create',
            description: 'Cria um novo agendamento. Use quando o usuário pedir para agendar algo.',
            parameters: {
                type: 'object',
                properties: {
                    professional_name: {
                        type: 'string',
                        description: 'Nome do profissional'
                    },
                    contact_name: {
                        type: 'string',
                        description: 'Nome do cliente'
                    },
                    service_name: {
                        type: 'string',
                        description: 'Nome do serviço (opcional)'
                    },
                    date: {
                        type: 'string',
                        description: 'Data do agendamento'
                    },
                    time: {
                        type: 'string',
                        description: 'Horário do agendamento (ex: 14h, 14:30)'
                    },
                    description: {
                        type: 'string',
                        description: 'Descrição ou observação (opcional)'
                    }
                },
                required: ['professional_name', 'date', 'time']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'appointments_update_status',
            description: 'Altera o status de um agendamento (concluído, cancelado)',
            parameters: {
                type: 'object',
                properties: {
                    professional_name: {
                        type: 'string',
                        description: 'Nome do profissional'
                    },
                    date: {
                        type: 'string',
                        description: 'Data do agendamento'
                    },
                    time: {
                        type: 'string',
                        description: 'Horário do agendamento'
                    },
                    new_status: {
                        type: 'string',
                        description: 'Novo status',
                        enum: ['completed', 'cancelled']
                    }
                },
                required: ['professional_name', 'date', 'time', 'new_status']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'appointments_get_availability',
            description: 'Verifica horários disponíveis de um profissional em uma data',
            parameters: {
                type: 'object',
                properties: {
                    professional_name: {
                        type: 'string',
                        description: 'Nome do profissional'
                    },
                    date: {
                        type: 'string',
                        description: 'Data para verificar disponibilidade'
                    }
                },
                required: ['professional_name', 'date']
            }
        }
    }
];

// ============================================
// FUNCTION HANDLERS
// ============================================

export async function handleAppointmentsFunction(
    functionName: string,
    args: Record<string, any>,
    supabase: any,
    context: UserContext
): Promise<FunctionResult> {

    switch (functionName) {
        case 'appointments_get_today':
            return await appointmentsGetByDate(supabase, context, { date: 'hoje', ...args });
        case 'appointments_get_by_date':
            return await appointmentsGetByDate(supabase, context, args);
        case 'appointments_get_by_professional':
            return await appointmentsGetByProfessional(supabase, context, args);
        case 'appointments_get_by_service':
            return await appointmentsGetByService(supabase, context, args);
        case 'appointments_create':
            return await appointmentsCreate(supabase, context, args);
        case 'appointments_update_status':
            return await appointmentsUpdateStatus(supabase, context, args);
        case 'appointments_get_availability':
            return await appointmentsGetAvailability(supabase, context, args);
        default:
            return { success: false, error: `Função desconhecida: ${functionName}` };
    }
}

// ============================================
// FUNCTION IMPLEMENTATIONS
// ============================================

async function appointmentsGetByDate(
    supabase: any,
    context: UserContext,
    args: { date: string; professional_name?: string }
): Promise<FunctionResult> {

    const dateStr = resolveDate(args.date);
    const startOfDay = `${dateStr}T00:00:00`;
    const endOfDay = `${dateStr}T23:59:59`;

    console.log('[appointments] Query params:', {
        owner_id: context.owner_id,
        dateStr,
        startOfDay,
        endOfDay,
        inputDate: args.date
    });

    let query = supabase
        .from('appointments')
        .select(`
            id, start_time, end_time, price, description, type,
            professionals (name),
            contacts (push_name, phone),
            products_services (name)
        `)
        .eq('user_id', context.owner_id)
        .gte('start_time', startOfDay)
        .lte('start_time', endOfDay)
        .order('start_time');

    // Filter by professional if specified
    if (args.professional_name) {
        const lookup = await lookupProfessional(supabase, args.professional_name, context.owner_id);
        if (!lookup.found) {
            return { success: true, data: { found: false, message: `Profissional "${args.professional_name}" não encontrado` } };
        }
        if (!lookup.single && !lookup.exact_match) {
            return { success: true, data: { found: false, message: lookup.message } };
        }
        query = query.eq('professional_id', lookup.items[0].id);
    }

    const { data, error } = await query;

    console.log('[appointments] Query result:', {
        count: data?.length || 0,
        error: error?.message,
        firstItem: data?.[0]?.start_time
    });

    if (error) {
        return { success: false, error: `Erro ao buscar agendamentos: ${error.message}` };
    }

    if (!data || data.length === 0) {
        const professionalFilter = args.professional_name ? ` do ${args.professional_name}` : '';
        return {
            success: true,
            data: {
                found: false,
                count: 0,
                date: formatDateBR(dateStr),
                message: `Não há agendamentos${professionalFilter} para ${formatDateBR(dateStr)}`
            }
        };
    }

    return {
        success: true,
        data: {
            found: true,
            count: data.length,
            date: formatDateBR(dateStr),
            appointments: data.map((a: any) => ({
                time: new Date(a.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                end_time: new Date(a.end_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                professional: a.professionals?.name || 'Não definido',
                client: a.contacts?.push_name || 'Cliente não informado',
                service: a.products_services?.name || 'Serviço não especificado',
                price: formatCurrency(a.price || 0),
                description: a.description || null
            }))
        }
    };
}

async function appointmentsGetByProfessional(
    supabase: any,
    context: UserContext,
    args: { professional_name: string; start_date?: string; end_date?: string }
): Promise<FunctionResult> {

    const lookup = await lookupProfessional(supabase, args.professional_name, context.owner_id);
    if (!lookup.found) {
        return { success: true, data: { found: false, message: `Profissional "${args.professional_name}" não encontrado` } };
    }
    if (!lookup.single && !lookup.exact_match) {
        return { success: true, data: { found: false, message: lookup.message } };
    }

    const professional = lookup.items[0];
    const startDate = resolveDate(args.start_date || 'hoje');
    const endDate = args.end_date ? resolveDate(args.end_date) : (() => {
        const d = new Date(startDate);
        d.setDate(d.getDate() + 7);
        return d.toISOString().split('T')[0];
    })();

    const { data, error } = await supabase
        .from('appointments')
        .select(`
            id, start_time, end_time, price, description, type,
            contacts (push_name, phone),
            products_services (name)
        `)
        .eq('user_id', context.owner_id)
        .eq('professional_id', professional.id)
        .gte('start_time', `${startDate}T00:00:00`)
        .lte('start_time', `${endDate}T23:59:59`)
        .eq('type', 'appointment')
        .order('start_time');

    if (error) {
        return { success: false, error: `Erro ao buscar agendamentos: ${error.message}` };
    }

    if (!data || data.length === 0) {
        return {
            success: true,
            data: {
                found: false,
                professional: professional.name,
                period: `${formatDateBR(startDate)} a ${formatDateBR(endDate)}`,
                message: `${professional.name} não tem agendamentos neste período`
            }
        };
    }

    // Group by date
    const byDate: Record<string, any[]> = {};
    data.forEach((a: any) => {
        const date = new Date(a.start_time).toISOString().split('T')[0];
        if (!byDate[date]) byDate[date] = [];
        byDate[date].push(a);
    });

    return {
        success: true,
        data: {
            found: true,
            professional: professional.name,
            period: `${formatDateBR(startDate)} a ${formatDateBR(endDate)}`,
            total_count: data.length,
            by_date: Object.entries(byDate).map(([date, appointments]) => ({
                date: formatDateBR(date),
                count: appointments.length,
                appointments: appointments.map((a: any) => ({
                    time: new Date(a.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                    client: a.contacts?.push_name || 'Cliente não informado',
                    service: a.products_services?.name || 'Serviço não especificado'
                }))
            }))
        }
    };
}

async function appointmentsGetByService(
    supabase: any,
    context: UserContext,
    args: { service_name: string; start_date?: string; end_date?: string }
): Promise<FunctionResult> {

    const lookup = await lookupProduct(supabase, args.service_name, context.owner_id, 'service');
    if (!lookup.found) {
        return { success: true, data: { found: false, message: `Serviço "${args.service_name}" não encontrado` } };
    }
    if (!lookup.single && !lookup.exact_match) {
        return { success: true, data: { found: false, message: lookup.message } };
    }

    const service = lookup.items[0];
    const startDate = resolveDate(args.start_date || 'hoje');
    const endDate = args.end_date ? resolveDate(args.end_date) : (() => {
        const d = new Date(startDate);
        d.setDate(d.getDate() + 30);
        return d.toISOString().split('T')[0];
    })();

    const { data, error } = await supabase
        .from('appointments')
        .select(`
            id, start_time, end_time, price,
            professionals (name),
            contacts (push_name)
        `)
        .eq('user_id', context.owner_id)
        .eq('service_id', service.id)
        .gte('start_time', `${startDate}T00:00:00`)
        .lte('start_time', `${endDate}T23:59:59`)
        .order('start_time');

    if (error) {
        return { success: false, error: `Erro ao buscar agendamentos: ${error.message}` };
    }

    return {
        success: true,
        data: {
            found: data && data.length > 0,
            service: service.name,
            period: `${formatDateBR(startDate)} a ${formatDateBR(endDate)}`,
            count: data?.length || 0,
            appointments: (data || []).map((a: any) => ({
                date: formatDateBR(a.start_time),
                time: new Date(a.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                professional: a.professionals?.name || 'Não definido',
                client: a.contacts?.push_name || 'Cliente não informado'
            }))
        }
    };
}

async function appointmentsCreate(
    supabase: any,
    context: UserContext,
    args: { professional_name: string; contact_name?: string; service_name?: string; date: string; time: string; description?: string }
): Promise<FunctionResult> {

    // Check permission
    if (!hasPermission(context.role, 'appointments:create')) {
        return { success: false, error: 'Você não tem permissão para criar agendamentos' };
    }

    // Lookup professional
    const profLookup = await lookupProfessional(supabase, args.professional_name, context.owner_id);
    if (!profLookup.found) {
        return { success: true, data: { needs_info: true, message: `Profissional "${args.professional_name}" não encontrado` } };
    }
    if (!profLookup.single && !profLookup.exact_match) {
        return { success: true, data: { needs_info: true, message: profLookup.message } };
    }
    const professional = profLookup.items[0];

    // Lookup contact if provided
    let contact = null;
    if (args.contact_name) {
        const contactLookup = await lookupContact(supabase, args.contact_name, context.owner_id);
        if (contactLookup.found && (contactLookup.single || contactLookup.exact_match)) {
            contact = contactLookup.items[0];
        } else if (contactLookup.found) {
            return { success: true, data: { needs_info: true, message: contactLookup.message } };
        }
    }

    // Lookup service if provided
    let service = null;
    let duration = 60; // Default 60 minutes
    if (args.service_name) {
        const serviceLookup = await lookupProduct(supabase, args.service_name, context.owner_id, 'service');
        if (serviceLookup.found && (serviceLookup.single || serviceLookup.exact_match)) {
            service = serviceLookup.items[0];
            duration = service.duration_minutes || 60;
        } else if (serviceLookup.found) {
            return { success: true, data: { needs_info: true, message: serviceLookup.message } };
        }
    }

    // Build datetime
    const dateStr = resolveDate(args.date);
    const timeStr = resolveTime(args.time);
    const startTime = new Date(`${dateStr}T${timeStr}:00`);
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

    // Build confirmation message
    const confirmationData = {
        professional: professional.name,
        client: contact?.name || 'Não informado',
        service: service?.name || 'Não especificado',
        date: formatDateBR(dateStr),
        time: timeStr,
        duration: `${duration} minutos`,
        price: service ? formatCurrency(service.price) : 'A definir'
    };

    return {
        success: true,
        needs_confirmation: true,
        confirmation_message: `Confirma o agendamento?\n\n👤 Profissional: **${confirmationData.professional}**\n👥 Cliente: **${confirmationData.client}**\n📋 Serviço: **${confirmationData.service}**\n📅 Data: **${confirmationData.date}**\n🕐 Horário: **${confirmationData.time}**\n⏱️ Duração: **${confirmationData.duration}**\n💰 Valor: **${confirmationData.price}**`,
        data: {
            action: 'create_appointment',
            params: {
                user_id: context.owner_id,
                professional_id: professional.id,
                contact_id: contact?.id || null,
                service_id: service?.id || null,
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
                price: service?.price || 0,
                description: args.description || null,
                type: 'appointment'
            },
            summary: confirmationData
        }
    };
}

async function appointmentsUpdateStatus(
    supabase: any,
    context: UserContext,
    args: { professional_name: string; date: string; time: string; new_status: string }
): Promise<FunctionResult> {

    // Check permission
    if (!hasPermission(context.role, 'appointments:update')) {
        return { success: false, error: 'Você não tem permissão para alterar agendamentos' };
    }

    // Find the appointment
    const profLookup = await lookupProfessional(supabase, args.professional_name, context.owner_id);
    if (!profLookup.found) {
        return { success: true, data: { found: false, message: `Profissional "${args.professional_name}" não encontrado` } };
    }

    const dateStr = resolveDate(args.date);
    const timeStr = resolveTime(args.time);
    const targetTime = `${dateStr}T${timeStr}:00`;

    // Find appointment within 30 min window
    const { data: appointments, error } = await supabase
        .from('appointments')
        .select('id, start_time, contacts (push_name)')
        .eq('user_id', context.owner_id)
        .eq('professional_id', profLookup.items[0].id)
        .gte('start_time', `${dateStr}T00:00:00`)
        .lte('start_time', `${dateStr}T23:59:59`)
        .order('start_time');

    if (error || !appointments || appointments.length === 0) {
        return { success: true, data: { found: false, message: 'Agendamento não encontrado nesta data' } };
    }

    // Find closest appointment to target time
    const targetDate = new Date(targetTime);
    let closest = appointments[0];
    let minDiff = Math.abs(new Date(closest.start_time).getTime() - targetDate.getTime());

    for (const apt of appointments) {
        const diff = Math.abs(new Date(apt.start_time).getTime() - targetDate.getTime());
        if (diff < minDiff) {
            minDiff = diff;
            closest = apt;
        }
    }

    const statusLabel = args.new_status === 'completed' ? 'concluído' : 'cancelado';

    return {
        success: true,
        needs_confirmation: true,
        confirmation_message: `Quer marcar o agendamento de **${closest.contacts?.push_name || 'Cliente'}** às **${new Date(closest.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}** como **${statusLabel}**?`,
        data: {
            action: 'update_appointment_status',
            params: {
                appointment_id: closest.id,
                status: args.new_status
            }
        }
    };
}

async function appointmentsGetAvailability(
    supabase: any,
    context: UserContext,
    args: { professional_name: string; date: string }
): Promise<FunctionResult> {

    const profLookup = await lookupProfessional(supabase, args.professional_name, context.owner_id);
    if (!profLookup.found) {
        return { success: true, data: { found: false, message: `Profissional "${args.professional_name}" não encontrado` } };
    }
    if (!profLookup.single && !profLookup.exact_match) {
        return { success: true, data: { found: false, message: profLookup.message } };
    }

    const professional = profLookup.items[0];
    const dateStr = resolveDate(args.date);

    // Get professional's work hours
    const { data: profData } = await supabase
        .from('professionals')
        .select('work_hours, work_days')
        .eq('id', professional.id)
        .single();

    const workHours = profData?.work_hours || { start: '09:00', end: '18:00', break_start: '12:00', break_end: '13:00' };

    // Get existing appointments for that day
    const { data: appointments } = await supabase
        .from('appointments')
        .select('start_time, end_time')
        .eq('user_id', context.owner_id)
        .eq('professional_id', professional.id)
        .gte('start_time', `${dateStr}T00:00:00`)
        .lte('start_time', `${dateStr}T23:59:59`)
        .order('start_time');

    // Generate available slots (simplified)
    const busyTimes = (appointments || []).map((a: any) => ({
        start: new Date(a.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        end: new Date(a.end_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    }));

    return {
        success: true,
        data: {
            professional: professional.name,
            date: formatDateBR(dateStr),
            work_hours: `${workHours.start} às ${workHours.end}`,
            break_time: `${workHours.break_start} às ${workHours.break_end}`,
            busy_slots: busyTimes,
            appointments_count: appointments?.length || 0
        }
    };
}
