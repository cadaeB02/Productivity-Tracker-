'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { useCompany } from '@/components/CompanyContext';
import Icon from '@/components/Icon';

const NAV_ITEMS = [
    { href: '/', label: 'Timer', icon: 'timer' },
    { href: '/projects', label: 'Projects', icon: 'folder' },
    { href: '/schedule', label: 'Schedule', icon: 'calendar' },
    { href: '/compliance', label: 'Compliance', icon: 'shield' },
    { href: '/treasury', label: 'Treasury', icon: 'dollar' },
    { href: '/history', label: 'History', icon: 'clipboard' },
    { href: '/stats', label: 'Stats', icon: 'chart' },
    { href: '/agent', label: 'AI Agent', icon: 'robot' },
    { href: '/settings', label: 'Settings', icon: 'settings' },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { user } = useAuth();
    const { companies, activeCompanyId, activeCompany, setActiveCompanyId, setShowSwitcher } = useCompany();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);

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
                <h1>HoldCo OS</h1>
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
                    <h1>HoldCo OS</h1>
                    <span>Productivity Tracker • V6.0</span>
                </div>

                {/* Company Switcher Dropdown */}
                <div className="sidebar-company-switcher">
                    <button
                        className="company-switcher-btn"
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                    >
                        <div className="company-switcher-current">
                            {activeCompany ? (
                                <>
                                    <span className="color-dot" style={{ backgroundColor: activeCompany.color, width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 }} />
                                    <span className="company-switcher-name">{activeCompany.name}</span>
                                </>
                            ) : (
                                <>
                                    <Icon name="grid" size={12} />
                                    <span className="company-switcher-name">Global View</span>
                                </>
                            )}
                        </div>
                        <Icon name={dropdownOpen ? 'chevron-up' : 'chevron-down'} size={14} />
                    </button>

                    {dropdownOpen && (
                        <div className="company-switcher-dropdown">
                            <div
                                className={`company-switcher-option ${!activeCompanyId ? 'active' : ''}`}
                                onClick={() => { setActiveCompanyId(null); setDropdownOpen(false); }}
                            >
                                <Icon name="grid" size={12} />
                                <span>Global View</span>
                                {!activeCompanyId && <Icon name="check" size={12} />}
                            </div>
                            {companies.map((c) => (
                                <div
                                    key={c.id}
                                    className={`company-switcher-option ${activeCompanyId === c.id ? 'active' : ''}`}
                                    onClick={() => { setActiveCompanyId(c.id); setDropdownOpen(false); }}
                                >
                                    <span className="color-dot" style={{ backgroundColor: c.color, width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 }} />
                                    <span>{c.name}</span>
                                    {activeCompanyId === c.id && <Icon name="check" size={12} />}
                                </div>
                            ))}
                            <div className="company-switcher-divider" />
                            <div
                                className="company-switcher-option switcher-cmd"
                                onClick={() => { setDropdownOpen(false); setShowSwitcher(true); }}
                            >
                                <Icon name="search" size={12} />
                                <span>Quick Switch</span>
                                <kbd className="switcher-kbd-small">⌘K</kbd>
                            </div>
                        </div>
                    )}
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
