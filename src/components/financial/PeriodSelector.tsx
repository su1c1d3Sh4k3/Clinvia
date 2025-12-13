import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type PeriodMode = 'monthly' | 'quarterly' | 'yearly';

interface PeriodSelectorProps {
    mode: PeriodMode;
    currentPeriod: Date;
    onModeChange: (mode: PeriodMode) => void;
    onPeriodChange: (date: Date) => void;
}

const PeriodSelector = ({ mode, currentPeriod, onModeChange, onPeriodChange }: PeriodSelectorProps) => {
    const getDisplayText = () => {
        const month = currentPeriod.getMonth();
        const year = currentPeriod.getFullYear();

        const monthNames = [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];

        switch (mode) {
            case 'monthly':
                return `${monthNames[month]} ${year}`;
            case 'quarterly':
                const quarter = Math.floor(month / 3) + 1;
                return `Q${quarter} ${year}`;
            case 'yearly':
                return `${year}`;
        }
    };

    const getSubText = () => {
        switch (mode) {
            case 'monthly':
                return 'Mensal';
            case 'quarterly':
                return 'Trimestral';
            case 'yearly':
                return 'Anual';
        }
    };

    const handleNavigate = (direction: 'prev' | 'next') => {
        const newDate = new Date(currentPeriod);
        const multiplier = direction === 'next' ? 1 : -1;

        switch (mode) {
            case 'monthly':
                newDate.setMonth(newDate.getMonth() + multiplier);
                break;
            case 'quarterly':
                newDate.setMonth(newDate.getMonth() + (3 * multiplier));
                break;
            case 'yearly':
                newDate.setFullYear(newDate.getFullYear() + multiplier);
                break;
        }

        onPeriodChange(newDate);
    };

    return (
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg p-1">
            <Button
                variant="ghost"
                size="icon"
                onClick={() => handleNavigate('prev')}
                className="h-8 w-8"
            >
                <ChevronLeft className="h-4 w-4" />
            </Button>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        className="h-8 px-4 font-semibold hover:bg-accent min-w-[180px]"
                    >
                        <div className="flex flex-col items-center">
                            <span className="text-sm leading-none">{getDisplayText()}</span>
                            <span className="text-xs text-muted-foreground leading-none mt-0.5">
                                {getSubText()}
                            </span>
                        </div>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center">
                    <DropdownMenuItem onClick={() => onModeChange('monthly')}>
                        Mensal
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onModeChange('quarterly')}>
                        Trimestral
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onModeChange('yearly')}>
                        Anual
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <Button
                variant="ghost"
                size="icon"
                onClick={() => handleNavigate('next')}
                className="h-8 w-8"
            >
                <ChevronRight className="h-4 w-4" />
            </Button>
        </div>
    );
};

export default PeriodSelector;
