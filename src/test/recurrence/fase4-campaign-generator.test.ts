// Fase 4 — gerador diário de campanhas de recorrência (R7-R13).
// Testa a lógica pura em _shared/recurrence-campaign.ts.
import { describe, it, expect } from "vitest";
import {
    collectDueApproaches,
    groupDueApproaches,
    buildRecurrenceVars,
    buildRecurrenceCampaignName,
    toDispatchMessage,
    deriveApproachOutcome,
    formatPriceBRL,
    type RecurrenceTrackingRow,
} from "../../../supabase/functions/_shared/recurrence-campaign";

const TODAY = "2026-08-20";

function row(partial: Partial<RecurrenceTrackingRow>): RecurrenceTrackingRow {
    return {
        id: "t1",
        user_id: "u1",
        contact_id: "c1",
        appointment_id: "a1",
        service_client_id: "svc1",
        contact_name: "Maria",
        service_name: "Toxina Botulínica",
        application_name: "Botox Full Face",
        scheduled: false,
        approach_1_date: null,
        approach_1_status: "pendente",
        approach_2_date: null,
        approach_2_status: "pendente",
        approach_3_date: null,
        approach_3_status: "pendente",
        ...partial,
    };
}

// ── collectDueApproaches ─────────────────────────────────────────────────────

describe("collectDueApproaches", () => {
    it("seleciona abordagem com data vencida hoje e status pendente", () => {
        const dues = collectDueApproaches([row({ approach_1_date: TODAY })], TODAY);
        expect(dues).toHaveLength(1);
        expect(dues[0].msgNumber).toBe(1);
        expect(dues[0].skippedNumbers).toEqual([]);
    });

    it("data futura não entra", () => {
        expect(collectDueApproaches([row({ approach_1_date: "2026-08-21" })], TODAY)).toHaveLength(0);
    });

    it("exclui scheduled=true (cliente já agendou)", () => {
        expect(
            collectDueApproaches([row({ approach_1_date: TODAY, scheduled: true })], TODAY),
        ).toHaveLength(0);
    });

    it("exclui sem contato ou sem serviço", () => {
        expect(collectDueApproaches([row({ approach_1_date: TODAY, contact_id: null })], TODAY)).toHaveLength(0);
        expect(
            collectDueApproaches([row({ approach_1_date: TODAY, service_client_id: null })], TODAY),
        ).toHaveLength(0);
    });

    it("exclui status não-pendente e abordagem já vinculada a campanha", () => {
        expect(
            collectDueApproaches([row({ approach_1_date: TODAY, approach_1_status: "sent" })], TODAY),
        ).toHaveLength(0);
        expect(
            collectDueApproaches(
                [row({ approach_1_date: TODAY, approach_1_campaign_id: "camp1" })],
                TODAY,
            ),
        ).toHaveLength(0);
    });

    it("2+ abordagens vencidas → dispara a MAIOR e marca as menores como skipped", () => {
        const dues = collectDueApproaches(
            [row({ approach_1_date: "2026-08-01", approach_2_date: "2026-08-15" })],
            TODAY,
        );
        expect(dues).toHaveLength(1);
        expect(dues[0].msgNumber).toBe(2);
        expect(dues[0].skippedNumbers).toEqual([1]);
    });

    it("abordagem 1 já enviada + abordagem 2 vencida → msg 2 sem skips", () => {
        const dues = collectDueApproaches(
            [
                row({
                    approach_1_date: "2026-08-01",
                    approach_1_status: "delivered",
                    approach_1_campaign_id: "camp1",
                    approach_2_date: TODAY,
                }),
            ],
            TODAY,
        );
        expect(dues).toHaveLength(1);
        expect(dues[0].msgNumber).toBe(2);
        expect(dues[0].skippedNumbers).toEqual([]);
    });
});

// ── groupDueApproaches ───────────────────────────────────────────────────────

