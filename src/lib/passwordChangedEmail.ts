import { supabase } from "@/integrations/supabase/client";

/** Dispara o aviso de segurança "sua senha foi alterada".
 *
 *  A edge fn resolve o destinatário pelo JWT de quem chamou — o e-mail sempre
 *  vai para o dono da conta que acabou de trocar a senha, nunca para outro
 *  endereço. Falha de envio não pode atrapalhar a troca em si, então o erro
 *  fica só no console. */
export async function notifyPasswordChanged(): Promise<void> {
    try {
        await supabase.functions.invoke("send-account-email", {
            body: {
                template: "password_changed",
                vars: {
                    data_alteracao: new Date().toLocaleString("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                    }).replace(", ", " às "),
                },
            },
        });
    } catch (e) {
        console.error("[notifyPasswordChanged] aviso não enviado:", e);
    }
}
