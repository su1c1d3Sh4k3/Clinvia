import { Outlet } from "react-router-dom";
import { NavigationSidebar } from "./NavigationSidebar";
import { BiaSupport } from "./support/BiaSupport";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { DisconnectedInstancesBanner } from "./DisconnectedInstancesBanner";
import { RestrictedInstancesBanner } from "./RestrictedInstancesBanner";

export const Layout = () => {
    return (
        <div className="flex flex-col h-screen w-full overflow-hidden bg-background">
            {/* Banners globais — empurram o conteúdo para baixo, visíveis em todas
                as rotas autenticadas. Ordem: impersonation > disconnect > restriction */}
            <ImpersonationBanner />
            <DisconnectedInstancesBanner />
            <RestrictedInstancesBanner />

            <div className="flex flex-1 overflow-hidden min-h-0">
                <NavigationSidebar />
                <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden min-w-0">
                    <Outlet />
                </div>
            </div>

            {/* Bia - Assistente de Suporte IA */}
            <BiaSupport />
        </div>
    );
};
