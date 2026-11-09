import { useMemo, useRef, useState } from 'react';
import { Avatar, ConfigProvider, theme as antdTheme } from 'antd';
import { Bubble, Prompts, Sender } from '@ant-design/x';
import {
    CircleAlert,
    CircleCheck,
    DownloadIcon,
    SearchIcon,
    UserIcon,
} from 'lucide-react';
import { useSendChatMessageMutation } from '@/app/api/chatApi';

// Dark navy + gold palette taken from the login screen.
const chatTheme = {
    algorithm: antdTheme.darkAlgorithm,
    token: {
        colorPrimary: '#ffeba7',
        colorTextLightSolid: '#102770',
        colorBgBase: '#14161f',
        colorBgLayout: '#14161f',
        colorBgContainer: '#1f2029',
        colorBgElevated: '#262733',
        colorBorder: 'rgba(255, 255, 255, 0.12)',
        colorBorderSecondary: 'rgba(255, 255, 255, 0.08)',
        colorText: '#f4f3f5',
        colorTextSecondary: '#c4c3ca',
        colorTextTertiary: '#9b9aab',
        borderRadius: 10,
        fontFamily: 'inherit',
    },
};

const QUICK_PROMPTS = [
    {
        key: 'xrb-status',
        icon: <SearchIcon size={14} />,
        label: 'What XRB case statuses and types are in the data?',
    },
    {
        key: 'xrb-modules',
        icon: <CircleAlert size={14} />,
        label: 'Which modules have the most XRB cases?',
    },
    {
        key: 'action-items',
        icon: <CircleCheck size={14} />,
        label: 'Summarize the View 2 action items.',
    },
    {
        key: 'solutions',
        icon: <DownloadIcon size={14} />,
        label: 'What solutions exist in the GL-MQR catalogue?',
    },
];

const GREETING =
    'Hi there, I am MOPSOD, your Quality Matrix assistant. Ask me about modules, solutions, action items, submissions, or XRB cases - I answer from the current project data.';

const roleConfig = {
    ai: {
        placement: 'start',
        variant: 'filled',
        avatar: (
            <Avatar
                size={40}
                src="/SOP.jpg"
                alt="MOPSOD"
                style={{ backgroundColor: '#ffeba7', color: '#102770' }}
            />
        ),
        styles: {
            content: {
                background: '#262733',
                color: '#f4f3f5',
                border: '1px solid rgba(255, 255, 255, 0.08)',
            },
        },
    },
    user: {
        placement: 'end',
        variant: 'filled',
        avatar: (
            <Avatar
                size={40}
                style={{
                    backgroundColor: '#102770',
                    color: '#ffeba7',
                    border: '1px solid rgba(255, 235, 167, 0.4)',
                }}
                icon={<UserIcon size={20} />}
            />
        ),
        styles: {
            content: {
                background: '#ffeba7',
                color: '#102770',
                fontWeight: 500,
            },
        },
    },
};

