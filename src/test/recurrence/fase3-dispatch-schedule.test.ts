// Fase 3 — Config Recorrência (R14/R18): horário aleatório de disparo + seleção
// de instância. Testa os módulos puros compartilhados com as edge functions.
import { describe, it, expect } from "vitest";
import {
    clampDispatchHour,
    clampRecurrenceDurationDays,
    randomDispatchTimeUtc,
    dispatchWindowLabel,
} from "../../../supabase/functions/_shared/recurrence-schedule";
import {
    selectRecurrenceInstance,
    type AutomationInstance,
} from "../../../supabase/functions/_shared/automation-instance";

// ── clampDispatchHour ────────────────────────────────────────────────────────

describe("clampDispatchHour", () => {
    it("mantém horas válidas 0..23", () => {
        expect(clampDispatchHour(0)).toBe(0);
        expect(clampDispatchHour(9)).toBe(9);
        expect(clampDispatchHour(17)).toBe(17);
        expect(clampDispatchHour(23)).toBe(23);
    });

    it("trunca decimais", () => {
        expect(clampDispatchHour(9.7)).toBe(9);
    });

    it("cai no padrão 9 para valores inválidos", () => {
        expect(clampDispatchHour(-1)).toBe(9);
        expect(clampDispatchHour(24)).toBe(9);
        expect(clampDispatchHour(null)).toBe(9);
        expect(clampDispatchHour(undefined)).toBe(9);
        expect(clampDispatchHour("10")).toBe(9);
        expect(clampDispatchHour(NaN)).toBe(9);
    });
});

// ── clampRecurrenceDurationDays ──────────────────────────────────────────────

describe("clampRecurrenceDurationDays", () => {
    it("mantém durações válidas 1..30", () => {
        expect(clampRecurrenceDurationDays(1)).toBe(1);
        expect(clampRecurrenceDurationDays(3)).toBe(3);
        expect(clampRecurrenceDurationDays(30)).toBe(30);
    });

    it("trunca decimais", () => {
        expect(clampRecurrenceDurationDays(5.9)).toBe(5);
    });

    it("cai no padrão 3 para valores inválidos", () => {
        expect(clampRecurrenceDurationDays(0)).toBe(3);
        expect(clampRecurrenceDurationDays(31)).toBe(3);
        expect(clampRecurrenceDurationDays(null)).toBe(3);
        expect(clampRecurrenceDurationDays(undefined)).toBe(3);
        expect(clampRecurrenceDurationDays("7")).toBe(3);
        expect(clampRecurrenceDurationDays(NaN)).toBe(3);
    });
});

// ── randomDispatchTimeUtc ────────────────────────────────────────────────────

describe("randomDispatchTimeUtc", () => {
    it("rand=0 → exatamente X:00:00 BRT (X+3 UTC)", () => {
        // 9h BRT = 12h UTC
        expect(randomDispatchTimeUtc("2026-08-20", 9, () => 0)).toBe(
            "2026-08-20T12:00:00.000Z",
        );
    });

    it("rand≈1 → X:59:59 BRT (nunca alcança X+1:00)", () => {
        expect(randomDispatchTimeUtc("2026-08-20", 9, () => 0.999999999)).toBe(
            "2026-08-20T12:59:59.000Z",
        );
    });

    it("hora 17 → janela 17h-18h BRT (20h UTC)", () => {
        const iso = randomDispatchTimeUtc("2026-08-20", 17, () => 0.5);
        expect(iso).toBe("2026-08-20T20:30:00.000Z");
    });

    it("hora 22 BRT vira 1h UTC do dia seguinte", () => {
        expect(randomDispatchTimeUtc("2026-08-20", 22, () => 0)).toBe(
            "2026-08-21T01:00:00.000Z",
        );
    });

    it("hora 23 BRT vira 2h UTC do dia seguinte", () => {
        expect(randomDispatchTimeUtc("2026-08-20", 23, () => 0)).toBe(
            "2026-08-21T02:00:00.000Z",
        );
    });

    it("hora inválida cai no padrão 9 (12h UTC)", () => {
        expect(randomDispatchTimeUtc("2026-08-20", 99, () => 0)).toBe(
            "2026-08-20T12:00:00.000Z",
        );
    });

    it("sorteios ficam sempre dentro da janela de 1h", () => {
        for (let i = 0; i < 50; i++) {
            const iso = randomDispatchTimeUtc("2026-01-15", 9);
            const t = new Date(iso).getTime();
            const start = Date.UTC(2026, 0, 15, 12, 0, 0);
            const end = Date.UTC(2026, 0, 15, 13, 0, 0);
            expect(t).toBeGreaterThanOrEqual(start);
            expect(t).toBeLessThan(end);
        }
    });
});

// ── dispatchWindowLabel ──────────────────────────────────────────────────────

describe("dispatchWindowLabel", () => {
    it("formata a janela padrão", () => {
        expect(dispatchWindowLabel(9)).toBe("entre 9h e 10h");
        expect(dispatchWindowLabel(17)).toBe("entre 17h e 18h");
    });

    it("23h vira 0h no fim da janela", () => {
        expect(dispatchWindowLabel(23)).toBe("entre 23h e 0h");
    });

    it("valor inválido usa padrão 9", () => {
        expect(dispatchWindowLabel(-5)).toBe("entre 9h e 10h");
    });
});

// ── selectRecurrenceInstance ─────────────────────────────────────────────────

function inst(partial: Partial<AutomationInstance>): AutomationInstance {
    return {
        id: "id",
        apikey: null,
        provider: null,
        instance_name: null,
        status: "connected",
        user_id: "u",
        meta_waba_id: null,
        meta_phone_number_id: null,
        meta_access_token: null,
        is_automation_primary: false,
        ...partial,
    };
}

describe("selectRecurrenceInstance", () => {
    it("lista vazia → null", () => {
        expect(selectRecurrenceInstance([])).toBeNull();
    });

    it("prioriza is_recurrence_primary mesmo sendo UAZAPI e não sendo a 1ª", () => {
        const list = [
            inst({ id: "meta1", provider: "meta" }),
            inst({ id: "uaz1", provider: "uazapi", is_recurrence_primary: true }),
        ];
        expect(selectRecurrenceInstance(list)?.id).toBe("uaz1");
    });

    it("sem primária → prefere Meta (provider ou prefixo meta-)", () => {
        const byProvider = [
            inst({ id: "uaz1", provider: "uazapi" }),
            inst({ id: "meta1", provider: "meta" }),
        ];
        expect(selectRecurrenceInstance(byProvider)?.id).toBe("meta1");

        const byPrefix = [
            inst({ id: "uaz1", instance_name: "clinica-x" }),
            inst({ id: "meta2", instance_name: "meta-clinica" }),
        ];
        expect(selectRecurrenceInstance(byPrefix)?.id).toBe("meta2");
    });

    it("sem primária e sem Meta → primeira da lista (mais antiga)", () => {
        const list = [
            inst({ id: "old", provider: "uazapi" }),
            inst({ id: "new", provider: "uazapi" }),
        ];
        expect(selectRecurrenceInstance(list)?.id).toBe("old");
    });

    it("is_automation_primary NÃO influencia a recorrência", () => {
        const list = [
            inst({ id: "uaz1", provider: "uazapi", is_automation_primary: true }),
            inst({ id: "meta1", provider: "meta" }),
        ];
        expect(selectRecurrenceInstance(list)?.id).toBe("meta1");
    });
});
