'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getCompanies } from '@/lib/store';

const CompanyContext = createContext(null);

export function CompanyProvider({ children }) {
    const [companies, setCompanies] = useState([]);
    const [activeCompanyId, setActiveCompanyIdState] = useState(null); // null = Global
    const [showSwitcher, setShowSwitcher] = useState(false);
    const [loaded, setLoaded] = useState(false);

    // Load companies
    const refreshCompanies = useCallback(async () => {
        try {
            const c = await getCompanies();
            c.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
            setCompanies(c);
        } catch (err) {
            // Not authenticated yet - ignore
        }
        setLoaded(true);
    }, []);

    useEffect(() => {
        refreshCompanies();
    }, [refreshCompanies]);

    // Persist to localStorage
    const setActiveCompanyId = useCallback((id) => {
        setActiveCompanyIdState(id);
        if (typeof window !== 'undefined') {
            if (id) {
                localStorage.setItem('parallax_active_company', id);
            } else {
                localStorage.removeItem('parallax_active_company');
            }
        }
    }, []);

    // Restore from localStorage on mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('parallax_active_company');
            if (saved) setActiveCompanyIdState(saved);
        }
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Cmd+K - toggle quick switcher
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setShowSwitcher((prev) => !prev);
                return;
            }

            // Cmd+0 - Global view
            if ((e.metaKey || e.ctrlKey) && e.key === '0') {
                e.preventDefault();
                setActiveCompanyId(null);
                return;
            }

            // Cmd+1-9 - switch to company by index
            if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
                e.preventDefault();
                const index = parseInt(e.key) - 1;
                if (index < companies.length) {
                    setActiveCompanyId(companies[index].id);
                }
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [companies, setActiveCompanyId]);

    const activeCompany = companies.find((c) => c.id === activeCompanyId) || null;

    return (
        <CompanyContext.Provider
            value={{
                companies,
                activeCompanyId,
                activeCompany,
                setActiveCompanyId,
                showSwitcher,
                setShowSwitcher,
                refreshCompanies,
                loaded,
            }}
        >
            {children}
        </CompanyContext.Provider>
    );
}

export function useCompany() {
    const ctx = useContext(CompanyContext);
    if (!ctx) throw new Error('useCompany must be used within CompanyProvider');
    return ctx;
}
