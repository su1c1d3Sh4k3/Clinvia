import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

interface TypingContextValue {
    isTyping: boolean;
    setTyping: (value: boolean) => void;
    notifyTypingStart: () => void;
    notifyTypingStop: () => void;
}

const TypingContext = createContext<TypingContextValue>({
    isTyping: false,
    setTyping: () => { },
    notifyTypingStart: () => { },
    notifyTypingStop: () => { },
});

/**
 * Provider that manages the global typing state.
 * When user is typing, all realtime subscriptions can check this state
 * and pause their updates to prevent re-renders during typing.
 */
export const TypingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isTyping, setIsTyping] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const notifyTypingStart = useCallback(() => {
        setIsTyping(true);

        // Clear any existing timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
    }, []);

    const notifyTypingStop = useCallback(() => {
        // Debounce: wait 500ms after last keystroke before resuming subscriptions
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
            setIsTyping(false);
        }, 500);
    }, []);

    const setTyping = useCallback((value: boolean) => {
        if (value) {
            notifyTypingStart();
        } else {
            notifyTypingStop();
        }
    }, [notifyTypingStart, notifyTypingStop]);

    return (
        <TypingContext.Provider value={{ isTyping, setTyping, notifyTypingStart, notifyTypingStop }}>
            {children}
        </TypingContext.Provider>
    );
};

export const useTypingContext = () => useContext(TypingContext);

/**
 * Hook to easily check if typing is in progress.
 * Use this in subscription hooks to pause updates.
 */
export const useIsTyping = () => {
    const { isTyping } = useTypingContext();
    return isTyping;
};
