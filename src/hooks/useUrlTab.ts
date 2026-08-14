import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Aba controlada persistida na URL (?tab=...) — refresh e compartilhamento de
 * link mantêm a aba selecionada. Usar em toda página com Tabs de nível de página.
 */
export function useUrlTab(defaultTab: string, param = "tab") {
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = searchParams.get(param) || defaultTab;

    const setTab = useCallback(
        (value: string) => {
            setSearchParams(
                (prev) => {
                    const next = new URLSearchParams(prev);
                    if (value === defaultTab) next.delete(param);
                    else next.set(param, value);
                    return next;
                },
                { replace: true }
            );
        },
        [setSearchParams, defaultTab, param]
    );

    return [tab, setTab] as const;
}
