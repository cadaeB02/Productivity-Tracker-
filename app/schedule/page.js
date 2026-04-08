'use client';

import { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/Icon';
import { useAuth } from '@/components/AuthProvider';

export default function SchedulePage() {
    const { user } = useAuth();
    
    // Core Layout State
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [viewMode, setViewMode] = useState('today'); // 'inbox', 'today', 'upcoming'
    const [horizonDays, setHorizonDays] = useState(1); // 1, 3, 5, 7

    // Current Date Context
    const today = new Date();
    const [currentDate, setCurrentDate] = useState(today);

    // Toggle logic for small screens
    const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

    return (
        <AppLayout hideGlobalSidebar={false}>
            <div className="schedule-workspace">
                
                {/* ==================================================== */}
                {/* TODOIST-STYLE INNER SIDEBAR */}
                {/* ==================================================== */}
                <div className={`schedule-sidebar ${!sidebarOpen ? 'closed' : ''}`}>
                    <div className="sidebar-header">
                        <button className="btn-icon" onClick={toggleSidebar} title="Collapse Sidebar">
                            <Icon name="menu" size={16} />
                        </button>
                        <span className="sidebar-title">SDLX Schedule</span>
                    </div>

                    <div className="sidebar-primary-action">
                        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'flex-start', padding: '10px 16px', borderRadius: '10px', fontWeight: 600 }}>
                            <Icon name="plus" size={16} /> Add Task
                        </button>
                    </div>

                    <div className="sidebar-nav-section">
                        <button className={`nav-item ${viewMode === 'inbox' ? 'active' : ''}`} onClick={() => setViewMode('inbox')}>
                            <Icon name="inbox" size={16} /> Inbox
                            <span className="badge">5</span>
                        </button>
                        <button className={`nav-item ${viewMode === 'today' ? 'active' : ''}`} onClick={() => setViewMode('today')}>
                            <Icon name="calendar" size={16} /> Today
                            <span className="badge today-badge">12</span>
                        </button>
                        <button className={`nav-item ${viewMode === 'upcoming' ? 'active' : ''}`} onClick={() => setViewMode('upcoming')}>
                            <Icon name="calendar" size={16} /> Upcoming
                        </button>
                        <button className="nav-item">
                            <Icon name="search" size={16} /> Search & Filters
                        </button>
                    </div>

                    <div className="sidebar-nav-section">
                        <div className="section-title">My Projects</div>
                        <button className="nav-item project-item">
                            <span className="color-dot" style={{ backgroundColor: '#22c55e' }}></span> PocketGC
                        </button>
                        <button className="nav-item project-item">
                            <span className="color-dot" style={{ backgroundColor: '#3b82f6' }}></span> Digital Mechanic
                        </button>
                        <div className="section-title" style={{ marginTop: '16px' }}>Team Projects</div>
                        <button className="nav-item project-item">
                            <span className="color-dot" style={{ backgroundColor: '#f59e0b' }}></span> Antigravity Build
                        </button>
                    </div>

                    {/* Expandable Mini Calendar Placeholder */}
                    <div className="sidebar-mini-calendar">
                        <div className="section-title">Calendar</div>
                        <div className="mini-calendar-placeholder">
                            [Mini Month Calendar]
                        </div>
                    </div>
                </div>


                {/* ==================================================== */}
                {/* AKIFLOW-STYLE MAIN TIMELINE */}
                {/* ==================================================== */}
                <div className="schedule-main">
                    
                    {/* Header Bar */}
                    <div className="timeline-header-bar">
                        {!sidebarOpen && (
                            <button className="btn-icon" onClick={toggleSidebar}>
                                <Icon name="menu" size={16} />
                            </button>
                        )}
                        <div className="date-display">
                            <h2>Today</h2>
                            <span>{currentDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric'})}</span>
                        </div>
                        
                        <div className="view-controls">
                            <div className="horizon-toggle">
                                {[1, 3, 5, 7].map(days => (
                                    <button 
                                        key={days}
                                        className={`horizon-btn ${horizonDays === days ? 'active' : ''}`}
                                        onClick={() => setHorizonDays(days)}
                                    >
                                        {days}D
                                    </button>
                                ))}
                            </div>
                            <button className="btn btn-ghost btn-sm">
                                <Icon name="eye" size={14} /> Show Sessions
                            </button>
                            <button className="btn-icon">
                                <Icon name="more-horizontal" size={16} />
                            </button>
                        </div>
                    </div>

                    {/* The Timelines Container */}
                    <div className="timeline-grid-container">
                        {/* 
                            For each day in horizonDays, render a column.
                            Here we mock a 1-day view exactly.
                        */}
                        <div className="timeline-day-column">
                            {/* Day Header (Tasks Inbox for this day) */}
                            <div className="day-header-inbox">
                                <div className="day-stats">
                                    <span className="stat-badge small">3 Small</span>
                                    <span className="stat-badge medium">2 Med</span>
                                    <span className="stat-badge large">1 Lg</span>
                                </div>
                                <div className="dateless-tasks-row">
                                    <div className="dateless-task">
                                        <div className="checkbox"></div>
                                        <span>Call Jon</span>
                                    </div>
                                    <div className="dateless-task">
                                        <div className="checkbox"></div>
                                        <span>Review Taxes</span>
                                    </div>
                                </div>
                            </div>

                            {/* Vertical Time Blocks */}
                            <div className="time-blocks-grid">
                                {Array.from({ length: 15 }).map((_, i) => {
                                    const hour = i + 7; // 7am to 9pm
                                    const formattedHour = hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`;
                                    return (
                                        <div key={i} className="time-row">
                                            <div className="time-label">{formattedHour}</div>
                                            <div className="time-slot">
                                                {/* Grid lines & absolute positioned blocks go here */}
                                            </div>
                                        </div>
                                    );
                                })}
                                
                                {/* Placeholder Blocks for visualization */}
                                <div className="mock-block" style={{ top: '80px', height: '120px', backgroundColor: 'rgba(59, 130, 246, 0.2)', borderLeft: '3px solid #3b82f6' }}>
                                    <span className="time">8:00 AM - 10:00 AM</span>
                                    <strong>Deep Work: App Layout</strong>
                                </div>
                                <div className="mock-block apple-cal" style={{ top: '240px', height: '60px' }}>
                                    <span className="time">11:00 AM</span>
                                    <strong>Team Sync (Apple Cal)</strong>
                                </div>
                                <div className="mock-block" style={{ top: '380px', height: '180px', backgroundColor: 'rgba(34, 197, 94, 0.2)', borderLeft: '3px solid #22c55e' }}>
                                    <span className="time">1:20 PM - 4:20 PM</span>
                                    <strong>Golden Bike Shop Shift</strong>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Scoped CSS for the new layout shell to keep it clean */}
            <style jsx>{`
                .schedule-workspace {
                    display: flex;
                    height: calc(100vh - 64px); /* assuming top bar */
                    background-color: var(--bg-primary);
                    color: var(--text-primary);
                    overflow: hidden;
                    font-family: 'Inter', -apple-system, sans-serif;
                }

                /* SIDEBAR */
                .schedule-sidebar {
                    width: 260px;
                    background-color: var(--bg-secondary);
                    border-right: 1px solid var(--border-color);
                    display: flex;
                    flex-direction: column;
                    transition: width 0.3s ease;
                    overflow-y: auto;
                }
                .schedule-sidebar.closed {
                    width: 0;
                    border: none;
                    overflow: hidden;
                }
                .sidebar-header {
                    display: flex;
                    align-items: center;
                    padding: 16px;
                    gap: 12px;
                }
                .sidebar-title {
                    font-weight: 700;
                    font-size: 1.1rem;
                    letter-spacing: -0.01em;
                }
                .sidebar-primary-action {
                    padding: 0 16px 16px;
                }
                
                .sidebar-nav-section {
                    padding: 0 8px 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .nav-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 8px 12px;
                    background: transparent;
                    border: none;
                    color: var(--text-secondary);
                    font-size: 0.9rem;
                    font-weight: 500;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.15s;
                    text-align: left;
                }
                .nav-item:hover {
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                }
                .nav-item.active {
                    background: rgba(99, 102, 241, 0.1);
                    color: var(--accent);
                    font-weight: 600;
                }
                .badge {
                    margin-left: auto;
                    background: var(--bg-tertiary);
                    color: var(--text-muted);
                    font-size: 0.75rem;
                    padding: 2px 6px;
                    border-radius: 12px;
                    font-weight: 600;
                }
                .today-badge {
                    background: var(--accent);
                    color: #fff;
                }
                
                .section-title {
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--text-muted);
                    font-weight: 700;
                    padding: 8px 12px 4px;
                }
                .project-item {
                    padding: 6px 12px;
                }
                .color-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                }
                .sidebar-mini-calendar {
                    padding: 0 8px 16px;
                    margin-top: auto;
                }
                .mini-calendar-placeholder {
                    background: var(--bg-tertiary);
                    border-radius: 8px;
                    padding: 24px;
                    text-align: center;
                    color: var(--text-muted);
                    font-size: 0.85rem;
                    margin: 0 8px;
                }

                /* MAIN AKIFLOW AREA */
                .schedule-main {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                    background-color: var(--bg-primary);
                }
                
                .timeline-header-bar {
                    display: flex;
                    align-items: center;
                    padding: 16px 24px;
                    border-bottom: 1px solid var(--border-color);
                    gap: 16px;
                }
                .date-display h2 {
                    margin: 0;
                    font-size: 1.25rem;
                    font-weight: 700;
                }
                .date-display span {
                    font-size: 0.85rem;
                    color: var(--text-muted);
                }
                .view-controls {
                    margin-left: auto;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .horizon-toggle {
                    display: flex;
                    background: var(--bg-secondary);
                    border-radius: 8px;
                    padding: 2px;
                }
                .horizon-btn {
                    background: transparent;
                    border: none;
                    color: var(--text-secondary);
                    font-size: 0.8rem;
                    font-weight: 600;
                    padding: 4px 12px;
                    border-radius: 6px;
                    cursor: pointer;
                }
                .horizon-btn.active {
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }

                .timeline-grid-container {
                    flex: 1;
                    overflow-y: auto;
                    display: flex;
                    padding: 0 24px;
                }
                .timeline-day-column {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    min-width: 300px;
                    border-right: 1px solid var(--border-color);
                }
                .timeline-day-column:last-child {
                    border-right: none;
                }

                /* DAY INBOX HEADER */
                .day-header-inbox {
                    padding: 16px 0;
                    border-bottom: 1px solid var(--border-color);
                    background: var(--bg-primary);
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }
                .day-stats {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 12px;
                }
                .stat-badge {
                    font-size: 0.7rem;
                    font-weight: 600;
                    padding: 2px 8px;
                    border-radius: 12px;
                }
                .stat-badge.small { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
                .stat-badge.medium { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
                .stat-badge.large { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
                
                .dateless-tasks-row {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .dateless-task {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    background: var(--bg-secondary);
                    padding: 8px 12px;
                    border-radius: 8px;
                    font-size: 0.9rem;
                    border: 1px solid var(--border-color);
                    cursor: grab;
                }
                .checkbox {
                    width: 16px;
                    height: 16px;
                    border: 2px solid var(--text-muted);
                    border-radius: 4px;
                }

                /* VERTICAL TIMELINE */
                .time-blocks-grid {
                    position: relative;
                    padding-bottom: 40px;
                }
                .time-row {
                    display: flex;
                    height: 60px; /* 1 hour = 60px */
                }
                .time-label {
                    width: 60px;
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    text-align: right;
                    padding-right: 12px;
                    position: relative;
                    top: -8px; /* Center align with border */
                }
                .time-slot {
                    flex: 1;
                    border-top: 1px solid var(--border-color);
                }

                /* MOCK ABSOLUTE BLOCKS */
                .mock-block {
                    position: absolute;
                    left: 60px; /* align with slot */
                    right: 16px;
                    border-radius: 6px;
                    padding: 6px 10px;
                    display: flex;
                    flex-direction: column;
                    font-size: 0.85rem;
                    overflow: hidden;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.05);
                }
                .mock-block .time {
                    font-size: 0.7rem;
                    opacity: 0.8;
                    margin-bottom: 2px;
                }
                .mock-block.apple-cal {
                    background-color: var(--bg-tertiary);
                    border-left: 3px solid var(--text-muted);
                    color: var(--text-secondary);
                }
            `}</style>
        </AppLayout>
    );
}
