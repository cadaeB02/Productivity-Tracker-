import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';

export const metadata = {
    title: 'Parallax — Productivity Tracker',
    description: 'See your time from every angle. Track work across companies, projects, and contexts.',
    icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body>
                <AuthProvider>
                    {children}
                </AuthProvider>
            </body>
        </html>
    );
}
