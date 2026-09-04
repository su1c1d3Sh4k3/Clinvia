import { type ReactNode } from "react";
import { useLoginDesign } from "@/hooks/useLoginDesign";

// Cores fixas (hex, nao tokens): o fundo e IDENTICO no claro e no escuro, sempre
// na versao clara. `--secondary` vale hsl(218 25% 90%) = #DFE4EC no tema claro e
// muda no `.dark`, entao um token deixaria a tela de login escura para quem usa
// o modo noturno.
const SHELL_BG =
    "bg-[#DFE4EC] bg-gradient-to-br from-[#DFE4EC] via-[#E7EBF2] to-[#F3F6FA]";

/**
 * Fundo da tela de acesso. Com banner publicado em /admin?tab=design-login a
 * tela se divide ao meio (banner à esquerda, caixa à direita); sem banner a
 * caixa continua centralizada. No mobile o banner nunca aparece.
 *
 * A casca é travada na altura da janela (`h-[100dvh]` + `overflow-hidden`): o
 * banner acompanha a resolução da tela em vez de esticar a página. Só a coluna
 * do formulário rola, e apenas quando o cartão não cabe (aba Cadastro em telas
 * baixas).
 */
export function AuthShell({ children }: { children: ReactNode }) {
    const { data } = useLoginDesign();
    const imageUrl = data?.image_url || null;
    const linkUrl = data?.link_url?.trim() || null;

    const image = imageUrl ? (
        <img
            src={imageUrl}
            alt="Clinbia"
            className="w-full h-full object-cover"
            draggable={false}
        />
    ) : null;

    return (
        <div className={`h-[100dvh] flex relative overflow-hidden ${SHELL_BG}`}>
            {/* Decorative background elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-[#245EFF]/20 blur-[100px]" />
                <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-[#1668C1]/10 blur-[100px]" />
                <div className="absolute -bottom-[10%] left-[20%] w-[30%] h-[30%] rounded-full bg-white/40 blur-[80px]" />
            </div>

            {image && (
                <div className="relative z-10 hidden lg:block w-1/2 shrink-0 h-full overflow-hidden">
                    {linkUrl ? (
                        <a
                            href={linkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-full h-full"
                        >
                            {image}
                        </a>
                    ) : (
                        image
                    )}
                </div>
            )}

            {/* m-auto (e nao items-center) porque em container rolavel o centro
                corta o topo do cartao quando ele e mais alto que a janela */}
            <div className="relative z-10 flex-1 min-w-0 h-full overflow-y-auto flex p-4">
                <div className="m-auto w-full flex justify-center">{children}</div>
            </div>
        </div>
    );
}
