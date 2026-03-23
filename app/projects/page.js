'use client';

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/Icon';
import {
    getCompanies,
    getProjects,
    getTasks,
    addCompany,
    addProject,
    addTask,
    updateCompany,
    updateProject,
    updateTask,
    deleteCompany,
    deleteProject,
    deleteTask,
    getAutoClockRules,
    addAutoClockRule,
    deleteAutoClockRule,
} from '@/lib/store';
import { COMPANY_COLORS } from '@/lib/utils';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ProjectsPage() {
    const [companies, setCompanies] = useState([]);
    const [projectsByCompany, setProjectsByCompany] = useState({});
    const [tasksByProject, setTasksByProject] = useState({});
    const [expanded, setExpanded] = useState({});
    const [loading, setLoading] = useState(true);
    const [autoClockRules, setAutoClockRules] = useState([]);

    // New company states
    const [newCompanyName, setNewCompanyName] = useState('');
    const [newCompanyColor, setNewCompanyColor] = useState(COMPANY_COLORS[0]);
    const [showNewCompany, setShowNewCompany] = useState(false);
    const [newCompanyType, setNewCompanyType] = useState('digital');
    const [newPayRate, setNewPayRate] = useState('');
    const [newPayType, setNewPayType] = useState('hourly');
    const [newPayPeriod, setNewPayPeriod] = useState('biweekly');
    const [newPayPeriodStart, setNewPayPeriodStart] = useState('');
    const [newTaxFederal, setNewTaxFederal] = useState('12');
    const [newTaxState, setNewTaxState] = useState('4.4');
    const [newTaxFica, setNewTaxFica] = useState('7.65');
    const [newTaxDeductions, setNewTaxDeductions] = useState('0');

    // Inline add states
    const [newProjectName, setNewProjectName] = useState({});
    const [newTaskName, setNewTaskName] = useState({});

    // Edit states
    const [editingCompany, setEditingCompany] = useState(null);
    const [editCompanyName, setEditCompanyName] = useState('');
    const [editingProject, setEditingProject] = useState(null);
    const [editProjectName, setEditProjectName] = useState('');
    const [editingTask, setEditingTask] = useState(null);
    const [editTaskName, setEditTaskName] = useState('');
    const [editingPayConfig, setEditingPayConfig] = useState(null);
    const [editPayFields, setEditPayFields] = useState({});

    // Auto-clock setup
    const [showAutoClockSetup, setShowAutoClockSetup] = useState(null);
    const [autoClockDay, setAutoClockDay] = useState(1);
    const [autoClockTime, setAutoClockTime] = useState('09:25');
    const [autoClockProjectId, setAutoClockProjectId] = useState('');
    const [autoClockTaskId, setAutoClockTaskId] = useState('');

    // Drag state
    const [draggedCompany, setDraggedCompany] = useState(null);
    const [dragOverCompany, setDragOverCompany] = useState(null);

    const loadData = useCallback(async () => {
        try {
            const [c, rules] = await Promise.all([
                getCompanies(),
                getAutoClockRules(),
            ]);

            // Sort by display_order then by name
            c.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
            setCompanies(c);
            setAutoClockRules(rules);

            const pMap = {};
            const tMap = {};
            for (const company of c) {
                const p = await getProjects(company.id);
                pMap[company.id] = p;
                for (const project of p) {
                    const t = await getTasks(project.id);
                    tMap[project.id] = t;
                }
            }
            setProjectsByCompany(pMap);
            setTasksByProject(tMap);
        } catch (err) {
            console.error('Failed to load projects', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const toggleExpanded = (id) => {
        setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    const resetNewCompanyForm = () => {
        setNewCompanyName('');
        setNewCompanyColor(COMPANY_COLORS[0]);
        setNewCompanyType('digital');
        setNewPayRate('');
        setNewPayType('hourly');
        setNewPayPeriod('biweekly');
        setNewPayPeriodStart('');
        setNewTaxFederal('12');
        setNewTaxState('4.4');
        setNewTaxFica('7.65');
        setNewTaxDeductions('0');
        setShowNewCompany(false);
    };

    const handleAddCompany = async () => {
        if (!newCompanyName.trim()) return;
        const r = (v) => Math.round(parseFloat(v) * 100) / 100;
        const config = {
            company_type: newCompanyType,
            pay_rate: newPayRate ? r(newPayRate) : null,
            pay_type: newPayType,
            pay_period: newPayPeriod,
            pay_period_start: newPayPeriodStart || null,
            tax_federal_rate: r(newTaxFederal) || 12,
            tax_state_rate: r(newTaxState) || 4.4,
            tax_fica_rate: r(newTaxFica) || 7.65,
            tax_deductions_pretax: r(newTaxDeductions) || 0,
        };
        await addCompany(newCompanyName.trim(), newCompanyColor, config);
        resetNewCompanyForm();
        loadData();
    };

    const handleAddProject = async (companyId) => {
        const name = newProjectName[companyId];
        if (!name?.trim()) return;
        await addProject(companyId, name.trim());
        setNewProjectName((prev) => ({ ...prev, [companyId]: '' }));
        loadData();
    };

    const handleAddTask = async (projectId, companyId) => {
        const name = newTaskName[projectId];
        if (!name?.trim()) return;
        await addTask(projectId, companyId, name.trim());
        setNewTaskName((prev) => ({ ...prev, [projectId]: '' }));
        loadData();
    };

    const handleEditCompany = async (id) => {
        if (!editCompanyName.trim()) return;
        await updateCompany(id, { name: editCompanyName.trim() });
        setEditingCompany(null);
        loadData();
    };

    const handleOpenPayConfig = (company) => {
        setEditingPayConfig(company.id);
        setEditPayFields({
            company_type: company.company_type || 'digital',
            pay_rate: company.pay_rate || '',
            pay_type: company.pay_type || 'hourly',
            pay_period: company.pay_period || 'biweekly',
            pay_period_start: company.pay_period_start || '',
            tax_federal_rate: company.tax_federal_rate ?? 12,
            tax_state_rate: company.tax_state_rate ?? 4.4,
            tax_fica_rate: company.tax_fica_rate ?? 7.65,
            tax_deductions_pretax: company.tax_deductions_pretax ?? 0,
        });
    };

    const handleSavePayConfig = async (id) => {
        const r = (v) => Math.round(parseFloat(v) * 100) / 100;
        await updateCompany(id, {
            company_type: editPayFields.company_type,
            pay_rate: editPayFields.pay_rate ? r(editPayFields.pay_rate) : null,
            pay_type: editPayFields.pay_type,
            pay_period: editPayFields.pay_period,
            pay_period_start: editPayFields.pay_period_start || null,
            tax_federal_rate: r(editPayFields.tax_federal_rate) || 12,
            tax_state_rate: r(editPayFields.tax_state_rate) || 4.4,
            tax_fica_rate: r(editPayFields.tax_fica_rate) || 7.65,
            tax_deductions_pretax: r(editPayFields.tax_deductions_pretax) || 0,
        });
        setEditingPayConfig(null);
        loadData();
    };

    const handleDeleteCompany = async (id) => {
        if (!confirm('Delete this company and all its projects/tasks?')) return;
        await deleteCompany(id);
        loadData();
    };

    const handleDeleteProject = async (id) => {
        if (!confirm('Delete this project and all its tasks?')) return;
        await deleteProject(id);
        loadData();
    };

    const handleDeleteTask = async (id) => {
        await deleteTask(id);
        loadData();
    };

    // Auto-clock handlers
    const handleAddAutoClockRule = async (companyId) => {
        if (!autoClockProjectId || !autoClockTaskId) return;
        try {
            await addAutoClockRule(companyId, autoClockProjectId, autoClockTaskId, autoClockDay, autoClockTime);
            setShowAutoClockSetup(null);
            loadData();
        } catch (err) {
            console.error('Failed to add auto-clock rule:', err);
        }
    };

    const handleDeleteAutoClockRule = async (ruleId) => {
        await deleteAutoClockRule(ruleId);
        loadData();
    };

    // Drag and drop handlers
    const handleDragStart = (e, companyId) => {
        setDraggedCompany(companyId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, companyId) => {
        e.preventDefault();
        if (companyId !== draggedCompany) {
            setDragOverCompany(companyId);
        }
    };

    const handleDrop = async (e, targetCompanyId) => {
        e.preventDefault();
        if (!draggedCompany || draggedCompany === targetCompanyId) {
            setDraggedCompany(null);
            setDragOverCompany(null);
            return;
        }

        const newOrder = [...companies];
        const dragIdx = newOrder.findIndex(c => c.id === draggedCompany);
        const dropIdx = newOrder.findIndex(c => c.id === targetCompanyId);
        const [moved] = newOrder.splice(dragIdx, 1);
        newOrder.splice(dropIdx, 0, moved);

        // Update display_order for all
        setCompanies(newOrder);
        for (let i = 0; i < newOrder.length; i++) {
            await updateCompany(newOrder[i].id, { display_order: i });
        }

        setDraggedCompany(null);
        setDragOverCompany(null);
    };

    // Reusable pay/tax config form
    const renderPayConfig = (type, payRate, payType, payPeriod, payPeriodStart, taxFed, taxState, taxFica, taxDeductions, setField) => (
        <>
            {type === 'physical' && (
                <div className="pay-config-section">
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '12px', color: 'var(--text-accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Icon name="dollar" size={14} /> Pay Configuration
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div className="input-group">
                            <label>Pay Rate ($)</label>
                            <input className="input" type="number" step="0.01" placeholder="e.g. 17.50" value={payRate} onChange={(e) => setField('pay_rate', e.target.value)} />
                        </div>
                        <div className="input-group">
                            <label>Pay Type</label>
                            <select className="input" value={payType} onChange={(e) => setField('pay_type', e.target.value)}>
                                <option value="hourly">Hourly</option>
                                <option value="salary">Salary</option>
                            </select>
                        </div>
                        <div className="input-group">
                            <label>Pay Period</label>
                            <select className="input" value={payPeriod} onChange={(e) => setField('pay_period', e.target.value)}>
                                <option value="weekly">Weekly</option>
                                <option value="biweekly">Biweekly</option>
                                <option value="monthly">Monthly</option>
                            </select>
                        </div>
                        <div className="input-group">
                            <label>Period Start Date</label>
                            <input className="input" type="date" value={payPeriodStart} onChange={(e) => setField('pay_period_start', e.target.value)} />
                        </div>
                    </div>

                    <h4 style={{ fontSize: '0.85rem', fontWeight: 600, margin: '16px 0 12px', color: 'var(--text-accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Icon name="chart" size={14} /> Tax Configuration
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div className="input-group">
                            <label>Federal Tax (%)</label>
                            <input className="input" type="number" step="0.01" placeholder="12" value={taxFed} onChange={(e) => setField('tax_federal_rate', e.target.value)} />
                        </div>
                        <div className="input-group">
                            <label>State Tax (%) — CO</label>
                            <input className="input" type="number" step="0.01" placeholder="4.4" value={taxState} onChange={(e) => setField('tax_state_rate', e.target.value)} />
                        </div>
                        <div className="input-group">
                            <label>FICA (SS + Medicare) (%)</label>
                            <input className="input" type="number" step="0.01" placeholder="7.65" value={taxFica} onChange={(e) => setField('tax_fica_rate', e.target.value)} />
                        </div>
                        <div className="input-group">
                            <label>Pre-Tax Deductions ($)</label>
                            <input className="input" type="number" step="0.01" placeholder="0" value={taxDeductions} onChange={(e) => setField('tax_deductions_pretax', e.target.value)} />
                        </div>
                    </div>
                </div>
            )}
        </>
    );

    if (loading) {
        return (
            <AppLayout>
                <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                    <div className="loading-spinner" />
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout>
            <div className="page-header flex justify-between items-center">
                <div>
                    <h2><Icon name="grid" size={22} className="icon-inline" /> Projects</h2>
                    <p>Organize your work by company, project, and task</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowNewCompany(true)}>
                    + New Company
                </button>
            </div>

            {/* New Company Form */}
            {showNewCompany && (
                <div className="card" style={{ marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px' }}>New Company</h3>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <div className="input-group">
                            <label>Company Name</label>
                            <input
                                className="input"
                                placeholder="e.g. Golden Bike Shop"
                                value={newCompanyName}
                                onChange={(e) => setNewCompanyName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddCompany()}
                                autoFocus
                            />
                        </div>
                        <div className="input-group">
                            <label>Company Type</label>
                            <div className="toggle-group">
                                <button className={`toggle-btn ${newCompanyType === 'digital' ? 'active' : ''}`} onClick={() => setNewCompanyType('digital')}>
                                    <Icon name="monitor" size={14} /> Digital
                                </button>
                                <button className={`toggle-btn ${newCompanyType === 'physical' ? 'active' : ''}`} onClick={() => setNewCompanyType('physical')}>
                                    <Icon name="building" size={14} /> Physical
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="input-group" style={{ marginBottom: '12px' }}>
                        <label>Color</label>
                        <div className="color-picker">
                            {COMPANY_COLORS.map((color) => (
                                <div
                                    key={color}
                                    className={`color-swatch ${newCompanyColor === color ? 'selected' : ''}`}
                                    style={{ backgroundColor: color }}
                                    onClick={() => setNewCompanyColor(color)}
                                />
                            ))}
                        </div>
                    </div>

                    {renderPayConfig(
                        newCompanyType, newPayRate, newPayType, newPayPeriod, newPayPeriodStart,
                        newTaxFederal, newTaxState, newTaxFica, newTaxDeductions,
                        (field, value) => {
                            const setters = {
                                pay_rate: setNewPayRate, pay_type: setNewPayType, pay_period: setNewPayPeriod,
                                pay_period_start: setNewPayPeriodStart, tax_federal_rate: setNewTaxFederal,
                                tax_state_rate: setNewTaxState, tax_fica_rate: setNewTaxFica, tax_deductions_pretax: setNewTaxDeductions,
                            };
                            setters[field]?.(value);
                        }
                    )}

                    <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: '16px' }}>
                        <button className="btn btn-primary" onClick={handleAddCompany}>Create</button>
                        <button className="btn btn-ghost" onClick={resetNewCompanyForm}>Cancel</button>
                    </div>
                </div>
            )}

            {/* Companies Tile Grid */}
            {companies.length === 0 && !showNewCompany ? (
                <div className="empty-state">
                    <div className="empty-state-icon"><Icon name="building" size={48} /></div>
                    <h3>No companies yet</h3>
                    <p>Create your first company to start organizing your work and tracking time.</p>
                    <button className="btn btn-primary" onClick={() => setShowNewCompany(true)}>+ Create Company</button>
                </div>
            ) : (
                <div className="company-tile-grid">
                    {companies.map((company) => {
                        const companyProjects = projectsByCompany[company.id] || [];
                        const isOpen = expanded[company.id] === true;
                        const isPhysical = company.company_type === 'physical';
                        const totalTasks = companyProjects.reduce((sum, p) => sum + (tasksByProject[p.id]?.length || 0), 0);
                        const companyRules = autoClockRules.filter(r => r.company_id === company.id);
                        const isDragOver = dragOverCompany === company.id;

                        return (
                            <div
                                key={company.id}
                                className={`company-tile ${isOpen ? 'expanded' : ''} ${isDragOver ? 'drag-over' : ''}`}
                                draggable
                                onDragStart={(e) => handleDragStart(e, company.id)}
                                onDragOver={(e) => handleDragOver(e, company.id)}
                                onDragLeave={() => setDragOverCompany(null)}
                                onDrop={(e) => handleDrop(e, company.id)}
                                onDragEnd={() => { setDraggedCompany(null); setDragOverCompany(null); }}
                            >
                                {/* Color accent bar */}
                                <div className="tile-accent" style={{ backgroundColor: company.color }} />

                                {/* Tile header */}
                                <div className="tile-header" onClick={() => toggleExpanded(company.id)}>
                                    <div className="tile-title-row">
                                        <span className="color-dot" style={{ backgroundColor: company.color, width: '10px', height: '10px', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
                                        {editingCompany === company.id ? (
                                            <input
                                                className="input"
                                                style={{ padding: '4px 8px', fontSize: '0.9rem', width: '160px' }}
                                                value={editCompanyName}
                                                onChange={(e) => setEditCompanyName(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleEditCompany(company.id)}
                                                onBlur={() => handleEditCompany(company.id)}
                                                autoFocus
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        ) : (
                                            <span className="tile-name">{company.name}</span>
                                        )}
                                        {isPhysical && <span className="badge badge-physical">Physical</span>}
                                    </div>
                                    <div className="tile-meta">
                                        <span>{companyProjects.length} project{companyProjects.length !== 1 ? 's' : ''}</span>
                                        <span>•</span>
                                        <span>{totalTasks} task{totalTasks !== 1 ? 's' : ''}</span>
                                        {isPhysical && company.pay_rate && (
                                            <>
                                                <span>•</span>
                                                <span className="tile-pay">${parseFloat(company.pay_rate).toFixed(2)}/hr</span>
                                            </>
                                        )}
                                        {companyRules.length > 0 && (
                                            <>
                                                <span>•</span>
                                                <span style={{ color: '#facc15', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                    <Icon name="zap" size={10} /> Auto
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Action buttons */}
                                <div className="tile-actions" onClick={(e) => e.stopPropagation()}>
                                    {isPhysical && (
                                        <button className="btn-icon" title="Auto-Clock Rules" onClick={() => setShowAutoClockSetup(showAutoClockSetup === company.id ? null : company.id)}>
                                            <Icon name="zap" size={14} />
                                        </button>
                                    )}
                                    {isPhysical && (
                                        <button className="btn-icon" title="Pay & Tax Config" onClick={() => editingPayConfig === company.id ? setEditingPayConfig(null) : handleOpenPayConfig(company)}>
                                            <Icon name="dollar" size={14} />
                                        </button>
                                    )}
                                    <button className="btn-icon" title="Edit name" onClick={() => { setEditingCompany(company.id); setEditCompanyName(company.name); }}>
                                        <Icon name="edit" size={14} />
                                    </button>
                                    <button className="btn-icon" title="Delete" onClick={() => handleDeleteCompany(company.id)}>
                                        <Icon name="trash" size={14} />
                                    </button>
                                </div>

                                {/* Auto-clock setup */}
                                {showAutoClockSetup === company.id && (
                                    <div className="tile-section" onClick={(e) => e.stopPropagation()}>
                                        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', color: '#facc15' }}>
                                            <Icon name="zap" size={14} /> Auto-Clock Rules
                                        </h4>
                                        {/* Existing rules */}
                                        {companyRules.map(rule => (
                                            <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '0.8rem', background: 'var(--bg-input)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                                                <Icon name="zap" size={12} style={{ color: '#facc15' }} />
                                                <span style={{ fontWeight: 600 }}>{DAY_NAMES[rule.day_of_week]}</span>
                                                <span>at {rule.start_time}</span>
                                                <span style={{ color: 'var(--text-muted)' }}>→ {rule.tasks?.name || 'Task'}</span>
                                                <button className="btn-icon" onClick={() => handleDeleteAutoClockRule(rule.id)} style={{ marginLeft: 'auto' }}>
                                                    <Icon name="close" size={12} />
                                                </button>
                                            </div>
                                        ))}
                                        {/* Add new rule */}
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                            <div className="input-group" style={{ minWidth: '80px' }}>
                                                <label style={{ fontSize: '0.7rem' }}>Day</label>
                                                <select className="input" style={{ fontSize: '0.8rem' }} value={autoClockDay} onChange={e => setAutoClockDay(parseInt(e.target.value))}>
                                                    {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                                                </select>
                                            </div>
                                            <div className="input-group" style={{ minWidth: '100px' }}>
                                                <label style={{ fontSize: '0.7rem' }}>Time</label>
                                                <input className="input" type="time" style={{ fontSize: '0.8rem' }} value={autoClockTime} onChange={e => setAutoClockTime(e.target.value)} />
                                            </div>
                                            <div className="input-group" style={{ minWidth: '120px' }}>
                                                <label style={{ fontSize: '0.7rem' }}>Project</label>
                                                <select className="input" style={{ fontSize: '0.8rem' }} value={autoClockProjectId} onChange={e => { setAutoClockProjectId(e.target.value); setAutoClockTaskId(''); }}>
                                                    <option value="">Pick project...</option>
                                                    {companyProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                </select>
                                            </div>
                                            {autoClockProjectId && (
                                                <div className="input-group" style={{ minWidth: '120px' }}>
                                                    <label style={{ fontSize: '0.7rem' }}>Task</label>
                                                    <select className="input" style={{ fontSize: '0.8rem' }} value={autoClockTaskId} onChange={e => setAutoClockTaskId(e.target.value)}>
                                                        <option value="">Pick task...</option>
                                                        {(tasksByProject[autoClockProjectId] || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                                    </select>
                                                </div>
                                            )}
                                            <button className="btn btn-primary btn-sm" onClick={() => handleAddAutoClockRule(company.id)} disabled={!autoClockTaskId}>
                                                <Icon name="plus" size={12} /> Add
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Pay/Tax Config Panel */}
                                {editingPayConfig === company.id && (
                                    <div className="tile-section" onClick={(e) => e.stopPropagation()}>
                                        <div className="input-group" style={{ marginBottom: '12px' }}>
                                            <label>Company Type</label>
                                            <div className="toggle-group">
                                                <button className={`toggle-btn ${editPayFields.company_type === 'digital' ? 'active' : ''}`} onClick={() => setEditPayFields(p => ({ ...p, company_type: 'digital' }))}>
                                                    <Icon name="monitor" size={14} /> Digital
                                                </button>
                                                <button className={`toggle-btn ${editPayFields.company_type === 'physical' ? 'active' : ''}`} onClick={() => setEditPayFields(p => ({ ...p, company_type: 'physical' }))}>
                                                    <Icon name="building" size={14} /> Physical
                                                </button>
                                            </div>
                                        </div>
                                        {renderPayConfig(
                                            editPayFields.company_type, editPayFields.pay_rate, editPayFields.pay_type,
                                            editPayFields.pay_period, editPayFields.pay_period_start, editPayFields.tax_federal_rate,
                                            editPayFields.tax_state_rate, editPayFields.tax_fica_rate, editPayFields.tax_deductions_pretax,
                                            (field, value) => setEditPayFields(p => ({ ...p, [field]: value }))
                                        )}
                                        <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: '12px' }}>
                                            <button className="btn btn-primary btn-sm" onClick={() => handleSavePayConfig(company.id)}>Save</button>
                                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingPayConfig(null)}>Cancel</button>
                                        </div>
                                    </div>
                                )}

                                {/* Expanded Body — projects & tasks */}
                                {isOpen && (
                                    <div className="tile-body" onClick={(e) => e.stopPropagation()}>
                                        {companyProjects.map((project) => {
                                            const projectTasks = tasksByProject[project.id] || [];
                                            const projectExpanded = expanded[`p-${project.id}`] !== false;

                                            return (
                                                <div key={project.id} style={{ marginBottom: '8px' }}>
                                                    <div className="project-item" onClick={() => toggleExpanded(`p-${project.id}`)} style={{ cursor: 'pointer' }}>
                                                        <span className="project-name">
                                                            {projectExpanded ? '▾' : '▸'}{' '}
                                                            {editingProject === project.id ? (
                                                                <input
                                                                    className="input"
                                                                    style={{ padding: '2px 6px', fontSize: '0.8rem', width: '160px', display: 'inline' }}
                                                                    value={editProjectName}
                                                                    onChange={(e) => setEditProjectName(e.target.value)}
                                                                    onKeyDown={async (e) => {
                                                                        if (e.key === 'Enter' && editProjectName.trim()) {
                                                                            await updateProject(project.id, { name: editProjectName.trim() });
                                                                            setEditingProject(null);
                                                                            loadData();
                                                                        }
                                                                        if (e.key === 'Escape') setEditingProject(null);
                                                                    }}
                                                                    onBlur={async () => {
                                                                        if (editProjectName.trim() && editProjectName.trim() !== project.name) {
                                                                            await updateProject(project.id, { name: editProjectName.trim() });
                                                                            loadData();
                                                                        }
                                                                        setEditingProject(null);
                                                                    }}
                                                                    autoFocus
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                            ) : (
                                                                <span>{project.name}</span>
                                                            )}
                                                        </span>
                                                        <div className="flex gap-2 items-center">
                                                            <span className="project-tasks-count">{projectTasks.length} tasks</span>
                                                            <button className="btn-icon" style={{ fontSize: '0.75rem' }} onClick={(e) => { e.stopPropagation(); setEditingProject(project.id); setEditProjectName(project.name); }} title="Rename">
                                                                <Icon name="edit" size={11} />
                                                            </button>
                                                            <button className="btn-icon" style={{ fontSize: '0.75rem' }} onClick={(e) => { e.stopPropagation(); handleDeleteProject(project.id); }}>
                                                                <Icon name="close" size={12} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {projectExpanded && (
                                                        <div style={{ paddingLeft: '16px' }}>
                                                            {projectTasks.map((task) => (
                                                                <div key={task.id} className="project-item" style={{ fontSize: '0.8rem' }}>
                                                                    {editingTask === task.id ? (
                                                                        <input
                                                                            className="input"
                                                                            style={{ padding: '2px 6px', fontSize: '0.8rem', width: '160px' }}
                                                                            value={editTaskName}
                                                                            onChange={(e) => setEditTaskName(e.target.value)}
                                                                            onKeyDown={async (e) => {
                                                                                if (e.key === 'Enter' && editTaskName.trim()) {
                                                                                    await updateTask(task.id, { name: editTaskName.trim() });
                                                                                    setEditingTask(null);
                                                                                    loadData();
                                                                                }
                                                                                if (e.key === 'Escape') setEditingTask(null);
                                                                            }}
                                                                            onBlur={async () => {
                                                                                if (editTaskName.trim() && editTaskName.trim() !== task.name) {
                                                                                    await updateTask(task.id, { name: editTaskName.trim() });
                                                                                    loadData();
                                                                                }
                                                                                setEditingTask(null);
                                                                            }}
                                                                            autoFocus
                                                                        />
                                                                    ) : (
                                                                        <span style={{ cursor: 'pointer' }} onClick={() => { setEditingTask(task.id); setEditTaskName(task.name); }}>• {task.name}</span>
                                                                    )}
                                                                    <div className="flex gap-1 items-center">
                                                                        <button className="btn-icon" style={{ fontSize: '0.7rem' }} onClick={() => { setEditingTask(task.id); setEditTaskName(task.name); }} title="Rename">
                                                                            <Icon name="edit" size={10} />
                                                                        </button>
                                                                        <button className="btn-icon" style={{ fontSize: '0.7rem' }} onClick={() => handleDeleteTask(task.id)}>
                                                                            <Icon name="close" size={10} />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            <div className="add-inline">
                                                                <input
                                                                    className="input"
                                                                    style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                                                                    placeholder="New task..."
                                                                    value={newTaskName[project.id] || ''}
                                                                    onChange={(e) => setNewTaskName((prev) => ({ ...prev, [project.id]: e.target.value }))}
                                                                    onKeyDown={(e) => e.key === 'Enter' && handleAddTask(project.id, company.id)}
                                                                />
                                                                <button className="btn btn-secondary btn-sm" onClick={() => handleAddTask(project.id, company.id)}>+</button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {/* Add Project inline */}
                                        <div className="add-inline" style={{ marginTop: '8px' }}>
                                            <input
                                                className="input"
                                                style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                                                placeholder="New project..."
                                                value={newProjectName[company.id] || ''}
                                                onChange={(e) => setNewProjectName((prev) => ({ ...prev, [company.id]: e.target.value }))}
                                                onKeyDown={(e) => e.key === 'Enter' && handleAddProject(company.id)}
                                            />
                                            <button className="btn btn-secondary btn-sm" onClick={() => handleAddProject(company.id)}>+</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </AppLayout>
    );
}
