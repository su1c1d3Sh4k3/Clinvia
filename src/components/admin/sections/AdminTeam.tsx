// @ts-nocheck - admin_users fora dos types gerados
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, ShieldCheck, KeyRound, Pencil } from "lucide-react";
import {
    ADMIN_PAGES,
    ADMIN_PERMISSION_LEVELS,
    DEFAULT_ADMIN_PERMISSIONS,
    type AdminPermissions,
} from "@/lib/adminPermissions";

interface AdminUserRow {
    id: string;
    auth_user_id: string;
    name: string;
    email: string;
    is_active: boolean;
    permissions: AdminPermissions;
    created_at: string | null;
}

const LEVEL_BADGE: Record<string, string> = {
    none: "border-gray-600 text-gray-500",
    view: "border-blue-500/40 text-blue-300",
    edit: "border-green-500/40 text-green-300",
};

export default function AdminTeam({ canEdit }: { canEdit: boolean }) {
    const queryClient = useQueryClient();
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<AdminUserRow | null>(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
        is_active: true,
        permissions: { ...DEFAULT_ADMIN_PERMISSIONS } as AdminPermissions,
    });

    const { data: users = [], isLoading } = useQuery({
        queryKey: ["admin-users"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("admin_users" as any)
                .select("*")
                .order("created_at", { ascending: true });
            if (error) throw error;
            return (data || []) as unknown as AdminUserRow[];
        },
    });

    const openCreate = () => {
        setEditing(null);
        setForm({
            name: "",
            email: "",
            password: "",
            is_active: true,
            permissions: { ...DEFAULT_ADMIN_PERMISSIONS },
        });
        setModalOpen(true);
    };

    const openEdit = (row: AdminUserRow) => {
        setEditing(row);
        setForm({
            name: row.name,
            email: row.email,
            password: "",
            is_active: row.is_active,
            permissions: { ...DEFAULT_ADMIN_PERMISSIONS, ...(row.permissions || {}) },
        });
        setModalOpen(true);
    };

    const callFunction = async (body: Record<string, unknown>) => {
        const { data, error } = await supabase.functions.invoke("admin-create-user", { body });
        if (error) {
            // O corpo do erro traz a mensagem humana do contrato de erros
            let message = error.message;
            try {
                const parsed = await (error as any).context?.json?.();
                if (parsed?.message) message = parsed.message;
            } catch { /* mantém a mensagem padrão */ }
            throw new Error(message);
        }
        if (data && data.success === false) throw new Error(data.message || data.error);
        return data;
    };

    const handleSave = async () => {
        if (!form.name.trim() || !form.email.trim()) {
            toast.error("Informe nome e e-mail");
            return;
        }
        if (!editing && form.password.trim().length < 6) {
            toast.error("A senha precisa ter ao menos 6 caracteres");
            return;
        }

        setSaving(true);
        try {
            if (editing) {
                await callFunction({
                    action: "update",
                    id: editing.id,
                    name: form.name.trim(),
                    is_active: form.is_active,
                    permissions: form.permissions,
                });
                if (form.password.trim()) {
                    await callFunction({
                        action: "reset_password",
                        id: editing.id,
                        password: form.password.trim(),
                    });
                }
                toast.success("Usuário atualizado");
            } else {
                await callFunction({
                    action: "create",
                    name: form.name.trim(),
                    email: form.email.trim().toLowerCase(),
                    password: form.password.trim(),
                    permissions: form.permissions,
                });
                toast.success("Usuário criado — já pode entrar em /admin-oath");
            }
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            setModalOpen(false);
        } catch (err) {
            toast.error((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const handleToggleActive = async (row: AdminUserRow) => {
        try {
            await callFunction({
                action: row.is_active ? "deactivate" : "update",
                id: row.id,
                is_active: true,
            });
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            toast.success(row.is_active ? "Acesso desativado" : "Acesso reativado");
        } catch (err) {
            toast.error((err as Error).message);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-purple-400 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5" />
                    Equipe do painel ({users.length})
                </h3>
                {canEdit && (
                    <Button onClick={openCreate} className="bg-purple-600 hover:bg-purple-700 text-white">
                        <Plus className="w-4 h-4 mr-2" />
                        Novo usuário
                    </Button>
                )}
            </div>

            <Card className="bg-gray-800 border-gray-700">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table className="min-w-[720px]">
                            <TableHeader>
                                <TableRow className="border-gray-700 hover:bg-transparent">
                                    <TableHead className="text-gray-400">Nome</TableHead>
                                    <TableHead className="text-gray-400">E-mail</TableHead>
                                    <TableHead className="text-gray-400">Permissões</TableHead>
                                    <TableHead className="text-gray-400">Status</TableHead>
                                    {canEdit && <TableHead className="text-gray-400 text-right">Ações</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow className="border-gray-700">
                                        <TableCell colSpan={5} className="text-center text-gray-500 py-8">Carregando...</TableCell>
                                    </TableRow>
                                ) : users.length === 0 ? (
                                    <TableRow className="border-gray-700">
                                        <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                                            Nenhum usuário do painel cadastrado.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    users.map((u) => (
                                        <TableRow key={u.id} className="border-gray-700 hover:bg-gray-700/40">
                                            <TableCell className="text-white font-medium">{u.name}</TableCell>
                                            <TableCell className="text-gray-400">{u.email}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {ADMIN_PAGES.filter((p) => (u.permissions?.[p.value] ?? "none") !== "none").map((p) => (
                                                        <Badge
                                                            key={p.value}
                                                            variant="outline"
                                                            className={LEVEL_BADGE[u.permissions[p.value]]}
                                                        >
                                                            {p.label}
                                                            {u.permissions[p.value] === "edit" ? " · editar" : ""}
                                                        </Badge>
                                                    ))}
                                                    {ADMIN_PAGES.every((p) => (u.permissions?.[p.value] ?? "none") === "none") && (
                                                        <span className="text-xs text-gray-600">Sem acesso</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={u.is_active ? "border-green-500/40 text-green-300" : "border-gray-600 text-gray-500"}>
                                                    {u.is_active ? "Ativo" : "Inativo"}
                                                </Badge>
                                            </TableCell>
                                            {canEdit && (
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="border-gray-600 text-gray-300 hover:bg-gray-700"
                                                            onClick={() => openEdit(u)}
                                                        >
                                                            <Pencil className="w-3.5 h-3.5" />
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className={u.is_active
                                                                ? "border-red-600 text-red-400 hover:bg-red-600/20"
                                                                : "border-green-600 text-green-400 hover:bg-green-600/20"}
                                                            onClick={() => handleToggleActive(u)}
                                                        >
                                                            {u.is_active ? "Desativar" : "Reativar"}
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogContent className="bg-gray-800 border-gray-700 text-white w-[95vw] sm:w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-purple-400" />
                            {editing ? "Editar usuário do painel" : "Novo usuário do painel"}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label className="text-gray-300">Nome</Label>
                            <Input
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                className="bg-gray-900 border-gray-700 text-white"
                                placeholder="Nome do atendente"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-gray-300">E-mail</Label>
                            <Input
                                type="email"
                                value={form.email}
                                disabled={!!editing}
                                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                                className="bg-gray-900 border-gray-700 text-white disabled:opacity-60"
                                placeholder="atendente@clinvia.com.br"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-gray-300 flex items-center gap-1.5">
                                <KeyRound className="w-3.5 h-3.5" />
                                {editing ? "Nova senha (deixe vazio para manter)" : "Senha"}
                            </Label>
                            <Input
                                type="password"
                                value={form.password}
                                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                                className="bg-gray-900 border-gray-700 text-white"
                                placeholder="Mínimo 6 caracteres"
                            />
                        </div>

                        {editing && (
                            <div className="flex items-center justify-between rounded-lg border border-gray-700 p-3">
                                <div>
                                    <p className="text-sm text-white">Acesso ativo</p>
                                    <p className="text-xs text-gray-500">Desativar bloqueia o login no painel imediatamente.</p>
                                </div>
                                <Switch
                                    checked={form.is_active}
                                    onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                                />
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label className="text-gray-300">Permissões por página</Label>
                            <div className="space-y-2">
                                {ADMIN_PAGES.map((page) => (
                                    <div key={page.value} className="flex items-center gap-3">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-white">{page.label}</p>
                                            <p className="text-xs text-gray-500 truncate">{page.description}</p>
                                        </div>
                                        <Select
                                            value={form.permissions[page.value] ?? "none"}
                                            onValueChange={(v) =>
                                                setForm((f) => ({ ...f, permissions: { ...f.permissions, [page.value]: v as any } }))
                                            }
                                        >
                                            <SelectTrigger className="w-36 bg-gray-900 border-gray-700 text-white shrink-0">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-gray-800 border-gray-700 text-white">
                                                {ADMIN_PERMISSION_LEVELS.map((l) => (
                                                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            className="border-gray-600 text-gray-300 hover:bg-gray-700"
                            onClick={() => setModalOpen(false)}
                            disabled={saving}
                        >
                            Cancelar
                        </Button>
                        <Button
                            className="bg-purple-600 hover:bg-purple-700 text-white"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar usuário"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
