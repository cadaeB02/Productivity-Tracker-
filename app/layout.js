import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';

export const metadata = {
    title: 'FocusArch — Productivity Tracker',
    description: 'Track your work sessions and boost productivity',
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
