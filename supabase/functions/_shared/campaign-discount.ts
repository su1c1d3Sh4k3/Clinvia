// Desconto de campanha em agendamentos (fonte única — usado por api-scheduling e
// api-public-booking): quando o contato tem campanha ativa (entry 'sent' +
// valid_until > now) e o serviço agendado está no snapshot campaigns.services,
// o preço do appointment nasce com discount_pct aplicado. A venda criada pelo
// trigger link_or_create_sale_on_appointment herda appointments.price, então o
// desconto propaga automaticamente para sale/parcelas.
export interface CampaignDiscountInfo {
    id: string;
    discount_pct?: number | null;
    services?: Array<{ id?: string } | null> | null;
}

export function applyCampaignDiscount(
    basePrice: number,
    campaign: CampaignDiscountInfo | null | undefined,
    serviceClientId: string,
): number {
    const pct = Number(campaign?.discount_pct);
    if (!campaign || !isFinite(pct) || pct <= 0 || pct > 100) return basePrice;
    const inCampaign = (campaign.services || []).some((s) => s?.id === serviceClientId);
    if (!inCampaign) return basePrice;
    return Math.round(basePrice * (1 - pct / 100) * 100) / 100;
}
