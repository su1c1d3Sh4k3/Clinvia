/**
 * bd_data — bloco de contexto que acompanha toda mensagem recebida enviada ao
 * n8n. Fonte ÚNICA para WhatsApp (webhook-handle-message) e Instagram
 * (instagram-webhook): as mesmas chaves, na mesma ordem, para que as funções,
 * as APIs e os nós do fluxo funcionem sem ramificar por canal.
 *
 * O que não existe no canal vem com o mesmo valor neutro que o WhatsApp usa
 * quando não há dado (null, [], 'Nenhum agendamento pendente', ...) — a chave
 * NUNCA some, senão expressão do n8n que a referencia quebra.
 *
 * Chaves exclusivas de um canal entram por `extra` e são anexadas no FIM, para
 * não empurrar nada de lugar.
 */
import { buildBookingLink } from "./booking-link.ts";
import { CONVENIO_PROF_COLUMNS, filterRoomsForConvenio, getConvenioCatalog } from "./convenio-schedule.ts";
import { createServiceLabelResolver } from "./service-label.ts";
import { buildRecurrenceObjective, RECURRENCE_STAGE_PROMPTS } from "./recurrence-campaign.ts";

/**
 * Converte timestamp UTC (ISO) para o fuso de São Paulo (-03:00),
 * usado no payload enviado ao n8n (datas legíveis pela IA).
 * Ex.: "2026-07-28T18:00:00+00:00" → "2026-07-28T15:00:00-03:00"
 */
export function toSaoPaulo(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    // 'sv-SE' produz "YYYY-MM-DD HH:mm:ss"
    return d.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T') + '-03:00';
}

export interface BuildBdDataOptions {
    userId: string;
    contactId: string | null;
    conversationId: string | null;
    /** Só WhatsApp tem grupo; no Instagram fica null. */
    groupId?: string | null;
    /** Conexão de WhatsApp usada pelas tools do n8n (api-send-message etc). */
    instanceId: string | null;
    iaFunnelId: string | null;
    toneInject?: string | null;
    /** Casa o card do CRM: conexão de WhatsApp. */
    crmInstanceId?: string | null;
    /** Casa o card do CRM: conta de Instagram. */
    crmInstagramInstanceId?: string | null;
    /** Conexão cujas campanhas valem para este contato. null = sem campanha. */
    campaignInstanceId?: string | null;
    /** Conexão embutida no link público. null = não gera link. */
    bookingInstanceId?: string | null;
    bookingOrigin?: 'whatsapp' | 'instagram';
    /** Prefixo dos logs, para separar os dois canais no painel. */
    logPrefix?: string;
    /** Chaves específicas do canal — sempre anexadas no fim do objeto. */
    extra?: Record<string, unknown>;
}

