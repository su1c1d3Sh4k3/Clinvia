import { Clock, Eye, Wrench, CheckCircle2, type LucideIcon } from "lucide-react";

export type SupportPriority = "low" | "medium" | "high" | "urgent";
export type SupportStatus = "open" | "viewed" | "in_progress" | "resolved";

export interface SupportTicket {
    id: string;
    user_id: string;
    title: string;
    description: string | null;
    client_summary: string | null;
    priority: SupportPriority;
    status: SupportStatus;
    creator_name: string | null;
    support_response: string | null;
    assigned_admin_id: string | null;
    last_message_at: string | null;
    last_sender_type: "client" | "support" | null;
    created_at: string;
    updated_at: string;
}

export interface SupportMessage {
    id: string;
    ticket_id: string;
    sender_type: "client" | "support";
    sender_auth_user_id: string | null;
    sender_name: string;
    body: string;
    media_url: string | null;
    media_type: string | null;
    file_name: string | null;
    read_at: string | null;
    created_at: string;
}

export const SUPPORT_STATUS_CONFIG: Record<
    SupportStatus,
    { label: string; icon: LucideIcon; color: string; bg: string; dot: string }
> = {
    open: {
        label: "Aberto",
        icon: Clock,
        color: "text-blue-600 dark:text-blue-400",
        bg: "bg-blue-50 dark:bg-blue-950/40",
        dot: "bg-blue-500",
    },
    viewed: {
        label: "Visualizado",
        icon: Eye,
        color: "text-yellow-600 dark:text-yellow-400",
        bg: "bg-yellow-50 dark:bg-yellow-950/40",
        dot: "bg-yellow-500",
    },
    in_progress: {
        label: "Em Atendimento",
        icon: Wrench,
        color: "text-orange-600 dark:text-orange-400",
        bg: "bg-orange-50 dark:bg-orange-950/40",
        dot: "bg-orange-500",
    },
    resolved: {
        label: "Concluído",
        icon: CheckCircle2,
        color: "text-emerald-600 dark:text-emerald-400",
        bg: "bg-emerald-50 dark:bg-emerald-950/40",
        dot: "bg-emerald-500",
    },
};

export const SUPPORT_PRIORITY_CONFIG: Record<
    SupportPriority,
    { label: string; color: string; bg: string }
> = {
    low: {
        label: "Baixa",
        color: "text-gray-600 dark:text-gray-400",
        bg: "bg-gray-100 dark:bg-gray-800",
    },
    medium: {
        label: "Média",
        color: "text-blue-600 dark:text-blue-400",
        bg: "bg-blue-100 dark:bg-blue-900/50",
    },
    high: {
        label: "Alta",
        color: "text-orange-600 dark:text-orange-400",
        bg: "bg-orange-100 dark:bg-orange-900/50",
    },
    urgent: {
        label: "Urgente",
        color: "text-red-600 dark:text-red-400",
        bg: "bg-red-100 dark:bg-red-900/50",
    },
};

export const SUPPORT_STATUS_ORDER: SupportStatus[] = ["open", "viewed", "in_progress", "resolved"];
export const SUPPORT_PRIORITY_ORDER: SupportPriority[] = ["urgent", "high", "medium", "low"];
