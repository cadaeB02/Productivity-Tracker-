'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/Icon';

const PRIMARY_TABS = [
    { href: '/', label: 'Timer', icon: 'timer' },
    { href: '/dashboard', label: 'Dashboard', icon: 'brain' },
    { href: '/treasury', label: 'Treasury', icon: 'dollar' },
    { href: '/agent', label: 'Agent', icon: 'robot' },
    { href: '#more', label: 'More', icon: 'menu' },
];

const MORE_ITEMS = [
    { href: '/projects', label: 'Projects', icon: 'folder' },
    { href: '/compliance', label: 'Compliance', icon: 'shield' },
    { href: '/filing', label: 'Filing', icon: 'folder' },
    { href: '/notes', label: 'Notes', icon: 'note' },
    { href: '/history', label: 'History', icon: 'clipboard' },
    { href: '/stats', label: 'Stats', icon: 'chart' },
    { href: '/sleep', label: 'Sleep', icon: 'moon' },
    { href: '/schedule', label: 'Schedule', icon: 'clock' },
    { href: '/settings', label: 'Settings', icon: 'settings' },
];

export default function BottomTabBar() {
    const pathname = usePathname();
    const [showMore, setShowMore] = useState(false);
    const sheetRef = useRef(null);

    // Check if current path is in the "more" section
    const isMoreRoute = MORE_ITEMS.some(item => pathname === item.href || pathname.startsWith(item.href + '/'));

    const isActiveTab = (href) => {
        if (href === '#more') return isMoreRoute;
        if (href === '/') return pathname === '/';
        return pathname === href || pathname.startsWith(href + '/');
    };

    // Close sheet on route change
    useEffect(() => {
        setShowMore(false);
    }, [pathname]);

    // Close sheet on outside click
    useEffect(() => {
        if (!showMore) return;
        const handleClick = (e) => {
            if (sheetRef.current && !sheetRef.current.contains(e.target)) {
                setShowMore(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        document.addEventListener('touchstart', handleClick);
        return () => {
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('touchstart', handleClick);
        };
    }, [showMore]);

    // Haptic feedback helper
    const triggerHaptic = () => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(10);
        }
    };

    const handleTabClick = (e, href) => {
        triggerHaptic();
        if (href === '#more') {
            e.preventDefault();
            setShowMore(!showMore);
        }
    };

    return (
        <>
            {/* More sheet backdrop */}
            <div
                className={`tab-sheet-backdrop ${showMore ? 'open' : ''}`}
                onClick={() => setShowMore(false)}
            />

            {/* More sheet */}
            <div
                ref={sheetRef}
                className={`tab-more-sheet ${showMore ? 'open' : ''}`}
            >
                <div className="tab-sheet-handle" />
                <div className="tab-sheet-title">More</div>
                <div className="tab-sheet-grid">
                    {MORE_ITEMS.map((item) => {
                        const active = pathname === item.href || pathname.startsWith(item.href + '/');
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`tab-sheet-item ${active ? 'active' : ''}`}
                                onClick={() => {
                                    triggerHaptic();
                                    setShowMore(false);
                                }}
                            >
                                <div className="tab-sheet-item-icon">
                                    <Icon name={item.icon} size={22} />
                                </div>
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </div>
            </div>

            {/* Tab bar */}
            <nav className="bottom-tab-bar">
                {PRIMARY_TABS.map((tab) => {
                    const active = isActiveTab(tab.href);
                    const isMore = tab.href === '#more';
                    const TabEl = isMore ? 'button' : Link;
                    const tabProps = isMore
                        ? { type: 'button', onClick: (e) => handleTabClick(e, tab.href) }
                        : { href: tab.href, onClick: (e) => handleTabClick(e, tab.href) };

                    return (
                        <TabEl
                            key={tab.href}
                            className={`tab-item ${active ? 'active' : ''} ${isMore && showMore ? 'sheet-open' : ''}`}
                            {...tabProps}
                        >
                            <div className="tab-icon-wrap">
                                {active && <div className="tab-active-pill" />}
                                <Icon name={tab.icon} size={22} />
                            </div>
                            <span className="tab-label">{tab.label}</span>
                        </TabEl>
                    );
                })}
            </nav>
        </>
    );
}
