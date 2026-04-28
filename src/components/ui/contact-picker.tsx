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

// Limite por consulta — suficiente para autocomplete sem custo de baixar a lista inteira.
// Buscas server-side garantem que QUALQUER contato seja encontrado, independente do total.
const PAGE_SIZE = 50

// Escapa caracteres especiais do PostgREST para uso em ilike pattern (.or() filter values).
// Vírgulas e parênteses precisam ser escapados pra não quebrar o or().
function escapePostgrestValue(s: string): string {
    return s.replace(/[(),"]/g, " ").trim()
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
    const [searchTerm, setSearchTerm] = React.useState("")
    const [debouncedSearch, setDebouncedSearch] = React.useState("")
    const { data: ownerId, isLoading: isLoadingOwner } = useOwnerId()

    // Debounce do termo de busca: evita disparar query a cada tecla
    React.useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 200)
        return () => clearTimeout(t)
    }, [searchTerm])

    // 1) Busca server-side: PAGE_SIZE resultados que casam com o termo (ou últimos PAGE_SIZE quando vazio)
    const { data: contacts = [], isLoading: isLoadingContacts, isFetching } = useQuery({
        queryKey: ["contacts-picker", ownerId, debouncedSearch],
        queryFn: async () => {
            if (!ownerId) return []

            let query = supabase
                .from("contacts")
                .select("id, push_name, number")
                .eq("user_id", ownerId)
                // Exclui grupos no servidor — mais rápido e correto
                .not("number", "ilike", "%@g.us")

            if (debouncedSearch) {
                const term = escapePostgrestValue(debouncedSearch)
                if (term) {
                    // Busca em push_name OU number — case-insensitive
                    query = query.or(`push_name.ilike.%${term}%,number.ilike.%${term}%`)
                }
                // Quando o usuário busca, ordena alfabeticamente para resultados consistentes
                query = query.order("push_name", { ascending: true, nullsFirst: false })
            } else {
                // Sem termo: mostra os mais recentes (faz sentido pra contatos novos serem visíveis)
                query = query.order("updated_at", { ascending: false, nullsFirst: false })
            }

            const { data, error } = await query.limit(PAGE_SIZE)
            if (error) throw error
            return (data as Contact[]) || []
        },
        enabled: !!ownerId,
        staleTime: 30_000,
        // Mantém os resultados anteriores enquanto a próxima busca carrega — evita flicker
        placeholderData: (prev) => prev,
    })

    // 2) Garante que o contato SELECIONADO esteja sempre disponível (mesmo se não cair na lista atual)
    const { data: selectedContactRemote } = useQuery({
        queryKey: ["contacts-picker-selected", value],
        queryFn: async () => {
            if (!value) return null
            const { data, error } = await supabase
                .from("contacts")
                .select("id, push_name, number")
                .eq("id", value)
                .maybeSingle()
            if (error) throw error
            return data as Contact | null
        },
        enabled: !!value,
        staleTime: 60_000,
    })

    const selectedContact =
        contacts.find((c) => c.id === value) || selectedContactRemote || null

    const isLoading = isLoadingOwner || isLoadingContacts
    const showFetchingHint = isFetching && !isLoading

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
                {/*
                  shouldFilter={false} desabilita o filtro client-side do cmdk.
                  Toda a busca é server-side via debouncedSearch — assim qualquer contato
                  do banco é alcançável, sem o limite implícito de 1000 do Supabase.
                */}
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Buscar por nome ou número..."
                        value={searchTerm}
                        onValueChange={setSearchTerm}
                    />
                    <CommandList className="max-h-[500px] nav-scrollbar">
                        {showFetchingHint && (
                            <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Buscando...
                            </div>
                        )}
                        {!isFetching && contacts.length === 0 && (
                            <CommandEmpty>
                                {debouncedSearch
                                    ? `Nenhum contato encontrado para "${debouncedSearch}".`
                                    : "Nenhum contato cadastrado."}
                            </CommandEmpty>
                        )}
                        <CommandGroup>
                            {contacts.map((contact) => (
                                <CommandItem
                                    key={contact.id}
                                    value={contact.id}
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
                        {!isFetching && contacts.length === PAGE_SIZE && (
                            <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-t">
                                Mostrando os primeiros {PAGE_SIZE} resultados — refine a busca para ver mais.
                            </div>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
