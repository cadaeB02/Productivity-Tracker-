'use client';

import { useState, useEffect, useRef } from 'react';
import { useCompany } from '@/components/CompanyContext';
import Icon from '@/components/Icon';

export default function CompanySwitcher() {
    const { companies, activeCompanyId, setActiveCompanyId, showSwitcher, setShowSwitcher } = useCompany();
    const [search, setSearch] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef(null);

    // Build options list: Global + all companies
    const allOptions = [
        { id: null, name: 'Global View', color: null, isGlobal: true },
        ...companies.map((c, i) => ({ ...c, shortcut: i + 1 })),
    ];

    const filtered = search
        ? allOptions.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
        : allOptions;

    // Reset state when opening
    useEffect(() => {
        if (showSwitcher) {
            setSearch('');
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [showSwitcher]);

    // Keep selected index in bounds
    useEffect(() => {
        if (selectedIndex >= filtered.length) {
            setSelectedIndex(Math.max(0, filtered.length - 1));
        }
    }, [filtered.length, selectedIndex]);

    const handleSelect = (option) => {
        setActiveCompanyId(option.id);
        setShowSwitcher(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filtered[selectedIndex]) {
                handleSelect(filtered[selectedIndex]);
            }
        } else if (e.key === 'Escape') {
            setShowSwitcher(false);
        }
    };

    if (!showSwitcher) return null;

    return (
        <>
            {/* Backdrop */}
            <div className="switcher-backdrop" onClick={() => setShowSwitcher(false)} />

            {/* Switcher panel */}
            <div className="switcher-panel">
                <div className="switcher-header">
                    <Icon name="search" size={16} />
                    <input
                        ref={inputRef}
                        className="switcher-input"
                        type="text"
                        placeholder="Switch company..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setSelectedIndex(0); }}
                        onKeyDown={handleKeyDown}
                        autoFocus
                    />
                    <kbd className="switcher-kbd">ESC</kbd>
                </div>

                <div className="switcher-list">
                    {filtered.map((option, i) => {
                        const isActive = option.id === activeCompanyId;
                        const isSelected = i === selectedIndex;

                        return (
                            <div
                                key={option.id || 'global'}
                                className={`switcher-item ${isSelected ? 'selected' : ''} ${isActive ? 'active' : ''}`}
                                onClick={() => handleSelect(option)}
                                onMouseEnter={() => setSelectedIndex(i)}
                            >
                                <div className="switcher-item-left">
                                    {option.isGlobal ? (
                                        <span className="switcher-icon-global">
                                            <Icon name="grid" size={14} />
                                        </span>
                                    ) : (
                                        <span
                                            className="switcher-dot"
                                            style={{ backgroundColor: option.color }}
                                        />
                                    )}
                                    <span className="switcher-item-name">{option.name}</span>
                                    {option.company_type === 'physical' && (
                                        <span className="badge badge-physical" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>Physical</span>
                                    )}
                                </div>
                                <div className="switcher-item-right">
                                    {isActive && <Icon name="check" size={14} />}
                                    {option.shortcut && (
                                        <kbd className="switcher-kbd-small">⌘{option.shortcut}</kbd>
                                    )}
                                    {option.isGlobal && (
                                        <kbd className="switcher-kbd-small">⌘0</kbd>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {filtered.length === 0 && (
                        <div className="switcher-empty">No companies match "{search}"</div>
                    )}
                </div>

                <div className="switcher-footer">
                    <span><kbd className="switcher-kbd-small">↑↓</kbd> navigate</span>
                    <span><kbd className="switcher-kbd-small">↵</kbd> select</span>
                    <span><kbd className="switcher-kbd-small">esc</kbd> close</span>
                </div>
            </div>
        </>
    );
}
