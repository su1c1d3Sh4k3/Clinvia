import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { NavigationSidebar } from "./NavigationSidebar";
import { BiaSupport } from "./support/BiaSupport";

const IMPERSONATION_KEY = 'clinvia_impersonation';

export const Layout = () => {
    const [isImpersonating, setIsImpersonating] = useState(false);

    useEffect(() => {
        // Check if impersonating
        const checkImpersonation = () => {
            const storedData = localStorage.getItem(IMPERSONATION_KEY);
            setIsImpersonating(!!storedData);
        };

        checkImpersonation();

        // Listen for storage changes
        window.addEventListener('storage', checkImpersonation);
        return () => window.removeEventListener('storage', checkImpersonation);
    }, []);

    return (
        <div className={`flex h-screen w-full overflow-hidden bg-background ${isImpersonating ? 'pt-10' : ''}`}>
            <NavigationSidebar />
            <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden min-w-0">
                <Outlet />
            </div>

            {/* Bia - Assistente de Suporte IA */}
            <BiaSupport />
        </div>
    );
};
