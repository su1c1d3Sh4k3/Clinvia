import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { NavigationSidebar } from "./NavigationSidebar";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { BiaSupport } from "./support/BiaSupport";
import { supabase } from "@/integrations/supabase/client";

export const Layout = () => {
    const [showPasswordModal, setShowPasswordModal] = useState(false);

    useEffect(() => {
        const checkMustChangePassword = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profile } = await supabase
                    .from("profiles")
                    .select("must_change_password")
                    .eq("id", user.id)
                    .single();

                if (profile?.must_change_password === true) {
                    setShowPasswordModal(true);
                }
            }
        };

        checkMustChangePassword();
    }, []);

    return (
        <div className="flex h-screen w-full overflow-hidden bg-background">
            <NavigationSidebar />
            <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden min-w-0">
                <Outlet />
            </div>

            <ChangePasswordModal
                open={showPasswordModal}
                onClose={() => setShowPasswordModal(false)}
            />

            {/* Bia - Assistente de Suporte IA */}
            <BiaSupport />
        </div>
    );
};
