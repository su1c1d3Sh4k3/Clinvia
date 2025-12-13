import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const results = {
        serviceOpportunities: 0,
        productOpportunities: 0,
        errors: [] as string[],
    };

    try {
        console.log('=== [GENERATE OPPORTUNITIES] Starting ===');
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // =============================================
        // 1. SERVICE OPPORTUNITIES (from appointments)
        // =============================================
        console.log('[GENERATE OPPORTUNITIES] Processing service opportunities...');

        // Get completed appointments with services that have opportunity_alert_days > 0
        const { data: completedAppointments, error: appointmentError } = await supabase
            .from('appointments')
            .select(`
                id,
                user_id,
                contact_id,
                service_id,
                professional_id,
                end_time,
                products_services!service_id (
                    id,
                    name,
                    opportunity_alert_days
                )
            `)
            .eq('status', 'completed')
            .not('contact_id', 'is', null)
            .not('service_id', 'is', null);

        if (appointmentError) {
            console.error('[GENERATE OPPORTUNITIES] Error fetching appointments:', appointmentError);
            results.errors.push(`Appointments error: ${appointmentError.message}`);
        } else if (completedAppointments) {
            console.log(`[GENERATE OPPORTUNITIES] Found ${completedAppointments.length} completed appointments`);

            for (const appointment of completedAppointments) {
                try {
                    const service = appointment.products_services as any;
                    if (!service || !service.opportunity_alert_days || service.opportunity_alert_days <= 0) {
                        continue; // No alert configured for this service
                    }

                    const endDate = new Date(appointment.end_time);
                    const alertDate = new Date(endDate);
                    alertDate.setDate(alertDate.getDate() + service.opportunity_alert_days);
                    alertDate.setHours(0, 0, 0, 0);

                    // Only create opportunity if alert date has been reached
                    if (alertDate > today) {
                        continue; // Not yet time for this opportunity
                    }

                    // Check if opportunity already exists for this appointment
                    const { data: existing } = await supabase
                        .from('opportunities')
                        .select('id')
                        .eq('appointment_id', appointment.id)
                        .maybeSingle();

                    if (existing) {
                        continue; // Already created
                    }

                    // Get professional's team_member_id if exists (for assignment)
                    let assignedTo = null;
                    if (appointment.professional_id) {
                        const { data: professional } = await supabase
                            .from('professionals')
                            .select('user_id')
                            .eq('id', appointment.professional_id)
                            .maybeSingle();

                        // Note: professionals table doesn't have user_id typically,
                        // so we leave assigned_to as null (everyone can see)
                    }

                    // Create opportunity
                    const { error: insertError } = await supabase
                        .from('opportunities')
                        .insert({
                            user_id: appointment.user_id,
                            type: 'service',
                            contact_id: appointment.contact_id,
                            product_service_id: appointment.service_id,
                            professional_id: appointment.professional_id,
                            appointment_id: appointment.id,
                            reference_date: endDate.toISOString().split('T')[0],
                            alert_date: alertDate.toISOString().split('T')[0],
                            assigned_to: assignedTo,
                        });

                    if (insertError) {
                        if (insertError.code === '23505') {
                            // Duplicate, already exists
                            continue;
                        }
                        console.error('[GENERATE OPPORTUNITIES] Error creating service opportunity:', insertError);
                        results.errors.push(`Service opportunity ${appointment.id}: ${insertError.message}`);
                    } else {
                        results.serviceOpportunities++;
                        console.log(`[GENERATE OPPORTUNITIES] Created service opportunity for appointment ${appointment.id}`);
                    }
                } catch (err: any) {
                    console.error('[GENERATE OPPORTUNITIES] Error processing appointment:', err);
                    results.errors.push(`Appointment ${appointment.id}: ${err.message}`);
                }
            }
        }

        // =============================================
        // 2. PRODUCT OPPORTUNITIES (from revenues)
        // =============================================
        console.log('[GENERATE OPPORTUNITIES] Processing product opportunities...');

        // Get revenue categories that are for products
        const { data: productCategories } = await supabase
            .from('revenue_categories')
            .select('id, name')
            .ilike('name', '%produto%');

        const productCategoryIds = productCategories?.map(c => c.id) || [];

        // Get paid revenues with products that have opportunity_alert_days > 0
        const { data: paidRevenues, error: revenueError } = await supabase
            .from('revenues')
            .select(`
                id,
                user_id,
                contact_id,
                product_service_id,
                team_member_id,
                paid_date,
                products_services!product_service_id (
                    id,
                    name,
                    type,
                    opportunity_alert_days
                )
            `)
            .eq('status', 'paid')
            .not('paid_date', 'is', null)
            .not('product_service_id', 'is', null);

        if (revenueError) {
            console.error('[GENERATE OPPORTUNITIES] Error fetching revenues:', revenueError);
            results.errors.push(`Revenues error: ${revenueError.message}`);
        } else if (paidRevenues) {
            console.log(`[GENERATE OPPORTUNITIES] Found ${paidRevenues.length} paid revenues with products`);

            for (const revenue of paidRevenues) {
                try {
                    const product = revenue.products_services as any;
                    if (!product || product.type !== 'product') {
                        continue; // Not a product
                    }
                    if (!product.opportunity_alert_days || product.opportunity_alert_days <= 0) {
                        continue; // No alert configured
                    }
                    if (!revenue.contact_id) {
                        continue; // No contact linked
                    }

                    const paidDate = new Date(revenue.paid_date);
                    const alertDate = new Date(paidDate);
                    alertDate.setDate(alertDate.getDate() + product.opportunity_alert_days);
                    alertDate.setHours(0, 0, 0, 0);

                    // Only create opportunity if alert date has been reached
                    if (alertDate > today) {
                        continue; // Not yet time
                    }

                    // Check if opportunity already exists
                    const { data: existing } = await supabase
                        .from('opportunities')
                        .select('id')
                        .eq('revenue_id', revenue.id)
                        .maybeSingle();

                    if (existing) {
                        continue; // Already created
                    }

                    // Get assigned user from team_member
                    let assignedTo = null;
                    if (revenue.team_member_id) {
                        const { data: teamMember } = await supabase
                            .from('team_members')
                            .select('user_id')
                            .eq('id', revenue.team_member_id)
                            .maybeSingle();

                        if (teamMember) {
                            assignedTo = teamMember.user_id;
                        }
                    }

                    // Create opportunity
                    const { error: insertError } = await supabase
                        .from('opportunities')
                        .insert({
                            user_id: revenue.user_id,
                            type: 'product',
                            contact_id: revenue.contact_id,
                            product_service_id: revenue.product_service_id,
                            revenue_id: revenue.id,
                            reference_date: paidDate.toISOString().split('T')[0],
                            alert_date: alertDate.toISOString().split('T')[0],
                            assigned_to: assignedTo,
                        });

                    if (insertError) {
                        if (insertError.code === '23505') {
                            continue; // Duplicate
                        }
                        console.error('[GENERATE OPPORTUNITIES] Error creating product opportunity:', insertError);
                        results.errors.push(`Product opportunity ${revenue.id}: ${insertError.message}`);
                    } else {
                        results.productOpportunities++;
                        console.log(`[GENERATE OPPORTUNITIES] Created product opportunity for revenue ${revenue.id}`);
                    }
                } catch (err: any) {
                    console.error('[GENERATE OPPORTUNITIES] Error processing revenue:', err);
                    results.errors.push(`Revenue ${revenue.id}: ${err.message}`);
                }
            }
        }

        console.log('=== [GENERATE OPPORTUNITIES] Complete ===');
        console.log('Results:', results);

        return new Response(
            JSON.stringify({ success: true, ...results }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('=== [GENERATE OPPORTUNITIES] ERROR ===', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message, ...results }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
