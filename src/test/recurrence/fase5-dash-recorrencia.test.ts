// Fase 5 — dash Recorrência: containers por dia + filtro na aba Campanhas + alerta R9.
import { describe, it, expect } from "vitest";
import {
    isRecurrenceCampaign,
    filterOutRecurrence,
    filterRecurrenceOnly,
    recurrenceDayLabel,
    groupRecurrenceCampaignsByDate,
    recurrenceBlockedAlert,
    RECURRENCE_BLOCKED_ALERT,
} from "@/lib/recurrenceCampaigns";

const rec = (partial: any = {}) => ({
    name: "Recorrencia - Botox - Msg1 - 20/08/2026",
    status: "scheduled",
    recurrence_date: "2026-08-20",
    ...partial,
});
const normal = (partial: any = {}) => ({ name: "Promo Agosto", status: "dispatched", recurrence_date: null, ...partial });

describe("isRecurrenceCampaign / filtros", () => {
    it("recurrence_date preenchida = recorrência", () => {
        expect(isRecurrenceCampaign(rec())).toBe(true);
        expect(isRecurrenceCampaign(normal())).toBe(false);
        expect(isRecurrenceCampaign(undefined)).toBe(false);
        expect(isRecurrenceCampaign({})).toBe(false);
    });

    it("filterOutRecurrence remove só recorrência (aba/página Campanhas)", () => {
        const list = [normal({ name: "A" }), rec(), normal({ name: "B" })];
        const out = filterOutRecurrence(list);
        expect(out.map((c) => c.name)).toEqual(["A", "B"]);
    });

    it("filterRecurrenceOnly é o complemento", () => {
        const list = [normal(), rec(), rec({ recurrence_date: "2026-08-19" })];
        expect(filterRecurrenceOnly(list)).toHaveLength(2);
    });
});

describe("recurrenceDayLabel", () => {
    it('"Recorrencia - dd/MM/yyyy"', () => {
        expect(recurrenceDayLabel("2026-08-20")).toBe("Recorrencia - 20/08/2026");
        expect(recurrenceDayLabel("2026-01-05")).toBe("Recorrencia - 05/01/2026");
    });
});

describe("groupRecurrenceCampaignsByDate", () => {
    it("agrupa por dia, dias recentes primeiro, filhas ordenadas por nome", () => {
        const groups = groupRecurrenceCampaignsByDate([
            rec({ name: "Recorrencia - B - Msg1", recurrence_date: "2026-08-19" }),
            rec({ name: "Recorrencia - Z - Msg2", recurrence_date: "2026-08-20" }),
            rec({ name: "Recorrencia - A - Msg1", recurrence_date: "2026-08-20" }),
        ]);
        expect(groups).toHaveLength(2);
        expect(groups[0].dateISO).toBe("2026-08-20");
        expect(groups[0].label).toBe("Recorrencia - 20/08/2026");
        expect(groups[0].campaigns.map((c) => c.name)).toEqual([
            "Recorrencia - A - Msg1",
            "Recorrencia - Z - Msg2",
        ]);
        expect(groups[1].dateISO).toBe("2026-08-19");
    });

    it("ignora campanhas sem recurrence_date e conta bloqueadas", () => {
        const groups = groupRecurrenceCampaignsByDate([
            normal(),
            rec({ status: "blocked" }),
            rec({ status: "dispatched" }),
        ]);
        expect(groups).toHaveLength(1);
        expect(groups[0].campaigns).toHaveLength(2);
        expect(groups[0].blockedCount).toBe(1);
    });

    it("lista vazia → sem containers", () => {
        expect(groupRecurrenceCampaignsByDate([])).toEqual([]);
    });
});

describe("recurrenceBlockedAlert (R9)", () => {
    it("blocked → mensagem exata do alerta", () => {
        expect(recurrenceBlockedAlert(rec({ status: "blocked" }))).toBe(RECURRENCE_BLOCKED_ALERT);
        expect(RECURRENCE_BLOCKED_ALERT).toBe(
            "Campanha interrompida devido a não aprovação do template da Meta",
        );
    });

    it("demais status → null", () => {
        for (const status of ["scheduled", "dispatching", "dispatched", "expired", "error"]) {
            expect(recurrenceBlockedAlert(rec({ status }))).toBeNull();
        }
        expect(recurrenceBlockedAlert(null)).toBeNull();
    });
});
