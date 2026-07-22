import { useState } from "react";
import { format, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DayPickerProps {
    date: Date;
    onDateChange: (date: Date) => void;
}

export function DayPicker({ date, onDateChange }: DayPickerProps) {
    const [open, setOpen] = useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className={cn("h-8 gap-2 text-xs font-normal", isToday(date) && "text-primary")}
                >
                    <CalendarDays className="h-3.5 w-3.5" />
                    {isToday(date) ? "Hoje" : format(date, "dd 'de' MMMM", { locale: ptBR })}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => {
                        if (d) {
                            onDateChange(d);
                            setOpen(false);
                        }
                    }}
                    disabled={(d) => d > new Date()}
                    locale={ptBR}
                    initialFocus
                />
            </PopoverContent>
        </Popover>
    );
}
