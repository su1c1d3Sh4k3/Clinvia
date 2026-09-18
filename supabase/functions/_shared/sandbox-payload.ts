/**
 * bd_data do ambiente Sandbox.
 *
 * Espelha CHAVE POR CHAVE o bloco montado em `webhook-handle-message` (bloco
 * `forwardedPayload.bd_data`) — o fluxo do n8n é o mesmo, só muda a origem dos
 * dados: tabelas `sandbox_*` no lugar das reais. O catálogo (serviços,
 * profissionais, convênios) continua sendo o REAL da conta, em leitura.
 *
 * Se alguém adicionar uma chave lá e esquecer daqui, o teste de paridade
 * `src/test/sandbox/bd-data-parity.test.ts` quebra.
 */

import { buildRecurrenceObjective, RECURRENCE_STAGE_PROMPTS } from "./recurrence-campaign.ts";
import { CONVENIO_PROF_COLUMNS, filterRoomsForConvenio, getConvenioCatalog } from "./convenio-schedule.ts";
import { createServiceLabelResolver } from "./service-label.ts";
import { buildSandboxBookingLink, type SandboxContext, toSaoPaulo } from "./sandbox.ts";

const normalize = (s: string) =>
    (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * Histórico em TOON, mesma forma da RPC `get_conversation_messages_toon`:
 * `C|DD/MM HH:MI|texto` (cliente) ou `IA|DD/MM HH:MI|texto`.
 */
function toonHistory(messages: any[]): string {
    return messages
        .map((m) => {
            const quem = m.role === "user" ? "C" : "IA";
            const d = new Date(m.created_at);
            const quando = d
                .toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" })
                .slice(5, 16) // "MM-DD HH:MM"
                .replace(/^(\d{2})-(\d{2})/, "$2/$1");
            const texto = String(m.content || "").replace(/[\r\n]+/g, " ");
            return `${quem}|${quando}|${texto}`;
        })
        .join("\n");
}

export async function buildSandboxBdData(
    supabase: any,
    ctx: SandboxContext,
): Promise<Record<string, unknown>> {
    const { userId, session, contact, conversation } = ctx;

    // ── 0. Histórico (respeita o LIMPAR, que grava ia_context_reset_at) ──
    let histQuery = supabase
        .from("sandbox_messages")
        .select("role, content, created_at")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: false })
        .limit(10);
    if (contact.ia_context_reset_at) histQuery = histQuery.gt("created_at", contact.ia_context_reset_at);
    const { data: histRows } = await histQuery;
    const conversationHistory = toonHistory((histRows || []).slice().reverse());

    // ── 1. Paciente fictício, no mesmo formato de `contacts` ──
    const enrichedContact = {
        id: contact.id,
        push_name: contact.push_name,
        number: contact.number,
        phone: contact.number,
        email: contact.email,
        cpf: contact.cpf,
        company: contact.company,
        instagram: contact.instagram,
        patient: contact.patient,
        is_lead: contact.client_stage === "lead",
        client_stage: contact.client_stage,
        created_at: toSaoPaulo(contact.created_at),
    };

    // ── 2. Card do CRM ──
    let enrichedCrm: Record<string, unknown> | null = null;
    const { data: crmCard } = await supabase
        .from("sandbox_crm")
        .select("id, stage, is_active")
        .eq("session_id", session.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
    if (crmCard) {
        const { data: crmSvcs } = await supabase
            .from("sandbox_crm_services")
            .select("service_client_id, service_name, price")
            .eq("crm_id", crmCard.id);
        const crmLabel = await createServiceLabelResolver(
            supabase, (crmSvcs || []).map((s: any) => s.service_client_id),
        );
        enrichedCrm = {
            stage: crmCard.stage,
            value: (crmSvcs || []).reduce((acc: number, s: any) => acc + (Number(s.price) || 0), 0),
            priority: null,
            is_active: crmCard.is_active,
            services: (crmSvcs || []).map((s: any) => ({
                service_client_id: s.service_client_id,
                service_name: crmLabel(s.service_client_id, s.service_name),
                quantity: 1,
                unit_price: s.price,
            })),
        };
    }

    // ── 3. Agendamentos do sandbox ──
    const [{ data: lastApt }, { data: nextApt }] = await Promise.all([
        supabase.from("sandbox_appointments")
            .select("service_id, title, professional_id, start_time, end_time, status")
            .eq("session_id", session.id).eq("status", "completed")
            .order("start_time", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("sandbox_appointments")
            .select("service_id, title, professional_id, start_time, end_time, status")
            .eq("session_id", session.id).in("status", ["pending", "confirmed", "rescheduled"])
            .gte("start_time", new Date().toISOString())
            .order("start_time", { ascending: true }).limit(1).maybeSingle(),
    ]);

    const aptLabel = await createServiceLabelResolver(supabase, [lastApt?.service_id, nextApt?.service_id]);
    const profIds = [lastApt?.professional_id, nextApt?.professional_id].filter(Boolean);
    const profNameById = new Map<string, string>();
    if (profIds.length > 0) {
        const { data: profs } = await supabase.from("professionals").select("id, name").in("id", profIds);
        for (const p of profs || []) profNameById.set(p.id, p.name);
    }
    const aptToSP = (a: any) => ({
        service_id: a.service_id,
        service_name: aptLabel(a.service_id, a.title),
        professional_name: profNameById.get(a.professional_id) || null,
        start_time: toSaoPaulo(a.start_time),
        end_time: toSaoPaulo(a.end_time),
        status: a.status,
        price: null,
    });
    const enrichedAppointments = {
        last_completed: lastApt ? aptToSP(lastApt) : "Nenhum agendamento concluído",
        next_pending: nextApt ? aptToSP(nextApt) : "Nenhum agendamento pendente",
    };

    // ── 3b. Compras sem agendamento vinculado ──
    let enrichedUnscheduledPurchases: unknown = "Nenhuma compra realizada no momento";
    const { data: unscheduledSales } = await supabase
        .from("sandbox_sales")
        .select("service_client_id, service_name, value, sale_date")
        .eq("session_id", session.id)
        .is("appointment_id", null)
        .order("sale_date", { ascending: false })
        .limit(20);
    if (unscheduledSales && unscheduledSales.length > 0) {
        const saleLabel = await createServiceLabelResolver(
            supabase, unscheduledSales.map((s: any) => s.service_client_id),
        );
        enrichedUnscheduledPurchases = unscheduledSales.map((s: any) => ({
            service: saleLabel(s.service_client_id, s.service_name),
            quantity: 1,
            unit_price: s.value,
            total_amount: s.value,
            sale_date: s.sale_date,
            ia_scheduling: false,
            ia_contact_days: null,
            ia_scheduling_status: null,
        }));
    }

    // ── 4. Convênios da conta (catálogo REAL) ──
    const convenioNamesByService = new Map<string, string[]>();
    let enrichedConvenios: string[] = [];
    try {
        const { catchAll, list } = await getConvenioCatalog(supabase, userId);
        const convRows = catchAll ? [catchAll] : list;
        const salasPorConvenio = new Map<string, string>();
        if (convRows.length > 0) {
            const [{ data: rooms }, { data: vinculos }] = await Promise.all([
                supabase.from("professionals")
                    .select(`id, name, ${CONVENIO_PROF_COLUMNS}`)
                    .eq("user_id", userId).eq("active", true).eq("convenio_enabled", true),
                supabase.from("convenio_salas")
                    .select("convenio_id, professional_id")
                    .in("convenio_id", convRows.map((c: any) => c.id)),
            ]);
            for (const c of convRows) {
                const ids = new Set<string>(
                    (vinculos || []).filter((v: any) => v.convenio_id === c.id)
                        .map((v: any) => String(v.professional_id)),
                );
                salasPorConvenio.set(
                    c.id,
                    filterRoomsForConvenio((rooms || []) as any[], ids).map((p: any) => p.name).filter(Boolean).join(", "),
                );
            }
        }
        enrichedConvenios = convRows.map((c: any) => {
            const nome = catchAll ? "Habilitado para todos os convênios" : c.nome;
            const desc = (c.descricao || "").trim() || "sem descrição";
            const salas = salasPorConvenio.get(c.id) || "nenhum profissional habilitado";
            return `${nome} - ${desc} - ${salas}`;
        });
        if (convRows.length > 0) {
            const { data: aptos } = await supabase.from("convenio_servicos")
                .select("convenio_id, service_client_id")
                .in("convenio_id", convRows.map((c: any) => c.id));
            const convenioNameById = new Map<string, string>(
                convRows.map((c: any) => [c.id, catchAll ? "todos os convênios" : c.nome]),
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
        console.warn("[sandbox] convenios lookup failed:", convErr);
    }

    // ── 5. Catálogo de serviços + avaliações (REAL) ──
    let enrichedServicesCatalog: string[] = [];
    let enrichedAvaliacoes: any[] = [];
    const { data: catalogRaw } = await supabase
        .from("services_client")
        .select("id, service_name_id, professionals, category_id, name, description, price")
        .eq("user_id", userId)
        .eq("status", true);

    if (catalogRaw && catalogRaw.length > 0) {
        const catIds = [...new Set(catalogRaw.map((s: any) => s.category_id).filter(Boolean))];
        const avaliacaoCatIds = new Set<string>();
        if (catIds.length > 0) {
            const { data: cats } = await supabase.from("services_category").select("id, name").in("id", catIds);
            for (const c of cats || []) if (normalize(c.name) === "avaliacao") avaliacaoCatIds.add(c.id);
        }

        const allProfIds = new Set<string>();
        for (const sc of catalogRaw) for (const pid of sc.professionals || []) allProfIds.add(pid);
        const profMap = new Map<string, string>();
        if (allProfIds.size > 0) {
            const { data: profs } = await supabase.from("professionals")
                .select("id, name, responsavel:responsaveis(role)").in("id", [...allProfIds]);
            for (const p of profs || []) {
                const role = (p as any).responsavel?.role;
                profMap.set(p.id, role ? `${p.name} - ${role}` : p.name);
            }
        }

        const avaliacaoRows = catalogRaw.filter((s: any) => avaliacaoCatIds.has(s.category_id));
        const regularRows = catalogRaw.filter((s: any) => !avaliacaoCatIds.has(s.category_id));

        enrichedAvaliacoes = avaliacaoRows.map((s: any) => {
            const profNames = (s.professionals || []).map((pid: string) => profMap.get(pid)).filter(Boolean);
            const price = Number(s.price) || 0;
            return {
                nome: s.name,
                profissionais: profNames.length > 0 ? profNames.join(", ") : null,
                descricao: s.description || null,
                valor: price === 0 ? "gratuito" : price,
                convenio: convenioNamesByService.get(s.id)?.join(", ") || null,
            };
        });

        const snProfMap = new Map<string, Set<string>>();
        const snConvenios = new Map<string, Set<string>>();
        for (const sc of regularRows) {
            if (!snProfMap.has(sc.service_name_id)) snProfMap.set(sc.service_name_id, new Set());
            for (const pid of sc.professionals || []) {
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
            const { data: sns } = await supabase.from("service_name").select("id, name").in("id", snIds);
            enrichedServicesCatalog = (sns || []).map((s: any) => {
                const profs = snProfMap.get(s.id);
                const profNames = profs && profs.size > 0 ? [...profs].join(", ") : null;
                const label = profNames ? `${s.name} (${profNames})` : s.name;
                const convs = snConvenios.get(s.id);
                return convs && convs.size > 0 ? `${label} (Convênio: ${[...convs].join(", ")})` : label;
            });
        }
    }

    // ── 6. Campanha simulada (comum ou recorrência) ──
    let campaignPrompt: string | null = null;
    let campaignBlock: Record<string, unknown> = { campaign_tag: "sem campanha ativa" };
    const { data: camp } = await supabase
        .from("sandbox_campaigns")
        .select("*")
        .eq("session_id", session.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (camp) {
        // USER RULE (mesma de produção): recorrência tem objetivo e prompt FIXOS
        // por etapa; só o desconto varia.
        const recMsg = camp.recurrence_msg_number;
        const isRecurrenceCamp = camp.source_type === "recurrence" && [1, 2, 3].includes(recMsg);
        const objectiveText: string | null = isRecurrenceCamp
            ? buildRecurrenceObjective(recMsg as 1 | 2 | 3)
            : (camp.objective || null);
        const aiPromptText: string | null = isRecurrenceCamp
            ? RECURRENCE_STAGE_PROMPTS[recMsg as 1 | 2 | 3]
            : (camp.ai_prompt || null);
        if (camp.ia_enabled) campaignPrompt = aiPromptText;

        const profNames = (camp.professionals || []).filter(Boolean);
        const professionalsText = profNames.length === 0
            ? "Campanha habilitada a todos os profissionais"
            : `Campanha habilitada para os profissionais: ${
                profNames.length === 1
                    ? profNames[0]
                    : `${profNames.slice(0, -1).join(", ")} e ${profNames[profNames.length - 1]}`
            }`;

        campaignBlock = {
            campaign_tag: camp.campaign_tag || camp.name,
            campaign_id: camp.id,
            name: camp.name,
            objective: objectiveText,
            services: (camp.services || []).map((nome: string) => ({ name: nome, description: null })),
            professionals: professionalsText,
            discount_pct: camp.discount_pct ?? null,
            initial_message: camp.initial_message || null,
            scheduled_at: toSaoPaulo(camp.scheduled_at),
            valid_until: toSaoPaulo(camp.valid_until),
            ia_enabled: !!camp.ia_enabled,
            ia_function: camp.ia_function ?? null,
            campaign_prompt: aiPromptText,
            service_description: camp.service_description ?? null,
            // Explícito para o n8n: recorrência não precisa ser deduzida do texto
            is_recurrence: isRecurrenceCamp,
            recurrence_msg_number: isRecurrenceCamp ? recMsg : null,
        };
    }

    // ── Tom de voz: a cópia de trabalho do sandbox vence a de produção ──
    let toneInject: string | null = session.tone_inject ?? null;
    if (!toneInject) {
        const { data: iaCfg } = await supabase
            .from("ia_config").select("tone_inject").eq("user_id", userId).maybeSingle();
        toneInject = iaCfg?.tone_inject ?? null;
    }

    return {
        user_id: userId,
        contact_id: contact.id,
        conversation_id: conversation.id,
        group_id: null,
        instance_id: null,
        ia_funnel_id: null,
        conversation_history: conversationHistory,
        contact: enrichedContact,
        crm: enrichedCrm,
        services_catalog: enrichedServicesCatalog,
        avaliacoes: enrichedAvaliacoes,
        convenios: enrichedConvenios,
        appointments: enrichedAppointments,
        unscheduled_purchases: enrichedUnscheduledPurchases,
        last_summary: conversation.last_summary
            ? { summary: conversation.last_summary, sentiment_score: null, updated_at: toSaoPaulo(conversation.created_at) }
            : null,
        booking_link: buildSandboxBookingLink({
            user_id: userId,
            contact_id: contact.id,
            contact_name: contact.push_name || "",
        }),
        campaign_prompt: campaignPrompt,
        campaign: campaignBlock,
        tone_inject: toneInject,
        // Marca o ambiente: o fluxo do n8n usa as tools -sandbox
        sandbox: true,
    };
}
