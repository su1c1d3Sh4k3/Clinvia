import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Settings, Calendar as CalendarIcon } from "lucide-react";
import { TaskBoardConfigModal } from "@/components/tasks/TaskBoardConfigModal";
import { TaskBoard } from "@/components/tasks/TaskBoard";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export default function Tasks() {
    const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [editingBoardId, setEditingBoardId] = useState<string | null>(null); // null = create new, string = edit existing
    const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);

    const { data: boards, isLoading } = useQuery({
        queryKey: ["task-boards"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("task_boards" as any)
                .select("*")
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data;
        },
    });

    // Auto-select first board
    useEffect(() => {
        if (boards && boards.length > 0 && !selectedBoardId) {
            setSelectedBoardId(boards[0].id);
        }
    }, [boards, selectedBoardId]);

    const currentBoard = boards?.find(b => b.id === selectedBoardId);

    // Open modal to EDIT current board
    const handleEditBoard = () => {
        setEditingBoardId(selectedBoardId);
        setIsConfigOpen(true);
    };

    // Open modal to CREATE new board
    const handleNewBoard = () => {
        setEditingBoardId(null);
        setIsConfigOpen(true);
    };

    return (
        <div className="h-screen flex flex-col bg-background">
            <header className="border-b p-3 md:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                        <CalendarIcon className="h-5 w-5 md:h-6 md:w-6" />
                        Tarefas
                    </h1>
                    <div className="w-full sm:w-[200px] md:w-[250px]">
                        <Select value={selectedBoardId || ""} onValueChange={setSelectedBoardId}>
                            <SelectTrigger className="h-8 md:h-9 text-sm">
                                <SelectValue placeholder="Selecione quadro" />
                            </SelectTrigger>
                            <SelectContent>
                                {boards?.map((board) => (
                                    <SelectItem key={board.id} value={board.id}>
                                        {board.name}
                                    </SelectItem>
                                ))}
                                {(!boards || boards.length === 0) && (
                                    <div className="p-2 text-sm text-muted-foreground text-center">
                                        Nenhum quadro encontrado
                                    </div>
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="flex items-center gap-1 md:gap-2 flex-wrap">
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 md:h-9 md:w-9"
                        onClick={handleEditBoard}
                        disabled={!selectedBoardId}
                        title="Configurar Quadro"
                    >
                        <Settings className="h-3.5 w-3.5 md:h-4 md:w-4" />
                    </Button>
                    <Button
                        onClick={handleNewBoard}
                        variant={boards?.length === 0 ? "default" : "outline"}
                        size="sm"
                        className="h-8 md:h-9 text-xs md:text-sm"
                    >
                        <span className="hidden sm:inline">{boards?.length === 0 ? "Criar Primeiro Quadro" : "Novo Quadro"}</span>
                        <span className="sm:hidden">{boards?.length === 0 ? "Criar" : "Quadro"}</span>
                    </Button>
                    {selectedBoardId && (
                        <Button onClick={() => setIsCreateTaskOpen(true)} size="sm" className="h-8 md:h-9 text-xs md:text-sm">
                            <Plus className="h-4 w-4 mr-1 md:mr-2" />
                            <span className="hidden sm:inline">Nova </span>Tarefa
                        </Button>
                    )}
                </div>
            </header>


            <main className="flex-1 overflow-hidden p-4">
                {selectedBoardId ? (
                    <div className="h-full border rounded-lg bg-card shadow-sm overflow-hidden">
                        <TaskBoard boardId={selectedBoardId} />
                    </div>
                ) : (
                    <div className="h-full border rounded-lg bg-card/50 flex flex-col items-center justify-center text-muted-foreground gap-4">
                        <CalendarIcon className="h-12 w-12 opacity-20" />
                        <p>Selecione ou crie um quadro para começar</p>
                        <Button onClick={handleNewBoard}>
                            Criar Quadro
                        </Button>
                    </div>
                )}
            </main>

            <TaskBoardConfigModal
                open={isConfigOpen}
                onOpenChange={setIsConfigOpen}
                boardId={editingBoardId}
            />
        </div>
    );
}
