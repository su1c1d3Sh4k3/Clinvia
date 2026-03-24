import { Outlet } from "react-router-dom";
import { NavigationSidebar } from "./NavigationSidebar";
import { BiaSupport } from "./support/BiaSupport";
import { ImpersonationBanner } from "./ImpersonationBanner";

export const Layout = () => {
    return (
        <div className="flex flex-col h-screen w-full overflow-hidden bg-background">
            {/* Banner de impersonação — elemento estático que empurra o conteúdo para baixo */}
            <ImpersonationBanner />

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
