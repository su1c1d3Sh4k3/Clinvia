import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, ChevronLeft, ChevronRight, X, CheckCircle2, AlertCircle, Clock, ArrowRightLeft, DollarSign, TrendingUp, TrendingDown, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type NotificationType = 'task_created' | 'task_open' | 'task_finished' | 'deal_stagnated' | 'deal_created' | 'deal_stage_changed' | 'queue_changed' | 'appointment_created' | 'appointments_today' | 'appointment_reminder' | 'appointment_updated' | 'revenue_due' | 'expense_due' | 'revenue_overdue' | 'expense_overdue' | 'revenue_created' | 'expense_created' | 'team_cost_created' | 'marketing_campaign_created';

interface Notification {
    id: string;
    type: NotificationType;
    title: string;
    description: string;
    created_at: string;
    metadata: any;
}

const getNotificationStyle = (type: NotificationType) => {
    switch (type) {
        case 'task_created':
            return { color: 'bg-indigo-100 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800', icon: CheckCircle2, iconColor: 'text-indigo-600 dark:text-indigo-400' };
        case 'task_open':
        case 'deal_created':
        case 'appointment_created':
            return { color: 'bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800', icon: CheckCircle2, iconColor: 'text-green-600 dark:text-green-400' };
        case 'task_finished':
            return { color: 'bg-orange-100 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800', icon: CheckCircle2, iconColor: 'text-orange-600 dark:text-orange-400' };
        case 'deal_stagnated':
        case 'appointment_reminder':
            return { color: 'bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800', icon: AlertCircle, iconColor: 'text-red-600 dark:text-red-400' };
        case 'deal_stage_changed':
        case 'appointment_updated':
            return { color: 'bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800', icon: ArrowRightLeft, iconColor: 'text-blue-600 dark:text-blue-400' };
        case 'queue_changed':
            return { color: 'bg-purple-100 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800', icon: ArrowRightLeft, iconColor: 'text-purple-600 dark:text-purple-400' };
        case 'appointments_today':
            return { color: 'bg-teal-100 dark:bg-teal-900/30 border-teal-200 dark:border-teal-800', icon: Clock, iconColor: 'text-teal-600 dark:text-teal-400' };
        // Financial notification types
        case 'revenue_created':
        case 'revenue_due':
            return { color: 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800', icon: TrendingUp, iconColor: 'text-emerald-600 dark:text-emerald-400' };
        case 'expense_created':
        case 'expense_due':
            return { color: 'bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800', icon: TrendingDown, iconColor: 'text-amber-600 dark:text-amber-400' };
        case 'revenue_overdue':
        case 'expense_overdue':
            return { color: 'bg-rose-100 dark:bg-rose-900/30 border-rose-200 dark:border-rose-800', icon: AlertCircle, iconColor: 'text-rose-600 dark:text-rose-400' };
        case 'team_cost_created':
            return { color: 'bg-cyan-100 dark:bg-cyan-900/30 border-cyan-200 dark:border-cyan-800', icon: DollarSign, iconColor: 'text-cyan-600 dark:text-cyan-400' };
        case 'marketing_campaign_created':
            return { color: 'bg-fuchsia-100 dark:bg-fuchsia-900/30 border-fuchsia-200 dark:border-fuchsia-800', icon: TrendingUp, iconColor: 'text-fuchsia-600 dark:text-fuchsia-400' };
        default:
            return { color: 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700', icon: Bell, iconColor: 'text-gray-600 dark:text-gray-400' };
    }
};

export const NotificationsBoard = () => {
    const [isExpanded, setIsExpanded] = useState(false);
    const queryClient = useQueryClient();
    const [userId, setUserId] = useState<string | null>(null);

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            setUserId(data.user?.id || null);
        });
    }, []);

    // Check stagnation on mount
    useEffect(() => {
        const checkStagnation = async () => {
            await supabase.rpc('check_crm_stagnation');
        };
        checkStagnation();
    }, []);

    const { data: notifications, isLoading } = useQuery({
        queryKey: ['dashboard-notifications'],
        queryFn: async () => {
            // Fetch notifications
            const { data: notifs, error: notifError } = await supabase
                .from('notifications' as any)
                .select('*')
                .order('created_at', { ascending: false });

            if (notifError) throw notifError;

            // Fetch dismissals
            const { data: dismissals, error: dismissError } = await supabase
                .from('notification_dismissals' as any)
                .select('notification_id');

            if (dismissError) throw dismissError;

            const dismissedIds = new Set(dismissals?.map((d: any) => d.notification_id));

            return (notifs as Notification[]).filter(n => !dismissedIds.has(n.id));
        }
    });

    // Realtime subscription
    useEffect(() => {
        const channel = supabase
            .channel('public:notifications')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications' },
                (payload) => {
                    // Invalidate query to refresh list
                    queryClient.invalidateQueries({ queryKey: ['dashboard-notifications'] });
                    toast("Nova notificação recebida");
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [queryClient]);

    const handleDismiss = async (id: string) => {
        if (!userId) return;

        try {
            const { error } = await supabase
                .from('notification_dismissals' as any)
                .insert({ notification_id: id, user_id: userId });

            if (error) throw error;

            queryClient.setQueryData(['dashboard-notifications'], (old: Notification[] | undefined) =>
                old ? old.filter(n => n.id !== id) : []
            );
        } catch (error) {
            console.error("Error dismissing notification:", error);
            toast.error("Erro ao excluir notificação");
        }
    };

    const handleClearAll = async () => {
        if (!userId || !notifications || notifications.length === 0) return;

        try {
            // Create dismissal records for all notifications
            const dismissals = notifications.map(n => ({
                notification_id: n.id,
                user_id: userId
            }));

            const { error } = await supabase
                .from('notification_dismissals' as any)
                .upsert(dismissals, { onConflict: 'notification_id,user_id' });

            if (error) throw error;

            // Clear local cache
            queryClient.setQueryData(['dashboard-notifications'], []);
            toast.success("Todas as notificações foram limpas");
            setIsExpanded(false);
        } catch (error) {
            console.error("Error clearing notifications:", error);
            toast.error("Erro ao limpar notificações");
        }
    };

    if (isLoading) return null;

    if (!notifications || notifications.length === 0) return null;

    return (
        <Card className="w-full transition-all duration-300 ease-in-out border-l-4 border-l-primary mb-4 md:mb-6 bg-white dark:bg-card">
            <div className="flex items-center justify-between p-3 md:p-4 border-b gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Bell className="h-4 w-4 md:h-5 md:w-5 text-primary flex-shrink-0" />
                    <h3 className="font-semibold text-base md:text-lg truncate">Notificações</h3>
                    <span className="bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                        {notifications.length}
                    </span>
                </div>
                <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
                    {isExpanded && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleClearAll}
                            className="text-destructive dark:text-white hover:text-destructive dark:hover:text-white/80 px-2 md:px-3"
                        >
                            <Trash2 className="h-4 w-4 md:mr-1" />
                            <span className="hidden md:inline">Limpar tudo</span>
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="px-2 md:px-3"
                    >
                        <span className="hidden md:inline">{isExpanded ? "Contrair" : "Expandir"}</span>
                        {isExpanded ? <ChevronLeft className="h-4 w-4 md:ml-1 rotate-90" /> : <ChevronRight className="h-4 w-4 md:ml-1 rotate-90" />}
                    </Button>
                </div>
            </div>

            {isExpanded && (
                <CardContent className="p-3 md:p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                        {notifications.map((notification) => {
                            const style = getNotificationStyle(notification.type);
                            const Icon = style.icon;

                            return (
                                <Card key={notification.id} className={cn("relative border-l-4 shadow-sm hover:shadow-md transition-shadow bg-white dark:bg-card", style.color)}>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-2 top-2 h-6 w-6 hover:bg-black/10"
                                        onClick={() => handleDismiss(notification.id)}
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                    <CardHeader className="pb-2 pt-4 pl-4 pr-10">
                                        <div className="flex items-center gap-2">
                                            <Icon className={cn("h-4 w-4", style.iconColor)} />
                                            <CardTitle className="text-sm font-bold line-clamp-1">
                                                {notification.title}
                                            </CardTitle>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pb-4 pl-4 text-xs text-muted-foreground">
                                        <p className="line-clamp-2">{notification.description}</p>
                                        <div className="flex items-center gap-1 mt-2 opacity-70">
                                            <Clock className="h-3 w-3" />
                                            <span>{new Date(notification.created_at).toLocaleString()}</span>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </CardContent>
            )}
        </Card>
    );
};
