import { describe, it, expect } from "vitest";
import { CHANNEL_SENTINEL, channelKeyOf } from "@/types/crm-client";
import { filterChannelsByScope, type CrmChannel } from "@/hooks/useCrmChannels";

const WPP_A = "11111111-1111-1111-1111-111111111111";
const WPP_B = "22222222-2222-2222-2222-222222222222";
const IG = "33333333-3333-3333-3333-333333333333";

describe("channelKeyOf", () => {
    it("usa a instância WhatsApp quando existe", () => {
        expect(channelKeyOf({ instance_id: WPP_A, instagram_instance_id: null })).toBe(WPP_A);
    });

    it("usa a conta Instagram quando não há instância (convenção de conversations)", () => {
        expect(channelKeyOf({ instance_id: null, instagram_instance_id: IG })).toBe(IG);
    });

    it("cai na sentinela quando o card não tem conexão (legado/manual)", () => {
        expect(channelKeyOf({ instance_id: null, instagram_instance_id: null })).toBe(CHANNEL_SENTINEL);
        expect(channelKeyOf({})).toBe(CHANNEL_SENTINEL);
    });

    it("separa cards do mesmo contato em conexões diferentes", () => {
        expect(channelKeyOf({ instance_id: WPP_A })).not.toBe(channelKeyOf({ instance_id: WPP_B }));
    });
});

describe("filterChannelsByScope", () => {
    const all: CrmChannel[] = [
        { id: WPP_A, label: "Recepção", kind: "wpp" },
        { id: WPP_B, label: "Comercial", kind: "wpp" },
        { id: IG, label: "clinica (Instagram)", kind: "ig" },
    ];

    it("admin e supervisor veem todas as conexões", () => {
        expect(filterChannelsByScope(all, "admin", [WPP_A])).toEqual(all);
        expect(filterChannelsByScope(all, "supervisor", [WPP_A])).toEqual(all);
    });

    it("atendente sem escopo definido vê todas", () => {
        expect(filterChannelsByScope(all, "agent", null)).toEqual(all);
        expect(filterChannelsByScope(all, "agent", [])).toEqual(all);
    });

    it("atendente com escopo vê só as conexões liberadas", () => {
        expect(filterChannelsByScope(all, "agent", [WPP_B, IG]).map((c) => c.id)).toEqual([WPP_B, IG]);
    });
});
