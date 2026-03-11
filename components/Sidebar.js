'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import Icon from '@/components/Icon';

const NAV_ITEMS = [
    { href: '/', label: 'Timer', icon: 'timer' },
    { href: '/projects', label: 'Projects', icon: 'folder' },
    { href: '/history', label: 'History', icon: 'clipboard' },
    { href: '/stats', label: 'Stats', icon: 'chart' },
    { href: '/agent', label: 'AI Agent', icon: 'robot' },
    { href: '/settings', label: 'Settings', icon: 'settings' },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { user } = useAuth();
    const [mobileOpen, setMobileOpen] = useState(false);

    const handleLogout = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        window.location.href = '/login';
    };

    const initials = user?.email
        ? user.email.substring(0, 2).toUpperCase()
        : '??';

    return (
        <>
            {/* Mobile header */}
            <div className="mobile-header">
                <h1>FocusArch</h1>
                <button
                    className="mobile-menu-btn"
                    onClick={() => setMobileOpen(!mobileOpen)}
                    aria-label="Toggle menu"
                >
                    {mobileOpen ? <Icon name="close" size={22} /> : <Icon name="menu" size={22} />}
                </button>
            </div>

            {/* Mobile overlay */}
            <div
                className={`sidebar-overlay ${mobileOpen ? 'open' : ''}`}
                onClick={() => setMobileOpen(false)}
            />

            {/* Sidebar */}
            <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
                <div className="sidebar-logo">
                    <h1>FocusArch</h1>
                    <span>Productivity Tracker • V3.0</span>
                </div>

                <nav className="sidebar-nav">
                    {NAV_ITEMS.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`nav-link ${pathname === item.href ? 'active' : ''}`}
                            onClick={() => setMobileOpen(false)}
                        >
                            <span className="nav-icon"><Icon name={item.icon} size={18} /></span>
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div className="sidebar-user">
                        <div className="sidebar-user-avatar">{initials}</div>
                        <span className="sidebar-user-email">{user?.email || 'Loading...'}</span>
                    </div>
                    <button className="logout-btn" onClick={handleLogout}>
                        Sign Out
                    </button>
                </div>
            </aside>
        </>
    );
}
