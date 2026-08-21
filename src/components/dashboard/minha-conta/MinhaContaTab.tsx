import { TokensSection } from "./TokensSection";
import { ConexoesSection } from "./ConexoesSection";
import { IASection } from "./IASection";
import { ColaboradoresSection } from "./ColaboradoresSection";

// Aba "Minha Conta" (admin-only): visão consolidada da conta do tenant —
// consumo de tokens da IA (R$), conexões, status da IA e colaboradores
export function MinhaContaTab() {
    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <TokensSection />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ConexoesSection />
                <IASection />
            </div>
            <ColaboradoresSection />
        </div>
    );
}
