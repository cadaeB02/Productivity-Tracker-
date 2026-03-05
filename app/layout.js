import './globals.css';

export const metadata = {
    title: 'FocusArch — Productivity Tracker',
    description: 'Track your work sessions, manage projects, and get AI-powered productivity insights.',
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
