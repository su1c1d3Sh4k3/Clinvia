import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Chave única da sincronia com o Google Calendar — lado front.
 *
 * Mesma célula que o servidor lê (`llm_platform_settings.google_calendar_enabled`).
 * A tabela tem RLS ligada e nenhuma policy, então o front NÃO a lê direto —
 * a RPC devolve só o booleano, sem expor saldo da OpenAI nem e-mail de alerta
 * que moram nas colunas vizinhas.
 *
 * Em erro ou enquanto carrega, o resultado é DESLIGADO. O que se perde é meio
 * segundo de botão ausente numa conta que tem o recurso ligado; o que se
 * evita é oferecer "Conectar Google Calendar" para um servidor que vai
 * recusar — promessa que a tela não pode cumprir.
 */
export function useGoogleCalendarEnabled() {
    const { data, isLoading } = useQuery({
        queryKey: ["google-calendar-enabled"],
        queryFn: async () => {
            const { data, error } = await supabase.rpc("google_calendar_enabled");
            if (error) throw error;
            return data === true;
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
    });

    return { gcalEnabled: data === true, gcalFlagLoading: isLoading };
}
