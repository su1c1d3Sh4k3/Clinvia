// Fonte única das páginas e níveis de permissão do painel administrativo.
// Espelha o JSON gravado em admin_users.permissions e lido pela função SQL
// public.admin_can(page, level).
import {
    LayoutDashboard,
    Users,
    Activity,
    ShieldCheck,
    Headphones,
    Megaphone,
    Image,
    type LucideIcon,
} from "lucide-react";

export type AdminPage =
    | "dashboard"
    | "clientes"
    | "monitoramento"
    | "equipe"
    | "suporte"
    | "atualizacoes"
    | "design-login";

export type AdminPermissionLevel = "none" | "view" | "edit";

export interface AdminPageDef {
    value: AdminPage;
    label: string;
    icon: LucideIcon;
    description: string;
}

export const ADMIN_PAGES: AdminPageDef[] = [
    { value: "dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Visão geral do sistema" },
    { value: "clientes", label: "Clientes", icon: Users, description: "Contas ativas, pendentes e inativas" },
    { value: "monitoramento", label: "Monitoramento", icon: Activity, description: "Saúde da infraestrutura" },
    { value: "equipe", label: "Equipe", icon: ShieldCheck, description: "Usuários do painel e permissões" },
    { value: "suporte", label: "Suporte", icon: Headphones, description: "Chamados dos clientes" },
    { value: "atualizacoes", label: "Atualizações", icon: Megaphone, description: "Notificações publicadas" },
    { value: "design-login", label: "Design de Login", icon: Image, description: "Banner da tela de acesso" },
];

export const ADMIN_PERMISSION_LEVELS: { value: AdminPermissionLevel; label: string }[] = [
    { value: "none", label: "Sem acesso" },
    { value: "view", label: "Visualizar" },
    { value: "edit", label: "Editar" },
];

export type AdminPermissions = Partial<Record<AdminPage, AdminPermissionLevel>>;

export const DEFAULT_ADMIN_PERMISSIONS: AdminPermissions = {
    dashboard: "view",
    clientes: "none",
    monitoramento: "none",
    equipe: "none",
    suporte: "edit",
    atualizacoes: "none",
    "design-login": "none",
};

/** Espelho em TS de public.admin_can — o servidor continua sendo a autoridade. */
export function permissionAllows(
    permissions: AdminPermissions | null | undefined,
    page: AdminPage,
    level: AdminPermissionLevel = "view",
): boolean {
    const current = permissions?.[page] ?? "none";
    if (current === "none") return false;
    if (level === "edit") return current === "edit";
    return true;
}
