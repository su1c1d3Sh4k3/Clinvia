import { describe, it, expect } from "vitest";
import {
    isMonitoringCampaign,
    filterOutMonitoring,
    filterMonitoringOnly,
    filterOutRecurrence,
} from "@/lib/recurrenceCampaigns";

const monitoring = () => ({ source_type: "monitoring", name: "Monitoramento - Grupo X - 22/08/2026" });
const normal = () => ({ source_type: "crm", name: "Campanha comum" });
const recurrence = () => ({ source_type: "recurrence", recurrence_date: "2026-08-01", name: "Recorrencia" });

describe("filtros de monitoramento de grupos", () => {
    it("isMonitoringCampaign detecta source_type='monitoring'", () => {
        expect(isMonitoringCampaign(monitoring())).toBe(true);
        expect(isMonitoringCampaign(normal())).toBe(false);
        expect(isMonitoringCampaign(recurrence())).toBe(false);
        expect(isMonitoringCampaign(undefined)).toBe(false);
        expect(isMonitoringCampaign({})).toBe(false);
    });

    it("filterOutMonitoring remove só monitoramento (/campanhas e lista comum da dash)", () => {
        const list = [monitoring(), normal(), recurrence()];
        const out = filterOutMonitoring(list);
        expect(out).toHaveLength(2);
        expect(out.every((c) => c.source_type !== "monitoring")).toBe(true);
    });

    it("filterMonitoringOnly mantém só monitoramento (sub-aba da dash)", () => {
        const list = [monitoring(), normal(), recurrence()];
        const only = filterMonitoringOnly(list);
        expect(only).toHaveLength(1);
        expect(only[0].source_type).toBe("monitoring");
    });

    it("página /campanhas: fora recorrência E monitoramento", () => {
        const list = [monitoring(), normal(), recurrence()];
        const page = filterOutMonitoring(filterOutRecurrence(list));
        expect(page).toHaveLength(1);
        expect(page[0].source_type).toBe("crm");
    });
});
