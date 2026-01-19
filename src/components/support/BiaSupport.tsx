import { BiaButton } from "./BiaButton";
import { BiaChatWindow } from "./BiaChatWindow";
import { useBiaChat } from "@/hooks/useBiaChat";

export const BiaSupport = () => {
    const {
        messages,
        isLoading,
        sendMessage,
        clearMessages,
        isOpen,
        setIsOpen
    } = useBiaChat();

    return (
        <>
            <BiaButton
                onClick={() => setIsOpen(!isOpen)}
                isOpen={isOpen}
                hasNewMessage={false}
            />
            <BiaChatWindow
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                messages={messages}
                isLoading={isLoading}
                onSendMessage={sendMessage}
                onClearHistory={clearMessages}
            />
        </>
    );
};
