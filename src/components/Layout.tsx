import { Outlet } from "react-router-dom";
import { NavigationSidebar } from "./NavigationSidebar";

export const Layout = () => {
    return (
        <div className="flex h-screen w-full overflow-hidden bg-background">
            <NavigationSidebar />
            <div className="flex-1 flex flex-col overflow-y-auto">
                <Outlet />
            </div>
        </div>
    );
};
