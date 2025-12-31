import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Lightbulb, ChevronUp, ChevronDown, Calendar, Package, Scissors, X, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    useOpportunities,
    useClaimOpportunity,
    useDismissOpportunity,
    generateServiceOpportunityMessage,
    generateProductOpportunityMessage,
    Opportunity
} from "@/hooks/useOpportunities";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { checkActiveConversation } from "@/hooks/useActiveConversation";
import { toast } from "sonner";

interface OpportunitiesSectionProps {
    onOpportunityClick?: (contactId: string, message: string) => void;
    onOpportunitySelect?: (conversationId: string, message: string) => void;
    compact?: boolean; // For dashboard view
}

export function OpportunitiesSection({ onOpportunityClick, onOpportunitySelect, compact = false }: OpportunitiesSectionProps) {
    const [isOpen, setIsOpen] = useState(!compact);
    const [isProcessing, setIsProcessing] = useState<string | null>(null); // Track which opportunity is being processed
    const navigate = useNavigate();

    const { data: opportunities, isLoading } = useOpportunities();
    const claimMutation = useClaimOpportunity();
    const dismissMutation = useDismissOpportunity();

    const handleClaimOpportunity = async (opportunity: Opportunity) => {
        // DEBUG: Log immediately when clicked
        console.log('=== HANDLECLAIMOPPORTUNITY CALLED ===');
        console.log('Opportunity:', opportunity);
        console.log('isProcessing:', isProcessing);
        console.log('onOpportunitySelect available:', !!onOpportunitySelect);

        // Prevent double-clicks
        if (isProcessing) {
            console.log('Already processing, returning...');
            return;
        }

        setIsProcessing(opportunity.id);
        console.log('Set isProcessing to:', opportunity.id);

        try {
            // Get current user
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                console.error('User not authenticated');
                setIsProcessing(null);
                return;
            }

            // Get team_member.id for the current user (assigned_agent_id uses team_members FK)
            const { data: teamMember } = await supabase
                .from('team_members')
                .select('id')
                .eq('user_id', user.id)
                .single();

            const agentId = teamMember?.id || null;
            console.log('Team member ID for assignment:', agentId);

            // Generate the message first (before any database operations)
            let message = '';
            if (opportunity.type === 'service') {
                message = generateServiceOpportunityMessage(
                    opportunity.contact?.push_name || null,
                    opportunity.product_service?.name || 'serviço',
                    opportunity.reference_date,
                    opportunity.professional?.name || null
                );
            } else {
                message = generateProductOpportunityMessage(
                    opportunity.contact?.push_name || null,
                    opportunity.product_service?.name || 'produto',
                    opportunity.reference_date
                );
            }

            console.log('Processing opportunity for contact:', opportunity.contact_id);

            // Try to claim the opportunity (non-blocking)
            try {
                await claimMutation.mutateAsync({ opportunityId: opportunity.id });
            } catch (claimError) {
                console.warn('Could not claim opportunity (may be RLS issue), continuing...', claimError);
            }

            console.log('Querying conversations for contact:', opportunity.contact_id);

            // Check if contact has an open/pending conversation
            const { data: conversations, error: queryError } = await supabase
                .from('conversations')
                .select('id, status, assigned_agent_id')
                .eq('contact_id', opportunity.contact_id)
                .in('status', ['open', 'pending'])
                .order('created_at', { ascending: false })
                .limit(1);

            console.log('Query result:', { conversations, queryError });

            if (queryError) {
                console.error('Error querying conversations:', queryError);
            }

            let conversationId: string | null = null;

            if (conversations && conversations.length > 0) {
                const conv = conversations[0];
                conversationId = conv.id;
                console.log('Found existing conversation:', conv.id);

                // Check if assigned to another agent - show info toast
                if (conv.assigned_agent_id && conv.assigned_agent_id !== agentId) {
                    // Get the agent's name
                    const activeConv = await checkActiveConversation(opportunity.contact_id);
                    if (activeConv?.agent_name) {
                        toast.info(`Cliente já em atendimento por ${activeConv.agent_name}`);
                    }
                } else if (!conv.assigned_agent_id) {
                    // If no agent assigned, assign current user
                    console.log('Assigning agent to conversation:', agentId);
                    await supabase
                        .from('conversations')
                        .update({ assigned_agent_id: agentId })
                        .eq('id', conv.id);
                }
            } else {
                // No active conversation - create a new one
                console.log('No active conversation found, creating new one for contact:', opportunity.contact_id);

                const { data: newConversation, error: createError } = await supabase
                    .from('conversations')
                    .insert({
                        contact_id: opportunity.contact_id,
                        status: 'open',
                        assigned_agent_id: agentId,
                        unread_count: 0,
                        last_message_at: new Date().toISOString()
                    })
                    .select('id')
                    .single();

                console.log('Create result:', { newConversation, createError });

                if (createError) {
                    console.error('Error creating conversation:', createError);
                } else if (newConversation) {
                    conversationId = newConversation.id;
                    console.log('Created new conversation:', newConversation.id);
                }
            }

            console.log('Final conversationId:', conversationId);
            console.log('Message to send:', message);

            // Now navigate or call callback
            if (conversationId) {
                // If we have onOpportunitySelect callback (from sidebar), use it directly
                if (onOpportunitySelect) {
                    console.log('=== CALLING onOpportunitySelect ===');
                    console.log('Args:', { conversationId, message });
                    onOpportunitySelect(conversationId, message);
                    console.log('=== onOpportunitySelect CALLED SUCCESSFULLY ===');
                } else if (onOpportunityClick) {
                    // Legacy callback
                    console.log('Using onOpportunityClick');
                    onOpportunityClick(opportunity.contact_id, message);
                } else {
                    // Dashboard or standalone - use navigate
                    console.log('Using navigate');
                    navigate(`/?conversationId=${conversationId}&message=${encodeURIComponent(message)}`);
                }
            } else {
                // Fallback: navigate with contact id (will trigger conversation creation in Index.tsx)
                console.log('No conversation ID, falling back to contact navigation');
                navigate(`/?contact=${opportunity.contact_id}&message=${encodeURIComponent(message)}`);
            }
        } catch (error) {
            console.error('Error in handleClaimOpportunity:', error);

            // Fallback: still try to navigate
            const message = opportunity.type === 'service'
                ? generateServiceOpportunityMessage(
                    opportunity.contact?.push_name || null,
                    opportunity.product_service?.name || 'serviço',
                    opportunity.reference_date,
                    opportunity.professional?.name || null
                )
                : generateProductOpportunityMessage(
                    opportunity.contact?.push_name || null,
                    opportunity.product_service?.name || 'produto',
                    opportunity.reference_date
                );

            navigate(`/?contact=${opportunity.contact_id}&message=${encodeURIComponent(message)}`);
        } finally {
            setIsProcessing(null);
        }
    };

    if (isLoading) return null;
    if (!opportunities || opportunities.length === 0) return null;

    const opportunityCards = opportunities.map((opp) => (
        <Card
            key={opp.id}
            className={cn(
                "relative border-l-4 shadow-sm hover:shadow-md transition-shadow",
                opp.type === 'service'
                    ? "bg-purple-50 dark:bg-purple-900/20 border-purple-400 dark:border-purple-600"
                    : "bg-amber-50 dark:bg-amber-900/20 border-amber-400 dark:border-amber-600"
            )}
        >
            {/* Dismiss button */}
            <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2 h-6 w-6 hover:bg-black/10"
                onClick={() => dismissMutation.mutate({ opportunityId: opp.id })}
                disabled={isProcessing === opp.id}
            >
                <X className="h-3 w-3" />
            </Button>

            <CardHeader className="pb-2 pt-4 pl-4 pr-10">
                <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                        <AvatarImage src={opp.contact?.profile_pic_url || undefined} />
                        <AvatarFallback>
                            {opp.contact?.push_name?.charAt(0).toUpperCase() || '?'}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm font-bold truncate">
                            {opp.contact?.push_name || 'Cliente'}
                        </CardTitle>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            {opp.type === 'service' ? (
                                <Scissors className="h-3 w-3" />
                            ) : (
                                <Package className="h-3 w-3" />
                            )}
                            <span className="truncate">{opp.product_service?.name}</span>
                        </div>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pb-4 pl-4">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                    <Calendar className="h-3 w-3" />
                    <span>
                        {opp.type === 'service' ? 'Realizado em ' : 'Comprado em '}
                        {new Date(opp.reference_date).toLocaleDateString('pt-BR')}
                    </span>
                </div>

                {opp.type === 'service' && opp.professional && (
                    <div className="text-xs text-muted-foreground mb-2">
                        Profissional: {opp.professional.name}
                    </div>
                )}

                <Button
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => handleClaimOpportunity(opp)}
                    disabled={isProcessing === opp.id || claimMutation.isPending}
                >
                    {isProcessing === opp.id ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            Processando...
                        </>
                    ) : (
                        <>
                            <Sparkles className="h-4 w-4 mr-1" />
                            Aproveitar Oportunidade
                        </>
                    )}
                </Button>
            </CardContent>
        </Card>
    ));

    if (compact) {
        // Dashboard view - similar to notifications board
        return (
            <Card className="w-full transition-all duration-300 ease-in-out border-l-4 border-l-purple-500 mb-4 md:mb-6 bg-white dark:bg-card">
                <div className="flex items-center justify-between p-3 md:p-4 border-b gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <Lightbulb className="h-4 w-4 md:h-5 md:w-5 text-purple-500 flex-shrink-0" />
                        <h3 className="font-semibold text-base md:text-lg truncate">Oportunidades</h3>
                        <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 flex-shrink-0">
                            {opportunities.length}
                        </Badge>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsOpen(!isOpen)}
                        className="px-2 md:px-3 flex-shrink-0"
                    >
                        <span className="hidden md:inline">{isOpen ? "Contrair" : "Expandir"}</span>
                        {isOpen ? <ChevronUp className="h-4 w-4 md:ml-1" /> : <ChevronDown className="h-4 w-4 md:ml-1" />}
                    </Button>
                </div>

                {isOpen && (
                    <CardContent className="p-3 md:p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                            {opportunityCards}
                        </div>
                    </CardContent>
                )}
            </Card>
        );
    }

    // Sidebar view - collapsible accordion
    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <Card className="border-none shadow-none bg-transparent">
                <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 rounded-lg transition-colors py-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Lightbulb className="h-4 w-4 text-purple-500" />
                                <CardTitle className="text-sm">Oportunidades</CardTitle>
                                <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 text-xs">
                                    {opportunities.length}
                                </Badge>
                            </div>
                            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                    </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <CardContent className="pt-0 space-y-3">
                        {opportunityCards}
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}