describe("groupDueApproaches", () => {
    it("agrupa por (service_client_id, msgNumber)", () => {
        const dues = collectDueApproaches(
            [
                row({ id: "t1", contact_id: "c1", approach_1_date: TODAY }),
                row({ id: "t2", contact_id: "c2", approach_1_date: TODAY }),
                row({ id: "t3", contact_id: "c3", service_client_id: "svc2", approach_1_date: TODAY }),
                row({ id: "t4", contact_id: "c4", approach_2_date: TODAY }),
            ],
            TODAY,
        );
        const groups = groupDueApproaches(dues);
        expect(groups.size).toBe(3);
        expect(groups.get("svc1|1")).toHaveLength(2);
        expect(groups.get("svc2|1")).toHaveLength(1);
        expect(groups.get("svc1|2")).toHaveLength(1);
    });
});

// ── vars snapshot ────────────────────────────────────────────────────────────

describe("buildRecurrenceVars", () => {
    const due = collectDueApproaches([row({ approach_1_date: TODAY })], TODAY)[0];

    it("monta as 6 variáveis do editor", () => {
        const vars = buildRecurrenceVars(due, {
            clinicName: "Clínica Exemplo",
            price: 1200,
            professionalByAppointment: { a1: "Dra. Ana" },
        });
        expect(vars).toEqual({
            nome_cliente: "Maria",
            nome_clinica: "Clínica Exemplo",
            servico: "Toxina Botulínica",
            aplicacao: "Botox Full Face",
            preco: formatPriceBRL(1200),
            profissional: "Dra. Ana",
        });
        expect(vars.preco).toMatch(/1\.200,00/);
    });

    it("fallbacks: sem clínica/preço/profissional", () => {
        const vars = buildRecurrenceVars(due, {
            clinicName: "",
            price: null,
            professionalByAppointment: {},
        });
        expect(vars.nome_clinica).toBe("nossa clínica");
        expect(vars.preco).toBe("");
        expect(vars.profissional).toBe("nossa equipe");
    });
});

// ── nome da campanha + mensagem de disparo ───────────────────────────────────

describe("buildRecurrenceCampaignName", () => {
    it("Recorrência - <serviço> - Msg<N> - <dd/MM/yyyy> (R8, grafia com acento)", () => {
        expect(buildRecurrenceCampaignName("Toxina Botulínica", 2, "2026-08-20")).toBe(
            "Recorrência - Toxina Botulínica - Msg2 - 20/08/2026",
        );
    });
});

describe("toDispatchMessage", () => {
    it("converte {{var}} do editor para <var> do campaign-dispatch", () => {
        expect(toDispatchMessage("Olá {{nome_cliente}}, a {{ nome_clinica }} te espera!")).toBe(
            "Olá <nome_cliente>, a <nome_clinica> te espera!",
        );
    });

    it("texto sem variáveis fica intacto", () => {
        expect(toDispatchMessage("Sem variáveis.")).toBe("Sem variáveis.");
    });
});

// ── writeback R12 ────────────────────────────────────────────────────────────

describe("deriveApproachOutcome", () => {
    it("scheduled tem prioridade máxima", () => {
        expect(
            deriveApproachOutcome({ frozen_reason: "scheduled", frozen_responded: true, status: "sent" }),
        ).toBe("scheduled");
        expect(deriveApproachOutcome({ frozen_scheduled: true, status: "sent" })).toBe("scheduled");
    });

    it("responded vem antes de delivered/sent", () => {
        expect(
            deriveApproachOutcome({ frozen_responded: true, message_status: "delivered", status: "sent" }),
        ).toBe("responded");
    });

    it("failed: status failed/invalid ou message_status failed", () => {
        expect(deriveApproachOutcome({ status: "failed" })).toBe("failed");
        expect(deriveApproachOutcome({ status: "invalid" })).toBe("failed");
        expect(deriveApproachOutcome({ status: "sent", message_status: "failed" })).toBe("failed");
    });

    it("delivered/read → delivered; sent puro → sent", () => {
        expect(deriveApproachOutcome({ status: "sent", message_status: "delivered" })).toBe("delivered");
        expect(deriveApproachOutcome({ status: "sent", message_status: "read" })).toBe("delivered");
        expect(deriveApproachOutcome({ status: "sent" })).toBe("sent");
    });

    it("sem desfecho → null (pending/open_ticket não atualizam o tracking)", () => {
        expect(deriveApproachOutcome({ status: "pending" })).toBeNull();
        expect(deriveApproachOutcome({ status: "open_ticket" })).toBeNull();
        expect(deriveApproachOutcome({ status: "skipped" })).toBeNull();
    });
});
