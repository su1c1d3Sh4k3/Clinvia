import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLocation, useNavigate } from "react-router-dom";
import { differenceInMinutes } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

export function NotificationManager() {
    const { user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const audioContextRef = useRef<AudioContext | null>(null);

    // Fetch user preferences
    const { data: preferences } = useQuery({
        queryKey: ["notification-preferences", user?.id],
        queryFn: async () => {
            if (!user) return null;
            const { data } = await supabase
                .from("profiles")
                .select("notifications_enabled, group_notifications_enabled")
                .eq("id", user.id)
                .single();
            return data;
        },
        enabled: !!user,
    });

    // Fetch active tasks for monitoring
    const { data: tasks } = useQuery({
        queryKey: ["active-tasks-notifications"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tasks" as any)
                .select("*")
                .neq("status", "finished");
            if (error) throw error;
            return data;
        },
        refetchInterval: 120000, // Check every 2 minutes (optimized from 1 min)
        enabled: !!user && preferences?.notifications_enabled !== false,
    });

    const playNotificationSound = async () => {
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }
            const ctx = audioContextRef.current;

            if (ctx.state === 'suspended') {
                await ctx.resume();
            }

            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            oscillator.type = "sine";
            oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5
            gainNode.gain.setValueAtTime(0.1, ctx.currentTime);

            oscillator.start();
            gainNode.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.5);
            oscillator.stop(ctx.currentTime + 0.5);
        } catch (e) {
            console.error("Audio play failed", e);
        }
    };

    const showNotification = (title: string, options?: NotificationOptions, url?: string) => {
        if (Notification.permission === "granted") {
            const n = new Notification(title, options);
            n.onclick = () => {
                window.focus();
                if (url) navigate(url);
                n.close();
            };
            playNotificationSound();
        }
    };

    // Message Listener
    useEffect(() => {
        if (!user || preferences?.notifications_enabled === false) return;

        const channel = supabase
            .channel("global-messages-notification")
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "messages", filter: "direction=eq.inbound" },
                async (payload) => {
                    const msg = payload.new as any;

                    // Fetch conversation to get contact info and group status
                    const { data: conversation } = await supabase
                        .from("conversations")
                        .select(`
                            contact_id,
                            group_id,
                            contacts (
                                push_name,
                                profile_pic_url
                            ),
                            groups (
                                group_name,
                                group_pic_url
                            )
                        `)
                        .eq("id", msg.conversation_id)
                        .single();

                    const isGroup = !!conversation?.group_id;

                    // Check if group notifications are disabled
                    if (isGroup && preferences?.group_notifications_enabled === false) return;

                    // Check if currently viewing this chat
                    const isOnChat = location.pathname === "/" && location.search.includes(msg.conversation_id);
                    const isVisible = document.visibilityState === "visible";

                    if (isOnChat && isVisible) return;

                    const contact = (conversation?.contacts as any);
                    const group = (conversation?.groups as any);

                    // Determine Title (Name)
                    const title = isGroup
                        ? (group?.group_name || "Grupo")
                        : (contact?.push_name || msg.sender_name || "Nova Mensagem");

                    // Determine Icon (Photo)
                    const profilePic = isGroup
                        ? (group?.group_pic_url || "/placeholder.png")
                        : (contact?.profile_pic_url || msg.sender_profile_pic_url || "/placeholder.png");

                    // Determine Body (Content)
                    let body = msg.message_type === 'text' ? msg.body : `📷 ${msg.message_type || 'Mídia'} recebida`;

                    if (isGroup && msg.sender_name) {
                        body = `${msg.sender_name}: ${body}`;
                    }

                    // Native Notification
                    showNotification(title, {
                        body: body,
                        tag: msg.conversation_id,
                        icon: profilePic
                    }, `/?conversationId=${msg.conversation_id}`);

                    // Custom Styled Toast (In-App)
                    toast.custom((t) => (
                        <div
                            className="flex items-center gap-4 p-4 rounded-lg shadow-lg cursor-pointer transition-all hover:scale-105"
                            style={{
                                backgroundColor: "#272C35",
                                border: "1px solid rgba(4, 162, 221, 0.3)",
                                boxShadow: "0 0 15px rgba(4, 162, 221, 0.5)",
                                minWidth: "300px"
                            }}
                            onClick={() => {
                                navigate(`/?conversationId=${msg.conversation_id}`);
                                toast.dismiss(t);
                            }}
                        >
                            {/* Avatar */}
                            <div className="relative">
                                <img
                                    src={profilePic}
                                    alt="Contact"
                                    className="w-12 h-12 rounded-full object-cover border-2 border-[#04A2DD]"
                                    onError={(e) => (e.currentTarget.src = "https://github.com/shadcn.png")}
                                />
                                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-[#272C35]"></div>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-hidden">
                                <h4 className="text-[#04A2DD] font-bold text-sm truncate">
                                    {title}
                                </h4>
                                <p className="text-gray-300 text-sm truncate mt-1">
                                    {body}
                                </p>
                            </div>
                        </div>
                    ), {
                        duration: 5000,
                        position: "top-right"
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, preferences, location.pathname, location.search]);

    // Task Monitor (Effect)
    useEffect(() => {
        if (!tasks || preferences?.notifications_enabled === false) return;

        const now = new Date();

        tasks.forEach(async (task: any) => {
            const start = new Date(task.start_time);
            const end = new Date(task.end_time);
            let newStatus = null;

            // Status updates logic
            if (task.status === 'pending' && now >= start && now < end) {
                newStatus = 'open';
            } else if (task.status === 'open' && now >= end) {
                newStatus = 'finished';
            } else if (task.status === 'pending' && now >= end) {
                newStatus = 'finished';
            }

            if (newStatus) {
                const { error } = await supabase.from("tasks").update({ status: newStatus }).eq("id", task.id);
                if (!error) {
                    const labels: any = { open: "Iniciada", finished: "Finalizada" };
                    showNotification(`Tarefa ${labels[newStatus]}`, {
                        body: task.title,
                        tag: `task-status-${task.id}`
                    }, `/tasks?open=${task.id}`);
                }
            }

            // Start Time Warning
            if (task.status === 'pending' && Math.abs(differenceInMinutes(now, start)) < 1 && now < start) {
                showNotification("Tarefa Iniciando", {
                    body: `${task.title} às ${start.toLocaleTimeString()}`,
                    tag: `task-start-${task.id}`
                }, `/tasks?open=${task.id}`);
            }

            // Due Date Warning
            if (task.due_date) {
                const due = new Date(task.due_date);
                if (Math.abs(differenceInMinutes(now, due)) < 1) {
                    showNotification("Tarefa Vencendo", {
                        body: task.title,
                        tag: `task-due-${task.id}`
                    }, `/tasks?open=${task.id}`);
                }
            }
        });

    }, [tasks]);

    return null;
}