export async function buildBdData(
    supabase: any,
    opts: BuildBdDataOptions,
): Promise<Record<string, unknown>> {
    const {
        userId,
        contactId,
        conversationId,
        groupId = null,
        instanceId,
        iaFunnelId,
        toneInject = null,
        crmInstanceId = null,
        crmInstagramInstanceId = null,
        campaignInstanceId = null,
        bookingInstanceId = null,
        bookingOrigin = 'whatsapp',
        logPrefix = '[bd_data]',
        extra,
    } = opts;

    let enrichedContact: any = null;
    let enrichedCrm: any = null;
    let enrichedServicesCatalog: any[] = [];
    let enrichedAvaliacoes: any[] = [];
    let enrichedConvenios: string[] = [];
    let enrichedAppointments: any = {};
    let enrichedLastSummary: any = null;
    let enrichedUnscheduledPurchases: any = 'Nenhuma compra realizada no momento';
    let enrichedHistory = '';

    // 0. Últimas 10 mensagens desta CONEXÃO em TOON (C|IA|A|DD/MM HH:MI|texto).
    // Inclui conversas já resolvidas do mesmo contato na mesma instância
    // (a RPC lê messages + conversations.messages_history).
    if (conversationId) {
        const { data: toon, error: toonErr } = await supabase
            .rpc('get_conversation_messages_toon', {
                p_conversation_id: conversationId,
                p_limit: 10,
            });
        if (toonErr) console.error(`${logPrefix} TOON history error:`, toonErr);
        enrichedHistory = toon || '';
    }

    if (contactId) {
        // 1. Contact data
        const { data: cData } = await supabase
            .from('contacts')
            .select('id, push_name, number, phone, email, cpf, company, instagram, patient, is_lead, client_stage, created_at')
            .eq('id', contactId)
            .single();
        enrichedContact = cData ? { ...cData, created_at: toSaoPaulo(cData.created_at) } : null;

        // 2. Active CRM deal + services — o card do funil desta conexão
        const { data: crmCards } = await supabase
            .from('crm_client')
            .select('id, stage, value, priority, is_active, instance_id, instagram_instance_id')
            .eq('contact_id', contactId)
            .eq('is_active', true);
        const crmCard = (crmCards || []).find((c: any) => (
            crmInstagramInstanceId
                ? c.instagram_instance_id === crmInstagramInstanceId
                : c.instance_id === crmInstanceId
        ))
            || (crmCards || []).find((c: any) => !c.instance_id && !c.instagram_instance_id)
            || null;

        if (crmCard) {
            const { data: crmSvcs } = await supabase
                .from('crm_client_services')
                .select('service_client_id, service_name, quantity, unit_price')
                .eq('crm_client_id', crmCard.id);
            const crmLabel = await createServiceLabelResolver(supabase, (crmSvcs || []).map((s: any) => s.service_client_id));
            enrichedCrm = {
                stage: crmCard.stage,
                value: crmCard.value,
                priority: crmCard.priority,
                is_active: crmCard.is_active,
                services: (crmSvcs || []).map((s: any) => ({
                    ...s,
                    service_name: crmLabel(s.service_client_id, s.service_name),
                })),
            };
        }

        // 3. Appointments: last completed + next pending
        const { data: lastApt } = await supabase
            .from('appointments')
            .select('service_id, service_name, professional_name, start_time, end_time, status, price')
            .eq('contact_id', contactId)
            .eq('type', 'appointment')
            .in('status', ['completed'])
            .order('start_time', { ascending: false })
            .limit(1)
            .maybeSingle();

        const { data: nextApt } = await supabase
            .from('appointments')
            .select('service_id, service_name, professional_name, start_time, end_time, status, price')
            .eq('contact_id', contactId)
            .eq('type', 'appointment')
            .in('status', ['pending', 'confirmed', 'rescheduled'])
            .gte('start_time', new Date().toISOString())
            .order('start_time', { ascending: true })
            .limit(1)
            .maybeSingle();

        const aptLabel = await createServiceLabelResolver(supabase, [lastApt?.service_id, nextApt?.service_id]);
        const aptToSP = (a: any) => ({
            ...a,
            service_name: aptLabel(a.service_id, a.service_name),
            start_time: toSaoPaulo(a.start_time),
            end_time: toSaoPaulo(a.end_time),
        });
        enrichedAppointments = {
            last_completed: lastApt ? aptToSP(lastApt) : 'Nenhum agendamento concluído',
            next_pending: nextApt ? aptToSP(nextApt) : 'Nenhum agendamento pendente',
        };

        // 3b. Compras (vendas) ainda sem agendamento vinculado
        const { data: unscheduledSales } = await supabase
            .from('sales')
            .select('service_client_id, product_name, quantity, unit_price, total_amount, sale_date, ia_scheduling, ia_contact_days, ia_scheduling_status')
            .eq('contact_id', contactId)
            .is('appointment_id', null)
            .order('sale_date', { ascending: false })
            .limit(20);

        if (unscheduledSales && unscheduledSales.length > 0) {
            const saleLabel = await createServiceLabelResolver(supabase, unscheduledSales.map((s: any) => s.service_client_id));
            enrichedUnscheduledPurchases = unscheduledSales.map((s: any) => ({
                service: saleLabel(s.service_client_id, s.product_name),
                quantity: s.quantity,
                unit_price: s.unit_price,
                total_amount: s.total_amount,
                sale_date: s.sale_date,
                ia_scheduling: s.ia_scheduling,
                ia_contact_days: s.ia_contact_days,
                ia_scheduling_status: s.ia_scheduling_status,
            }));
        }

        // 4. Last conversation summary
        const { data: lastConv } = await supabase
            .from('conversations')
            .select('summary, sentiment_score, updated_at')
            .eq('contact_id', contactId)
            .not('summary', 'is', null)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        enrichedLastSummary = lastConv ? { ...lastConv, updated_at: toSaoPaulo(lastConv.updated_at) } : null;
    }

    // 4b. Convênios da conta — bloco próprio no payload e marcação
    // "(Convênio: Unimed)" nos serviços atrelados a algum convênio.
    // Um serviço pode estar em mais de um plano, então guardamos a lista.
    const convenioNamesByService = new Map<string, string[]>();
    try {
        const { catchAll, list } = await getConvenioCatalog(supabase, userId);
        const convRows = catchAll ? [catchAll] : list;

        // Nem toda sala que atende o serviço atende convênio: o
        // payload leva "<convênio> - <descrição> - <salas>".
        const salasPorConvenio = new Map<string, string>();
        if (convRows.length > 0) {
            const [{ data: rooms, error: roomsErr }, { data: vinculos, error: vincErr }] = await Promise.all([
                supabase.from('professionals')
                    .select(`id, name, ${CONVENIO_PROF_COLUMNS}`)
                    .eq('user_id', userId)
                    .eq('active', true)
                    .eq('convenio_enabled', true),
                supabase.from('convenio_salas')
                    .select('convenio_id, professional_id')
                    .in('convenio_id', convRows.map((c: any) => c.id)),
            ]);
            if (roomsErr) console.warn(`${logPrefix} convenio rooms lookup failed:`, roomsErr.message);
            if (vincErr) console.warn(`${logPrefix} convenio_salas lookup failed:`, vincErr.message);
            for (const c of convRows) {
                const ids = new Set<string>(
                    (vinculos || [])
                        .filter((v: any) => v.convenio_id === c.id)
                        .map((v: any) => String(v.professional_id)),
                );
                const nomes = filterRoomsForConvenio((rooms || []) as any[], ids)
                    .map((p: any) => p.name)
                    .filter(Boolean);
                salasPorConvenio.set(c.id, nomes.join(', '));
            }
        }

        enrichedConvenios = convRows.map((c: any) => {
            const nome = catchAll ? 'Habilitado para todos os convênios' : c.nome;
            const desc = (c.descricao || '').trim() || 'sem descrição';
            const salas = salasPorConvenio.get(c.id) || 'nenhum profissional habilitado';
            return `${nome} - ${desc} - ${salas}`;
        });
        if (convRows.length > 0) {
            const { data: aptos, error: aptosErr } = await supabase
                .from('convenio_servicos')
                .select('convenio_id, service_client_id')
                .in('convenio_id', convRows.map((c: any) => c.id));
            if (aptosErr) {
                console.warn(`${logPrefix} convenio_servicos lookup failed:`, aptosErr.message);
            }
            // No catch-all o rótulo da linha é longo demais para virar sufixo.
            const convenioNameById = new Map<string, string>(
                convRows.map((c: any) => [c.id, catchAll ? 'todos os convênios' : c.nome]),
            );
            for (const r of aptos || []) {
                const nome = convenioNameById.get(r.convenio_id);
                if (!nome) continue;
                const arr = convenioNamesByService.get(r.service_client_id) || [];
                if (!arr.includes(nome)) arr.push(nome);
                convenioNamesByService.set(r.service_client_id, arr);
            }
        }
    } catch (convErr) {
        console.warn(`${logPrefix} convenios lookup failed:`, convErr);
    }

    // 5. Services catalog — service names + professionals
    // Categoria "Avaliação" sai do catálogo e vai num objeto separado
    const { data: catalogRaw } = await supabase
        .from('services_client')
        .select('id, service_name_id, professionals, category_id, name, description, price')
        .eq('user_id', userId)
        .eq('status', true);

    if (catalogRaw && catalogRaw.length > 0) {
        // Identifica categoria(s) "Avaliação" (accent-insensitive)
        const normalize = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        const catIds = [...new Set(catalogRaw.map((s: any) => s.category_id).filter(Boolean))];
        const avaliacaoCatIds = new Set<string>();
        if (catIds.length > 0) {
            const { data: cats } = await supabase.from('services_category')
                .select('id, name').in('id', catIds);
            for (const c of cats || []) {
                if (normalize(c.name) === 'avaliacao') avaliacaoCatIds.add(c.id);
            }
        }

        // Collect all professional IDs from all services
        const allProfIds = new Set<string>();
        for (const sc of catalogRaw) {
            for (const pid of (sc.professionals || [])) allProfIds.add(pid);
        }

        // Fetch professional names + roles
        // O cargo mora em `responsaveis` (professionals = sala) desde be0df58
        const profMap = new Map<string, string>();
        if (allProfIds.size > 0) {
            const { data: profs, error: profsError } = await supabase
                .from('professionals')
                .select('id, name, responsavel:responsaveis(role)')
                .in('id', [...allProfIds]);
            if (profsError) {
                console.error(`${logPrefix} Erro ao buscar profissionais:`, profsError);
            }
            for (const p of profs || []) {
                const role = (p as any).responsavel?.role;
                const label = role ? `${p.name} - ${role}` : p.name;
                profMap.set(p.id, label);
            }
        }

        const avaliacaoRows = catalogRaw.filter((s: any) => avaliacaoCatIds.has(s.category_id));
        const regularRows = catalogRaw.filter((s: any) => !avaliacaoCatIds.has(s.category_id));

        // Objeto separado de avaliações: nome, profissionais, descrição, valor
        enrichedAvaliacoes = avaliacaoRows.map((s: any) => {
            const profNames = (s.professionals || [])
                .map((pid: string) => profMap.get(pid))
                .filter(Boolean);
            const price = Number(s.price) || 0;
            return {
                nome: s.name,
                profissionais: profNames.length > 0 ? profNames.join(', ') : null,
                descricao: s.description || null,
                valor: price === 0 ? 'gratuito' : price,
                convenio: convenioNamesByService.get(s.id)?.join(', ') || null,
            };
        });

        // Group professionals by service_name_id (só serviços fora de Avaliação)
        const snProfMap = new Map<string, Set<string>>();
        // Um nome de serviço herda os convênios de QUALQUER aplicação dele
        const snConvenios = new Map<string, Set<string>>();
        for (const sc of regularRows) {
            if (!snProfMap.has(sc.service_name_id)) snProfMap.set(sc.service_name_id, new Set());
            for (const pid of (sc.professionals || [])) {
                const name = profMap.get(pid);
                if (name) snProfMap.get(sc.service_name_id)!.add(name);
            }
            for (const conv of convenioNamesByService.get(sc.id) || []) {
                if (!snConvenios.has(sc.service_name_id)) snConvenios.set(sc.service_name_id, new Set());
                snConvenios.get(sc.service_name_id)!.add(conv);
            }
        }

        const snIds = [...new Set(regularRows.map((s: any) => s.service_name_id))];
        if (snIds.length > 0) {
            const { data: sns } = await supabase.from('service_name').select('id, name').in('id', snIds);

            enrichedServicesCatalog = (sns || []).map((s: any) => {
                const profs = snProfMap.get(s.id);
                const profNames = profs && profs.size > 0 ? [...profs].join(', ') : null;
                const label = profNames ? `${s.name} (${profNames})` : s.name;
                const convs = snConvenios.get(s.id);
                return convs && convs.size > 0
                    ? `${label} (Convênio: ${[...convs].join(', ')})`
                    : label;
            });
        }
    }

    // Generate booking link for this contact
    let bookingLink: string | null = null;
    if (contactId && enrichedContact && bookingInstanceId) {
        bookingLink = buildBookingLink({
            user_id: userId,
            contact_id: contactId,
            contact_name: enrichedContact.push_name || "",
            instance_id: bookingInstanceId,
            ...(bookingOrigin === 'instagram' ? { origin: 'instagram' as const } : {}),
        });
    }

    // 6. Campanha ativa do contato NESTA instância (regra: 1 campanha ativa por contato por instância)
    //    Bloco `campaign` sempre presente no bd_data: campaign_tag = nome da tag/campanha ou 'sem campanha ativa'
    let campaignPrompt: string | null = null;
    let campaignBlock: Record<string, unknown> = { campaign_tag: 'sem campanha ativa' };
    if (contactId && campaignInstanceId) {
        try {
            const { data: campSent } = await supabase
                .from('campaign_contacts')
                .select('sent_at, raw_data, campaigns!inner(id, name, objective, services, professionals, discount_pct, initial_message, ai_prompt, ia_enabled, ia_function, scheduled_at, valid_until, status, instance_id, source_type, recurrence_service_client_id, recurrence_msg_number)')
                .eq('contact_id', contactId)
                .eq('status', 'sent')
                .eq('campaigns.instance_id', campaignInstanceId)
                .gte('campaigns.valid_until', new Date().toISOString())
                .in('campaigns.status', ['dispatching', 'dispatched'])
                .order('sent_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            const camp = (campSent as any)?.campaigns;
            if (camp) {
                // USER RULE: recorrência tem objetivo e prompt FIXOS por etapa
                // (Msg1=Prévia/Msg2=Vencimento/Msg3=Pós) — ignora o que está no
                // DB; só o desconto varia (já vai em discount_pct/services).
                const recMsg = camp.recurrence_msg_number;
                const isRecurrenceCamp = camp.source_type === 'recurrence'
                    && (recMsg === 1 || recMsg === 2 || recMsg === 3);
                let objectiveText: string | null = isRecurrenceCamp
                    ? buildRecurrenceObjective(recMsg as 1 | 2 | 3)
                    : (camp.objective || null);
                const aiPromptText: string | null = isRecurrenceCamp
                    ? RECURRENCE_STAGE_PROMPTS[recMsg as 1 | 2 | 3]
                    : (camp.ai_prompt || null);
                if (camp.ia_enabled) campaignPrompt = aiPromptText;
                // Objetivo por contato: interpola placeholders <var> a partir do
                // raw_data da entry (campanhas de recorrência gravam o objetivo
                // fixo da etapa com placeholders — a campanha agrupa contatos).
                const entryVars = (campSent as any)?.raw_data;
                if (objectiveText && entryVars && typeof entryVars === 'object') {
                    objectiveText = objectiveText.replace(/<([a-z0-9_]+)>/gi, (match: string, key: string) => {
                        const v = (entryVars as Record<string, unknown>)[key];
                        return v != null && String(v).trim() !== '' ? String(v).trim() : match;
                    });
                }
                // Profissionais habilitados na campanha — só contexto
                // para a IA (restringe com quem ela pode agendar).
                // Vai em STRING pronta; lista vazia = todos.
                const profNames = (Array.isArray(camp.professionals) ? camp.professionals : [])
                    .map((p: any) => String(p?.name ?? '').trim())
                    .filter(Boolean);
                const professionalsText = profNames.length === 0
                    ? 'Campanha habilitada a todos os profissionais'
                    : `Campanha habilitada para os profissionais: ${
                        profNames.length === 1
                            ? profNames[0]
                            : `${profNames.slice(0, -1).join(', ')} e ${profNames[profNames.length - 1]}`
                    }`;

                campaignBlock = {
                    campaign_tag: camp.name,
                    campaign_id: camp.id,
                    name: camp.name,
                    objective: objectiveText,
                    services: camp.services || [],
                    professionals: professionalsText,
                    discount_pct: camp.discount_pct ?? null,
                    initial_message: camp.initial_message || null,
                    scheduled_at: toSaoPaulo(camp.scheduled_at),
                    valid_until: toSaoPaulo(camp.valid_until),
                    ia_enabled: !!camp.ia_enabled,
                    ia_function: camp.ia_function ?? null,
                    campaign_prompt: aiPromptText,
                    service_description: null as string | null,
                    // Explícito para o n8n: recorrência não precisa ser
                    // deduzida do texto do objetivo.
                    is_recurrence: isRecurrenceCamp,
                    recurrence_msg_number: isRecurrenceCamp ? recMsg : null,
                };
                // Serviço(s) atrelado(s) à campanha → descrição por item do array
                // services (services_client.description); service_description no
                // topo continua como agregado (compat n8n).
                try {
                    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                    const svcList: any[] = Array.isArray(camp.services) ? camp.services : [];
                    const svcIds = [...new Set(
                        [...svcList.map((s: any) => s?.id), camp.recurrence_service_client_id]
                            .filter((id: any) => typeof id === 'string' && uuidRe.test(id)),
                    )];
                    if (svcIds.length > 0) {
                        const { data: svcRows } = await supabase
                            .from('services_client')
                            .select('id, name, description')
                            .in('id', svcIds);
                        const descById = new Map<string, string>(
                            (svcRows || [])
                                .filter((s: any) => s.description && String(s.description).trim() !== '')
                                .map((s: any) => [s.id, String(s.description).trim()]),
                        );
                        // Cada serviço do array leva sua própria descrição
                        campaignBlock.services = svcList.map((s: any) =>
                            s && typeof s === 'object'
                                ? { ...s, description: descById.get(s.id) ?? null }
                                : s,
                        );
                        const withDesc = (svcRows || []).filter(
                            (s: any) => descById.has(s.id),
                        );
                        if (withDesc.length === 1) {
                            campaignBlock.service_description = descById.get(withDesc[0].id) ?? null;
                        } else if (withDesc.length > 1) {
                            campaignBlock.service_description = withDesc
                                .map((s: any) => `${s.name}: ${descById.get(s.id)}`)
                                .join('\n');
                        }
                    }
                } catch (svcErr) {
                    console.warn(`${logPrefix} campaign service description lookup failed:`, svcErr);
                }
            }
        } catch (campErr) {
            console.warn(`${logPrefix} campaign lookup failed:`, campErr);
        }
    }

    return {
        user_id: userId,
        contact_id: contactId || null,
        conversation_id: conversationId || null,
        group_id: groupId || null,
        instance_id: instanceId,
        ia_funnel_id: iaFunnelId,
        conversation_history: enrichedHistory,
        contact: enrichedContact,
        crm: enrichedCrm,
        services_catalog: enrichedServicesCatalog,
        avaliacoes: enrichedAvaliacoes,
        convenios: enrichedConvenios,
        appointments: enrichedAppointments,
        unscheduled_purchases: enrichedUnscheduledPurchases,
        last_summary: enrichedLastSummary,
        booking_link: bookingLink,
        campaign_prompt: campaignPrompt,
        campaign: campaignBlock,
        // Tom de voz da conta (aba Tom de voz em /ia-config).
        // Texto pronto, gerado pelo compositor — o n8n só injeta.
        tone_inject: toneInject ?? null,
        ...(extra || {}),
    };
}
