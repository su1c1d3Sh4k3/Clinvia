import { render, screen, fireEvent } from '@testing-library/react';
import { MessageInput } from './MessageInput';
import { vi, describe, it, expect } from 'vitest';

// Mock dependencies
vi.mock('@/components/QuickMessagesMenu', () => ({
    QuickMessagesMenu: () => <div data-testid="quick-messages-menu">QuickMessagesMenu</div>
}));

vi.mock('emoji-picker-react', () => ({
    default: () => <div data-testid="emoji-picker">EmojiPicker</div>
}));

describe('MessageInput', () => {
    const defaultProps = {
        message: '',
        setMessage: vi.fn(),
        handleSend: vi.fn(),
        handleFileSelect: vi.fn(),
        selectedFile: null,
        handleRemoveFile: vi.fn(),
        isRecording: false,
        handleStartRecording: vi.fn(),
        handleStopRecording: vi.fn(),
        recordingTime: 0,
        isUploading: false,
        handleAiAction: vi.fn(),
        replyingTo: null,
        setReplyingTo: vi.fn(),
        handlePaste: vi.fn(),
        quickMessages: [
            { id: '1', shortcut: 'hello', message_type: 'text' as const, content: 'Hello World', media_url: null },
            { id: '2', shortcut: 'bye', message_type: 'text' as const, content: 'Goodbye', media_url: null }
        ],
        onQuickMessageSelect: vi.fn(),
        onSendSurvey: vi.fn(),
        isSendingSurvey: false
    };

    it('renders correctly with empty state', () => {
        render(<MessageInput {...defaultProps} />);
        expect(screen.getByPlaceholderText('Digite uma mensagem')).toBeInTheDocument();
        expect(screen.getByTestId('quick-messages-menu')).toBeInTheDocument();
    });

    it('updates value when typing', () => {
        render(<MessageInput {...defaultProps} />);
        const input = screen.getByPlaceholderText('Digite uma mensagem');
        fireEvent.change(input, { target: { value: 'test message' } });
        expect(defaultProps.setMessage).toHaveBeenCalledWith('test message');
    });

    it('shows quick message popup when typing /', () => {
        // Redefine props to simulate state change (since MessageInput is controlled)
        const props = { ...defaultProps, message: '/he' };
        render(<MessageInput {...props} />);

        expect(screen.getByText('/hello')).toBeInTheDocument();
        expect(screen.queryByText('/bye')).not.toBeInTheDocument();
    });

    it('calls onQuickMessageSelect when a quick message is clicked', () => {
        const props = { ...defaultProps, message: '/he' };
        render(<MessageInput {...props} />);

        fireEvent.click(screen.getByText('/hello'));
        expect(defaultProps.onQuickMessageSelect).toHaveBeenCalledWith(defaultProps.quickMessages[0]);
    });

    it('calls onSendSurvey when survey button is clicked', () => {
        render(<MessageInput {...defaultProps} />);
        const surveyButton = screen.getByTitle('Enviar pesquisa de satisfação');
        fireEvent.click(surveyButton);
        expect(defaultProps.onSendSurvey).toHaveBeenCalled();
    });
});
