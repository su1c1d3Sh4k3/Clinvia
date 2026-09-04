import { type ReactNode } from "react";
import { useLoginDesign } from "@/hooks/useLoginDesign";

/**
 * Fundo da tela de acesso. Com banner publicado em /admin?tab=design-login a
 * tela se divide ao meio (banner à esquerda, caixa à direita); sem banner a
 * caixa continua centralizada. No mobile o banner nunca aparece.
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
        <div className="min-h-screen flex bg-gradient-to-br from-secondary via-secondary/90 to-tertiary relative overflow-hidden">
            {/* Decorative background elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-primary/20 blur-[100px]" />
                <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-tertiary/30 blur-[100px]" />
                <div className="absolute -bottom-[10%] left-[20%] w-[30%] h-[30%] rounded-full bg-white/10 blur-[80px]" />
            </div>

            {image && (
                <div className="relative z-10 hidden lg:block w-1/2 shrink-0 min-h-screen overflow-hidden">
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

            <div className="relative z-10 flex-1 min-w-0 flex items-center justify-center p-4">
                {children}
            </div>
        </div>
    );
}
