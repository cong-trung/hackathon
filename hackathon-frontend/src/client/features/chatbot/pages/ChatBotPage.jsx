import { useMemo, useRef, useState } from 'react';
import { SendIcon, BotIcon, UserIcon, Loader2Icon } from 'lucide-react';
import { useSendChatMessageMutation } from '@/app/api/chatApi';

function ChatBubble({ role, content }) {
    const isUser = role === 'user';

    return (
        <div
            style={{
                display: 'flex',
                justifyContent: isUser ? 'flex-end' : 'flex-start',
                marginBottom: 12,
            }}
        >
            <div
                style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    maxWidth: '78%',
                    flexDirection: isUser ? 'row-reverse' : 'row',
                }}
            >
                <div
                    style={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isUser ? '#2563eb' : '#16a34a',
                        color: '#fff',
                        flexShrink: 0,
                    }}
                >
                    {isUser ? <UserIcon size={18} /> : <BotIcon size={18} />}
                </div>

                <div
                    style={{
                        padding: '12px 14px',
                        borderRadius: 14,
                        background: isUser ? '#2563eb' : '#f3f4f6',
                        color: isUser ? '#fff' : '#111827',
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.5,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    }}
                >
                    {content}
                </div>
            </div>
        </div>
    );
}

export default function ChatAIPage() {
    const [messages, setMessages] = useState([
        {
            role: 'assistant',
            content:
                'Hi there, I am your Quality Matrix AI assistant. Ask me about XRB solutions, corrective actions, disposition, product basis, or module issues.',
        },
    ]);

    const [input, setInput] = useState('');
    const [sendChatMessage, { isLoading: loading }] = useSendChatMessageMutation();
    const textareaRef = useRef(null);

    const history = useMemo(
        () =>
            messages
                .filter(
                    (msg) => msg.role === 'user' || msg.role === 'assistant',
                )
                .map((msg) => ({
                    role: msg.role,
                    content: msg.content,
                })),
        [messages],
    );

    const sendMessage = async () => {
        const text = input.trim();

        if (!text || loading) return;

        const userMessage = { role: 'user', content: text };
        setMessages((prev) => [...prev, userMessage]);
        setInput('');

        try {
            const data = await sendChatMessage({ message: text, history }).unwrap();
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: data.answer || 'No answer returned from bot.',
                },
            ]);
        } catch (error) {
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: `Error: ${error?.data?.detail || error?.data || error?.message || 'Chat API failed'}`,
                },
            ]);
        } finally {
            setTimeout(() => {
                textareaRef.current?.focus();
            }, 0);
        }
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    };

    const quickPrompts = [
        'What are common solutions and dispositions used in XRB cases?',
        'Summarize corrective actions for stain on substrate issues.',
        'What are typical lot dispositions in the XRB file?',
        'Which XRB cases do not require corrective action and why?',
    ];

    return (
        <div
            style={{
                height: 'calc(100vh - 80px)',
                display: 'flex',
                flexDirection: 'column',
                background: '#ffffff',
                borderRadius: 16,
                overflow: 'hidden',
                border: '1px solid #e5e7eb',
            }}
        >
            <div
                style={{
                    padding: '18px 22px',
                    borderBottom: '1px solid #e5e7eb',
                    background:
                        'linear-gradient(90deg, #eff6ff 0%, #f8fafc 100%)',
                }}
            >
                <h2 style={{ margin: 0, fontSize: 22, color: '#111827' }}>
                    AI Chat
                </h2>

                <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
                    Ask the chatbot about XRB solutions, corrective actions,
                    root causes, and lot disposition.
                </p>
            </div>

            <div
                style={{
                    padding: '14px 18px',
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    borderBottom: '1px solid #f1f5f9',
                    background: '#ffffff',
                }}
            >
                {quickPrompts.map((prompt) => (
                    <button
                        key={prompt}
                        type="button"
                        onClick={() => setInput(prompt)}
                        style={{
                            border: '1px solid #dbeafe',
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            padding: '8px 10px',
                            borderRadius: 999,
                            cursor: 'pointer',
                            fontSize: 13,
                        }}
                    >
                        {prompt}
                    </button>
                ))}
            </div>

            <div
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: 22,
                    background: '#fafafa',
                }}
            >
                {messages.map((msg, index) => (
                    <ChatBubble
                        key={`${msg.role}-${index}`}
                        role={msg.role}
                        content={msg.content}
                    />
                ))}

                {loading && (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            color: '#6b7280',
                            marginTop: 8,
                        }}
                    >
                        <Loader2Icon size={18} className="spin" />
                        Bot is thinking...
                    </div>
                )}
            </div>

            <div
                style={{
                    padding: 16,
                    borderTop: '1px solid #e5e7eb',
                    background: '#ffffff',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'flex-end',
                    }}
                >
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a message. Press Enter to send, Shift + Enter for new line."
                        rows={2}
                        style={{
                            flex: 1,
                            resize: 'none',
                            border: '1px solid #d1d5db',
                            borderRadius: 12,
                            padding: '12px 14px',
                            outline: 'none',
                            fontSize: 14,
                            lineHeight: 1.5,
                        }}
                    />

                    <button
                        type="button"
                        onClick={sendMessage}
                        disabled={loading || !input.trim()}
                        style={{
                            width: 46,
                            height: 46,
                            borderRadius: 12,
                            border: 'none',
                            background:
                                loading || !input.trim()
                                    ? '#9ca3af'
                                    : '#2563eb',
                            color: '#ffffff',
                            cursor:
                                loading || !input.trim()
                                    ? 'not-allowed'
                                    : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {loading ? (
                            <Loader2Icon size={20} />
                        ) : (
                            <SendIcon size={20} />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
