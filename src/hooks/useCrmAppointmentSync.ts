import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { TERMINAL_STAGES } from "@/types/crm-client";

/**
 * Hook for syncing appointment lifecycle events with the CRM system.
 *
 * Flows:
 *  - onAppointmentCreated: create/move CRM card to "Agendado" + add service
 *  - onAppointmentCompleted: create sale, remove service, create Ganho card
 *  - onAppointmentCanceled: create "Perdido" card, remove service from active deal
 *  - onAppointmentNoShow: same as canceled with different loss_reason
 */
export function useCrmAppointmentSync() {
  const queryClient = useQueryClient();

  const invalidateCrm = () => {
    queryClient.invalidateQueries({ queryKey: ["crm-clients"] });
    queryClient.invalidateQueries({ queryKey: ["crm-client-services"] });
    queryClient.invalidateQueries({ queryKey: ["contact-crm-client"] });
  };

  /** Find the active CRM card for a contact */
  async function findActiveCard(contactId: string) {
    const { data } = await supabase
      .from("crm_client" as any)
      .select("*")
      .eq("contact_id", contactId)
      .eq("is_active", true)
      .maybeSingle();
    return data as any;
  }

  /** Find services in a CRM card */
  async function findCardServices(crmClientId: string) {
    const { data } = await supabase
      .from("crm_client_services" as any)
      .select("*")
      .eq("crm_client_id", crmClientId);
    return (data || []) as any[];
  }

  /** Recalculate and update deal value */
  async function recalcValue(crmClientId: string) {
    const services = await findCardServices(crmClientId);
    const total = services.reduce((s: number, r: any) => s + (r.unit_price * r.quantity), 0);
    await supabase
      .from("crm_client" as any)
      .update({ value: total, updated_at: new Date().toISOString() })
      .eq("id", crmClientId);
    return total;
  }

  // ─── FLOW A: Appointment Created ───────────────────────────────────────────

  async function onAppointmentCreated(params: {
    contactId: string;
    ownerId: string;
    serviceClientId?: string | null;
    serviceName?: string;
    servicePrice?: number;
    serviceMinPrice?: number;
    professionalId?: string;
  }) {
    const { contactId, ownerId, serviceClientId, serviceName, servicePrice = 0, serviceMinPrice = 0, professionalId } = params;

    let card = await findActiveCard(contactId);

    if (card) {
      // Card exists — if in terminal stage, create a new one
      if (TERMINAL_STAGES.includes(card.stage)) {
        card = null; // will create below
      } else if (card.stage !== "Agendado") {
        // Move to "Agendado"
        await supabase
          .from("crm_client" as any)
          .update({ stage: "Agendado", stage_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", card.id);
      }
    }

    // Create new card if needed
    if (!card) {
      const { data: newCard } = await supabase
        .from("crm_client" as any)
        .insert({
          user_id: ownerId,
          contact_id: contactId,
          stage: "Agendado",
          stage_changed_at: new Date().toISOString(),
          value: 0,
          professional_id: professionalId || null,
          priority: "medium",
          is_active: true,
        })
        .select()
        .single();
      card = newCard;
    }

    if (!card) return;

    // Add service to deal if not already present
    if (serviceClientId) {
      const existingServices = await findCardServices(card.id);
      const alreadyExists = existingServices.some(
        (s: any) => s.service_client_id === serviceClientId
      );

      if (!alreadyExists) {
        await supabase
          .from("crm_client_services" as any)
          .insert({
            crm_client_id: card.id,
            service_client_id: serviceClientId,
            service_name: serviceName || "Serviço",
            quantity: 1,
            unit_price: servicePrice,
            min_price: serviceMinPrice,
          });

        await recalcValue(card.id);
      }
    }

    invalidateCrm();
  }

  // ─── FLOW B: Appointment Completed ─────────────────────────────────────────

  async function onAppointmentCompleted(params: {
    contactId: string;
    ownerId: string;
    serviceClientId?: string | null;
    serviceName?: string;
    servicePrice?: number;
    professionalId?: string;
  }) {
    const { contactId, ownerId, serviceClientId, serviceName, servicePrice = 0, professionalId } = params;

    // 1. Create sale with payment_type='pending'
    if (serviceClientId && servicePrice > 0) {
      await supabase.from("sales").insert({
        user_id: ownerId,
        category: "service",
        product_service_id: null,
        product_name: serviceName || "Serviço",
        quantity: 1,
        unit_price: servicePrice,
        total_amount: servicePrice,
        payment_type: "pending",
        installments: 1,
        interest_rate: 0,
        cash_amount: 0,
        sale_date: new Date().toISOString().split("T")[0],
        professional_id: professionalId || null,
        contact_id: contactId,
        notes: `Venda automática - agendamento concluído: ${serviceName}`,
      });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    }

    // 2. Create a Ganho card (is_active=false) for the completed service
    if (serviceClientId) {
      const { data: ganhoCard } = await supabase
        .from("crm_client" as any)
        .insert({
          user_id: ownerId,
          contact_id: contactId,
          stage: "Ganho",
          stage_changed_at: new Date().toISOString(),
          value: servicePrice,
          professional_id: professionalId || null,
          is_active: false,
        })
        .select()
        .single();

      if (ganhoCard) {
        await supabase
          .from("crm_client_services" as any)
          .insert({
            crm_client_id: ganhoCard.id,
            service_client_id: serviceClientId,
            service_name: serviceName || "Serviço",
            quantity: 1,
            unit_price: servicePrice,
            min_price: 0,
          });
      }
    }

    // 3. Remove the completed service from the active deal
    const card = await findActiveCard(contactId);
    if (!card) {
      invalidateCrm();
      return;
    }

    if (serviceClientId) {
      await supabase
        .from("crm_client_services" as any)
        .delete()
        .eq("crm_client_id", card.id)
        .eq("service_client_id", serviceClientId);
    }

    // 4. Check remaining services in active deal
    const remaining = await findCardServices(card.id);

    if (remaining.length > 0) {
      // Still has pending services — recalculate and keep in Agendado
      await recalcValue(card.id);
    } else {
      // No more services → deactivate (the Ganho card already represents the outcome)
      await supabase
        .from("crm_client" as any)
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", card.id);
    }

    invalidateCrm();
  }

  // ─── FLOW C: Appointment Canceled / No-Show ────────────────────────────────

  async function onAppointmentLost(params: {
    contactId: string;
    ownerId: string;
    serviceClientId?: string | null;
    serviceName?: string;
    servicePrice?: number;
    lossType: "canceled" | "no_show";
  }) {
    const { contactId, ownerId, serviceClientId, serviceName, servicePrice = 0, lossType } = params;

    const lossReasonOther = lossType === "no_show"
      ? "Cliente não compareceu"
      : "Cliente cancelou o agendamento";

    // 1. Create a Perdido card (is_active=false) with the lost service
    const { data: perdidoCard } = await supabase
      .from("crm_client" as any)
      .insert({
        user_id: ownerId,
        contact_id: contactId,
        stage: "Perdido",
        stage_changed_at: new Date().toISOString(),
        value: servicePrice,
        loss_reason: lossType,
        loss_reason_other: lossReasonOther,
        is_active: false,
      })
      .select()
      .single();

    if (perdidoCard && serviceClientId) {
      await supabase
        .from("crm_client_services" as any)
        .insert({
          crm_client_id: perdidoCard.id,
          service_client_id: serviceClientId,
          service_name: serviceName || "Serviço",
          quantity: 1,
          unit_price: servicePrice,
          min_price: 0,
        });
    }

    // 2. Remove the service from the active deal
    const activeCard = await findActiveCard(contactId);
    if (activeCard && serviceClientId) {
      await supabase
        .from("crm_client_services" as any)
        .delete()
        .eq("crm_client_id", activeCard.id)
        .eq("service_client_id", serviceClientId);

      const remaining = await findCardServices(activeCard.id);
      if (remaining.length > 0) {
        await recalcValue(activeCard.id);
      } else {
        // No more services → deactivate
        await supabase
          .from("crm_client" as any)
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("id", activeCard.id);
      }
    }

    invalidateCrm();
  }

  return {
    onAppointmentCreated,
    onAppointmentCompleted,
    onAppointmentLost,
  };
}
