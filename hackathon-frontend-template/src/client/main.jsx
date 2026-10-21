import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';

import { ThemeProvider } from '@/shared/components/theme-provider/theme-provider';

import store from './app/store';
import App from './routes/App';
import { Toaster } from './shared/components/ui/sonner';

import './index.css';

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <Provider store={store}>
            <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
                <App />
                <Toaster
                    richColors
                    toastOptions={{
                        className: 'select-none',
                    }}
                />
            </ThemeProvider>
        </Provider>
    </StrictMode>,
);
