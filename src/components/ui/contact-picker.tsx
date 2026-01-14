import * as React from "react"
import { Check, ChevronsUpDown, Loader2 } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/integrations/supabase/client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { useOwnerId } from "@/hooks/useOwnerId"

interface Contact {
    id: string
    push_name: string
    number: string
}

interface ContactPickerProps {
    value?: string
    onChange: (value: string, contact?: Contact) => void
    disabled?: boolean
    placeholder?: string
    modal?: boolean
    showNumber?: boolean
    className?: string
}

export function ContactPicker({
    value,
    onChange,
    disabled,
    placeholder = "Selecione um contato...",
    modal = false,
    showNumber = true,
    className
}: ContactPickerProps) {
    const [open, setOpen] = React.useState(false)
    const { data: ownerId, isLoading: isLoadingOwner } = useOwnerId()

    const { data: contacts = [], isLoading: isLoadingContacts } = useQuery({
        queryKey: ["contacts-picker", ownerId],
        queryFn: async () => {
            if (!ownerId) return []

            const { data, error } = await supabase
                .from("contacts")
                .select("id, push_name, number")
                .eq("user_id", ownerId)
                .order("push_name")

            if (error) throw error
            // Filter out groups client-side if needed, but preferably server-side
            // We also add a server-side filter for @g.us just in case
            return (data as Contact[]).filter(c => !c.number?.endsWith('@g.us'))
        },
        enabled: !!ownerId,
    })

    // Find selected contact object
    const selectedContact = contacts.find((contact) => contact.id === value)
    const isLoading = isLoadingOwner || isLoadingContacts

    return (
        <Popover open={open} onOpenChange={setOpen} modal={modal}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full justify-between font-normal", className)}
                    disabled={disabled || isLoading}
                >
                    {isLoading ? (
                        <span className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Carregando...
                        </span>
                    ) : selectedContact ? (
                        <span className="truncate">
                            {selectedContact.push_name}
                            {showNumber && selectedContact.number && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                    ({selectedContact.number.split('@')[0]})
                                </span>
                            )}
                        </span>
                    ) : (
                        <span className="text-muted-foreground truncate">{placeholder}</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command filter={(value, search) => {
                    // Custom filter to match against the displayed text in CommandItem
                    if (value.toLowerCase().includes(search.toLowerCase())) return 1;
                    return 0;
                }}>
                    <CommandInput placeholder="Buscar por nome ou número..." />
                    <CommandList className="max-h-[500px] nav-scrollbar">
                        <CommandEmpty>Nenhum contato encontrado.</CommandEmpty>
                        <CommandGroup>
                            {contacts.map((contact) => (
                                <CommandItem
                                    key={contact.id}
                                    value={`${contact.push_name} ${contact.number}`} // Searchable string
                                    onSelect={() => {
                                        onChange(contact.id === value ? "" : contact.id, contact)
                                        setOpen(false)
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === contact.id ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <div className="flex flex-col overflow-hidden">
                                        <span className="truncate font-medium">{contact.push_name}</span>
                                        <span className="text-xs text-muted-foreground truncate">
                                            {contact.number ? contact.number.split('@')[0] : ''}
                                        </span>
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
