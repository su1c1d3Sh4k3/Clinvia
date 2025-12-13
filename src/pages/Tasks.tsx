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

    return (
        <div className="h-screen flex flex-col bg-background">
            <header className="border-b p-4 flex items-center justify-between bg-card">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <CalendarIcon className="h-6 w-6" />
                        Tarefas
                    </h1>
                    <div className="w-[250px]">
                        <Select value={selectedBoardId || ""} onValueChange={setSelectedBoardId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione um quadro" />
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
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setIsConfigOpen(true)}
                        disabled={!selectedBoardId && boards?.length > 0}
                        title="Configurar Quadro"
                    >
                        <Settings className="h-4 w-4" />
                    </Button>
                    <Button onClick={() => setIsConfigOpen(true)} variant={boards?.length === 0 ? "default" : "outline"}>
                        {boards?.length === 0 ? "Criar Primeiro Quadro" : "Novo Quadro"}
                    </Button>
                    {selectedBoardId && (
                        <Button onClick={() => setIsCreateTaskOpen(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Nova Tarefa
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
                        <Button onClick={() => setIsConfigOpen(true)}>
                            Criar Quadro
                        </Button>
                    </div>
                )}
            </main>

            <TaskBoardConfigModal
                open={isConfigOpen}
                onOpenChange={setIsConfigOpen}
                boardId={selectedBoardId} // If we want to edit the current board. Logic needs refinement if "New Board" button is clicked.
            />
        </div>
    );
}
