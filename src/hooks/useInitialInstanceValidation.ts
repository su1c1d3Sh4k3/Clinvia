import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Validação on-login das instâncias UZAPI do owner. Garante que o estado
 * `instances.status` esteja FRESH antes que os banners de desconexão /
 * restrição renderizem — caso contrário, o usuário veria o último estado
 * persistido (que pode estar obsoleto até o próximo cron de health-check).
 *
 * Comportamento:
 *   - Aguarda `ownerId` ser resolvido pelo useOwnerId
 *   - Dispara POST /uzapi-health-check com {owner_id} (filtra apenas as
 *     instâncias daquele owner — leve, ~1-3s)
 *   - Quando completa, invalida as queries dos banners no React Query
 *   - Cacheia em memória para não re-disparar a cada navegação interna;
 *     re-valida apenas quando o ownerId mudar (login/logout)
 *
 * Retorna `{ validated }` — banners devem renderizar `null` enquanto false.
 */
// Sessão singleton: armazena owners já validados E coalesce promises em
// vôo para evitar que múltiplos banners disparem o mesmo health-check.
const validatedOwners = new Set<string>();
const inFlight = new Map<string, Promise<void>>();

// Timeout MÁXIMO da validação on-login. Se a uzapi-health-check estiver lenta
// (instância travada, UZAPI sem resposta), o app NÃO espera — libera o render
// dos banners com o estado atual do banco. O cron periódico atualiza depois.
const VALIDATION_TIMEOUT_MS = 2500;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | "timeout"> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve("timeout"), ms);
        p.then(
            (v) => {
                clearTimeout(timer);
                resolve(v);
            },
            () => {
                clearTimeout(timer);
                resolve("timeout");
            },
        );
    });
}

async function validateOwnerOnce(ownerId: string): Promise<void> {
    if (validatedOwners.has(ownerId)) return;
    const existing = inFlight.get(ownerId);
    if (existing) return existing;

    const p = (async () => {
        try {
            // Limita o tempo de espera: se a edge function demorar mais que o
            // timeout, abandona em silêncio. Banners renderizam com o estado
            // do banco e o cron de 10min eventualmente sincroniza.
            await withTimeout(
                supabase.functions.invoke("uzapi-health-check", {
                    body: { owner_id: ownerId },
                }),
                VALIDATION_TIMEOUT_MS,
            );
        } catch (err) {
            console.warn("[useInitialInstanceValidation] health-check failed:", err);
        } finally {
            inFlight.delete(ownerId);
            validatedOwners.add(ownerId);
        }
    })();

    inFlight.set(ownerId, p);
    return p;
}

export function useInitialInstanceValidation(
    ownerId: string | null | undefined,
): { validated: boolean } {
    const queryClient = useQueryClient();
    // Começa validated=true SE já validamos este owner OU se NÃO há ownerId
    // ainda. Não bloqueamos o render esperando a validação — ela apenas
    // refresca o estado em background quando termina.
    const [validated, setValidated] = useState<boolean>(true);

    useEffect(() => {
        if (!ownerId) return;
        if (validatedOwners.has(ownerId)) {
            setValidated(true);
            return;
        }

        let cancelled = false;
        validateOwnerOnce(ownerId).then(() => {
            if (cancelled) return;
            // Após a validação terminar, invalida queries para refletir estado
            // fresh — mas os banners JÁ estão renderizando o estado do banco
            // desde o início (não houve flash de "loading silencioso").
            queryClient.invalidateQueries({
                queryKey: ["instances-disconnected", ownerId],
            });
            queryClient.invalidateQueries({
                queryKey: ["instances-restricted", ownerId],
            });
            setValidated(true);
        });

        return () => {
            cancelled = true;
        };
    }, [ownerId, queryClient]);

    return { validated };
}

/**
 * Limpa o cache de validação. Chamar no logout (ou em troca de sessão) para
 * forçar nova validação no próximo login.
 */
export function clearInstanceValidationCache(): void {
    validatedOwners.clear();
    inFlight.clear();
}
