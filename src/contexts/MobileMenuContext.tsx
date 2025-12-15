import { createContext, useContext, useState, ReactNode } from "react";

interface MobileMenuContextType {
    hideFloatingButton: boolean;
    setHideFloatingButton: (hide: boolean) => void;
}

const MobileMenuContext = createContext<MobileMenuContextType>({
    hideFloatingButton: false,
    setHideFloatingButton: () => { },
});

export const useMobileMenu = () => useContext(MobileMenuContext);

export const MobileMenuProvider = ({ children }: { children: ReactNode }) => {
    const [hideFloatingButton, setHideFloatingButton] = useState(false);

    return (
        <MobileMenuContext.Provider value={{ hideFloatingButton, setHideFloatingButton }}>
            {children}
        </MobileMenuContext.Provider>
    );
};