export default function ChatAIPage() {
    const [messages, setMessages] = useState([
        { key: 'greeting', role: 'assistant', content: GREETING },
    ]);
    const [input, setInput] = useState('');
    const [sendChatMessage, { isLoading: loading }] =
        useSendChatMessageMutation();
    const counter = useRef(0);

    const nextKey = () => {
        counter.current += 1;
        return `msg-${counter.current}`;
    };

    const history = useMemo(
        () =>
            messages.map(({ role, content }) => ({
                role: role === 'user' ? 'user' : 'assistant',
                content,
            })),
        [messages],
    );

    const send = async (text) => {
        const value = (typeof text === 'string' ? text : input).trim();
        if (!value || loading) return;

        const priorHistory = history;
        setMessages((prev) => [
            ...prev,
            { key: nextKey(), role: 'user', content: value },
        ]);
        setInput('');

        try {
            const data = await sendChatMessage({
                message: value,
                history: priorHistory,
            }).unwrap();
            setMessages((prev) => [
                ...prev,
                {
                    key: nextKey(),
                    role: 'assistant',
                    content: data.answer || 'No answer returned from the bot.',
                },
            ]);
        } catch (error) {
            setMessages((prev) => [
                ...prev,
                {
                    key: nextKey(),
                    role: 'assistant',
                    content: `Error: ${error?.data?.detail || error?.data || error?.message || 'Chat API failed'}`,
                },
            ]);
        }
    };

    const items = useMemo(() => {
        const list = messages.map(({ key, role, content }) => ({
            key,
            role: role === 'user' ? 'user' : 'ai',
            content,
        }));
        if (loading) {
            list.push({
                key: 'loading',
                role: 'ai',
                content: '',
                loading: true,
            });
        }
        return list;
    }, [messages, loading]);

    return (
        <ConfigProvider theme={chatTheme}>
            <div
                style={{
                    height: 'calc(100vh - 80px)',
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#14161f',
                    borderRadius: 16,
                    overflow: 'hidden',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    boxShadow: '0 18px 45px rgba(9, 12, 24, 0.35)',
                }}
            >
                <header
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '18px 22px',
                        background:
                            'linear-gradient(160deg, #1b2b62 0%, #102770 52%, #0c2056 100%)',
                        borderBottom:
                            '1px solid rgba(255, 235, 167, 0.18)',
                    }}
                >
                    <div
                        style={{
                            width: 72,
                            height: 72,
                            display: 'grid',
                            placeItems: 'center',
                            overflow: 'hidden',
                            flexShrink: 0,
                        }}
                    >
                        <img
                            src="/SOP-bot.gif"
                            alt=""
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                transform: 'scale(1.5)',
                                transformOrigin: '41% 66%',
                            }}
                        />
                    </div>
                    <div>
                        <h2
                            style={{
                                margin: 0,
                                fontSize: 20,
                                fontWeight: 600,
                                color: '#f4f3f5',
                            }}
                        >
                            Ask MOPSOD
                        </h2>
                        <p
                            style={{
                                margin: '4px 0 0',
                                fontSize: 13,
                                color: 'rgba(244, 243, 245, 0.72)',
                            }}
                        >
                            Ask about modules, solutions, action items,
                            submissions, and XRB cases.
                        </p>
                    </div>
                </header>

                <div
                    style={{
                        padding: '12px 18px',
                        borderBottom:
                            '1px solid rgba(255, 255, 255, 0.06)',
                        background: '#171923',
                    }}
                >
                    <Prompts
                        items={QUICK_PROMPTS}
                        wrap
                        onItemClick={({ data }) =>
                            setInput(String(data.label))
                        }
                        styles={{
                            list: { gap: 8 },
                            item: {
                                background: 'rgba(255, 235, 167, 0.06)',
                                border: '1px solid rgba(255, 235, 167, 0.28)',
                                color: '#ffeba7',
                                borderRadius: 999,
                                padding: '6px 14px',
                                fontSize: 13,
                                cursor: 'pointer',
                            },
                        }}
                    />
                </div>

                <Bubble.List
                    autoScroll
                    role={roleConfig}
                    items={items}
                    style={{
                        flex: 1,
                        minHeight: 0,
                        overflowY: 'auto',
                        padding: '20px 22px',
                    }}
                />

                <div
                    style={{
                        padding: '14px 22px 10px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                        background: '#1b1c26',
                    }}
                >
                    <Sender
                        value={input}
                        onChange={setInput}
                        onSubmit={send}
                        loading={loading}
                        placeholder="Type a message. Press Enter to send, Shift + Enter for a new line."
                        autoSize={{ minRows: 1, maxRows: 6 }}
                    />
                    <p
                        style={{
                            margin: '8px 2px 0',
                            fontSize: 12,
                            color: '#9b9aab',
                        }}
                    >
                        Answers come from the current project data files and
                        may lag a few minutes.
                    </p>
                </div>
            </div>
        </ConfigProvider>
    );
}
