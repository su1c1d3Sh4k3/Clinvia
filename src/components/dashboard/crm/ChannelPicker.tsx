import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCrmChannels } from "@/hooks/useCrmChannels";

interface ChannelPickerProps {
    value: string | null;
    onChange: (value: string | null) => void;
    /** Datas passadas usam snapshot agregado por conta — o filtro não se aplica */
    disabled?: boolean;
}

/**
 * Filtro de conexão do CRM. Cada conexão tem seu próprio funil; "Todas" soma
 * os funis. Some quando a conta tem uma conexão só.
 */
export function ChannelPicker({ value, onChange, disabled }: ChannelPickerProps) {
    const { data: channels } = useCrmChannels();
    if (!channels || channels.length <= 1) return null;

    return (
        <Select
            value={value || "todos"}
            onValueChange={(v) => onChange(v === "todos" ? null : v)}
            disabled={disabled}
        >
            <SelectTrigger className="h-8 w-[190px] text-xs">
                <SelectValue placeholder="Todas as conexões" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="todos">Todas as conexões</SelectItem>
                {channels.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                        {c.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
