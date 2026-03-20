import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';
import { ThemeProvider } from '@/components/ThemeProvider';

export const metadata = {
    title: 'Parallax — Productivity Tracker',
    description: 'See your time from every angle. Track work across companies, projects, and contexts.',
    icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <script
                    dangerouslySetInnerHTML={{
                        __html: `
                            (function() {
                                try {
                                    var t = localStorage.getItem('parallax_theme') || 'dark';
                                    document.documentElement.setAttribute('data-theme', t);
                                } catch(e) {}
                            })();
                        `,
                    }}
                />
            </head>
            <body>
                <ThemeProvider>
                    <AuthProvider>
                        {children}
                    </AuthProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
