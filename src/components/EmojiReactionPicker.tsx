import { useState } from "react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const POPULAR_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "👏"];

interface EmojiReactionPickerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (emoji: string) => void;
    children?: React.ReactNode;
}

export function EmojiReactionPicker({
    open,
    onOpenChange,
    onSelect,
    children,
}: EmojiReactionPickerProps) {
    const handleSelect = (emoji: string) => {
        onSelect(emoji);
        onOpenChange(false);
    };

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            {children && <PopoverTrigger asChild>{children}</PopoverTrigger>}
            <PopoverContent
                className="w-auto p-2"
                align="center"
                side="top"
            >
                <div className="flex gap-1">
                    {POPULAR_EMOJIS.map((emoji) => (
                        <Button
                            key={emoji}
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-lg hover:bg-accent"
                            onClick={() => handleSelect(emoji)}
                        >
                            {emoji}
                        </Button>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}

// Standalone version that can be positioned manually
interface EmojiPickerStandaloneProps {
    onSelect: (emoji: string) => void;
    onClose: () => void;
    className?: string;
}

export function EmojiPickerStandalone({
    onSelect,
    onClose,
    className,
}: EmojiPickerStandaloneProps) {
    return (
        <div
            className={cn(
                "bg-popover border rounded-lg shadow-lg p-2 flex gap-1",
                className
            )}
        >
            {POPULAR_EMOJIS.map((emoji) => (
                <Button
                    key={emoji}
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-lg hover:bg-accent"
                    onClick={() => {
                        onSelect(emoji);
                        onClose();
                    }}
                >
                    {emoji}
                </Button>
            ))}
        </div>
    );
}
