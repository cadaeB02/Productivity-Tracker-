'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import Sidebar from '@/components/Sidebar';
import BottomTabBar from '@/components/BottomTabBar';

const PUBLIC_ROUTES = ['/login', '/signup'];

export default function PersistentLayout({ children }) {
    const pathname = usePathname();
    const { user, loading } = useAuth();

    const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

    // Public pages — no sidebar, no tab bar
    if (isPublicRoute) {
        return <>{children}</>;
    }

    // Auth loading — show sidebar + spinner (sidebar stays mounted)
    if (loading) {
        return (
            <div className="app-layout">
                <Sidebar />
                <main className="main-content">
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                        <div className="loading-spinner" />
                    </div>
                </main>
                <BottomTabBar />
            </div>
        );
    }

    // Not logged in — redirect
    if (!user) {
        if (typeof window !== 'undefined') {
            window.location.href = '/login';
        }
        return null;
    }

    // Authenticated — sidebar (desktop) + tab bar (mobile)
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                {children}
            </main>
            <BottomTabBar />
        </div>
    );
}
