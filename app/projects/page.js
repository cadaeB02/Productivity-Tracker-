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
    deleteCompany,
    deleteProject,
    deleteTask,
} from '@/lib/store';
import { COMPANY_COLORS } from '@/lib/utils';

export default function ProjectsPage() {
    const [companies, setCompanies] = useState([]);
    const [projectsByCompany, setProjectsByCompany] = useState({});
    const [tasksByProject, setTasksByProject] = useState({});
    const [expanded, setExpanded] = useState({});
    const [loading, setLoading] = useState(true);

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
    const [editingPayConfig, setEditingPayConfig] = useState(null);
    const [editPayFields, setEditPayFields] = useState({});

    const loadData = useCallback(async () => {
        try {
            const c = await getCompanies();
            setCompanies(c);

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
        const config = {
            company_type: newCompanyType,
            pay_rate: newPayRate ? parseFloat(newPayRate) : null,
            pay_type: newPayType,
            pay_period: newPayPeriod,
            pay_period_start: newPayPeriodStart || null,
            tax_federal_rate: parseFloat(newTaxFederal) || 12,
            tax_state_rate: parseFloat(newTaxState) || 4.4,
            tax_fica_rate: parseFloat(newTaxFica) || 7.65,
            tax_deductions_pretax: parseFloat(newTaxDeductions) || 0,
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
        await updateCompany(id, {
            company_type: editPayFields.company_type,
            pay_rate: editPayFields.pay_rate ? parseFloat(editPayFields.pay_rate) : null,
            pay_type: editPayFields.pay_type,
            pay_period: editPayFields.pay_period,
            pay_period_start: editPayFields.pay_period_start || null,
            tax_federal_rate: parseFloat(editPayFields.tax_federal_rate) || 12,
            tax_state_rate: parseFloat(editPayFields.tax_state_rate) || 4.4,
            tax_fica_rate: parseFloat(editPayFields.tax_fica_rate) || 7.65,
            tax_deductions_pretax: parseFloat(editPayFields.tax_deductions_pretax) || 0,
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
                            <input
                                className="input"
                                type="number"
                                step="0.01"
                                placeholder="e.g. 17.50"
                                value={payRate}
                                onChange={(e) => setField('pay_rate', e.target.value)}
                            />
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
                            <input
                                className="input"
                                type="date"
                                value={payPeriodStart}
                                onChange={(e) => setField('pay_period_start', e.target.value)}
                            />
                        </div>
                    </div>

                    <h4 style={{ fontSize: '0.85rem', fontWeight: 600, margin: '16px 0 12px', color: 'var(--text-accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Icon name="chart" size={14} /> Tax Configuration
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div className="input-group">
                            <label>Federal Tax (%)</label>
                            <input
                                className="input"
                                type="number"
                                step="0.01"
                                placeholder="12"
                                value={taxFed}
                                onChange={(e) => setField('tax_federal_rate', e.target.value)}
                            />
                        </div>
                        <div className="input-group">
                            <label>State Tax (%) — CO</label>
                            <input
                                className="input"
                                type="number"
                                step="0.01"
                                placeholder="4.4"
                                value={taxState}
                                onChange={(e) => setField('tax_state_rate', e.target.value)}
                            />
                        </div>
                        <div className="input-group">
                            <label>FICA (SS + Medicare) (%)</label>
                            <input
                                className="input"
                                type="number"
                                step="0.01"
                                placeholder="7.65"
                                value={taxFica}
                                onChange={(e) => setField('tax_fica_rate', e.target.value)}
                            />
                        </div>
                        <div className="input-group">
                            <label>Pre-Tax Deductions ($)</label>
                            <input
                                className="input"
                                type="number"
                                step="0.01"
                                placeholder="0"
                                value={taxDeductions}
                                onChange={(e) => setField('tax_deductions_pretax', e.target.value)}
                            />
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
                    <h2>Projects</h2>
                    <p>Organize your work by company, project, and task</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowNewCompany(true)}>
                    + New Company
                </button>
            </div>

            {/* New Company Form */}
            {showNewCompany && (
                <div className="card" style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px' }}>New Company</h3>

                    <div className="input-group" style={{ marginBottom: '12px' }}>
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

                    {/* Company Type Toggle */}
                    <div className="input-group" style={{ marginBottom: '16px' }}>
                        <label>Company Type</label>
                        <div className="toggle-group">
                            <button
                                className={`toggle-btn ${newCompanyType === 'digital' ? 'active' : ''}`}
                                onClick={() => setNewCompanyType('digital')}
                            >
                                <Icon name="monitor" size={14} /> Digital
                            </button>
                            <button
                                className={`toggle-btn ${newCompanyType === 'physical' ? 'active' : ''}`}
                                onClick={() => setNewCompanyType('physical')}
                            >
                                <Icon name="building" size={14} /> Physical
                            </button>
                        </div>
                    </div>

                    {renderPayConfig(
                        newCompanyType, newPayRate, newPayType, newPayPeriod, newPayPeriodStart,
                        newTaxFederal, newTaxState, newTaxFica, newTaxDeductions,
                        (field, value) => {
                            const setters = {
                                pay_rate: setNewPayRate,
                                pay_type: setNewPayType,
                                pay_period: setNewPayPeriod,
                                pay_period_start: setNewPayPeriodStart,
                                tax_federal_rate: setNewTaxFederal,
                                tax_state_rate: setNewTaxState,
                                tax_fica_rate: setNewTaxFica,
                                tax_deductions_pretax: setNewTaxDeductions,
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

            {/* Companies List */}
            {companies.length === 0 && !showNewCompany ? (
                <div className="empty-state">
                    <div className="empty-state-icon"><Icon name="building" size={48} /></div>
                    <h3>No companies yet</h3>
                    <p>Create your first company to start organizing your work and tracking time.</p>
                    <button className="btn btn-primary" onClick={() => setShowNewCompany(true)}>
                        + Create Company
                    </button>
                </div>
            ) : (
                <div className="companies-grid">
                    {companies.map((company) => {
                        const companyProjects = projectsByCompany[company.id] || [];
                        const isExpanded = expanded[company.id] !== false;
                        const isPhysical = company.company_type === 'physical';

                        return (
                            <div key={company.id} className="company-card">
                                <div className="company-card-header">
                                    <h3
                                        onClick={() => toggleExpanded(company.id)}
                                        style={{ cursor: 'pointer', flex: 1 }}
                                    >
                                        <span className="color-dot" style={{ backgroundColor: company.color, width: '10px', height: '10px', borderRadius: '50%', display: 'inline-block' }} />
                                        {editingCompany === company.id ? (
                                            <input
                                                className="input"
                                                style={{ padding: '4px 8px', fontSize: '0.9rem', width: '140px' }}
                                                value={editCompanyName}
                                                onChange={(e) => setEditCompanyName(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleEditCompany(company.id)}
                                                onBlur={() => handleEditCompany(company.id)}
                                                autoFocus
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        ) : (
                                            <>
                                                {company.name}
                                                {isPhysical && (
                                                    <span className="badge badge-physical" style={{ marginLeft: '8px', fontSize: '0.65rem' }}>Physical</span>
                                                )}
                                            </>
                                        )}
                                    </h3>
                                    <div className="flex gap-2">
                                        {isPhysical && (
                                            <button
                                                className="btn-icon"
                                                title="Pay & Tax Config"
                                                onClick={() => editingPayConfig === company.id ? setEditingPayConfig(null) : handleOpenPayConfig(company)}
                                            >
                                                <Icon name="dollar" size={14} />
                                            </button>
                                        )}
                                        <button
                                            className="btn-icon"
                                            title="Edit"
                                            onClick={() => {
                                                setEditingCompany(company.id);
                                                setEditCompanyName(company.name);
                                            }}
                                        >
                                            <Icon name="edit" size={14} />
                                        </button>
                                        <button
                                            className="btn-icon"
                                            title="Delete"
                                            onClick={() => handleDeleteCompany(company.id)}
                                        >
                                            <Icon name="trash" size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* Pay/Tax Config Panel */}
                                {editingPayConfig === company.id && (
                                    <div style={{ padding: '16px', borderTop: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                                        <div className="input-group" style={{ marginBottom: '12px' }}>
                                            <label>Company Type</label>
                                            <div className="toggle-group">
                                                <button
                                                    className={`toggle-btn ${editPayFields.company_type === 'digital' ? 'active' : ''}`}
                                                    onClick={() => setEditPayFields(p => ({ ...p, company_type: 'digital' }))}
                                                >
                                                    <Icon name="monitor" size={14} /> Digital
                                                </button>
                                                <button
                                                    className={`toggle-btn ${editPayFields.company_type === 'physical' ? 'active' : ''}`}
                                                    onClick={() => setEditPayFields(p => ({ ...p, company_type: 'physical' }))}
                                                >
                                                    <Icon name="building" size={14} /> Physical
                                                </button>
                                            </div>
                                        </div>

                                        {renderPayConfig(
                                            editPayFields.company_type,
                                            editPayFields.pay_rate,
                                            editPayFields.pay_type,
                                            editPayFields.pay_period,
                                            editPayFields.pay_period_start,
                                            editPayFields.tax_federal_rate,
                                            editPayFields.tax_state_rate,
                                            editPayFields.tax_fica_rate,
                                            editPayFields.tax_deductions_pretax,
                                            (field, value) => setEditPayFields(p => ({ ...p, [field]: value }))
                                        )}

                                        <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: '12px' }}>
                                            <button className="btn btn-primary btn-sm" onClick={() => handleSavePayConfig(company.id)}>Save</button>
                                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingPayConfig(null)}>Cancel</button>
                                        </div>
                                    </div>
                                )}

                                {/* Pay summary badge for physical companies */}
                                {isPhysical && company.pay_rate && editingPayConfig !== company.id && (
                                    <div
                                        style={{
                                            padding: '8px 16px',
                                            borderTop: '1px solid var(--border)',
                                            fontSize: '0.8rem',
                                            color: 'var(--text-secondary)',
                                            display: 'flex',
                                            gap: '12px',
                                            flexWrap: 'wrap',
                                            cursor: 'pointer',
                                        }}
                                        onClick={() => handleOpenPayConfig(company)}
                                    >
                                        <span><strong>${parseFloat(company.pay_rate).toFixed(2)}</strong>/hr</span>
                                        <span>• {company.pay_period}</span>
                                        <span>• Tax: {(parseFloat(company.tax_federal_rate || 12) + parseFloat(company.tax_state_rate || 4.4) + parseFloat(company.tax_fica_rate || 7.65)).toFixed(1)}%</span>
                                    </div>
                                )}

                                {isExpanded && (
                                    <div className="company-card-body">
                                        {companyProjects.map((project) => {
                                            const projectTasks = tasksByProject[project.id] || [];
                                            const projectExpanded = expanded[`p-${project.id}`] !== false;

                                            return (
                                                <div key={project.id} style={{ marginBottom: '8px' }}>
                                                    <div
                                                        className="project-item"
                                                        onClick={() => toggleExpanded(`p-${project.id}`)}
                                                        style={{ cursor: 'pointer' }}
                                                    >
                                                        <span className="project-name">
                                                            {projectExpanded ? '▾' : '▸'} {project.name}
                                                        </span>
                                                        <div className="flex gap-2 items-center">
                                                            <span className="project-tasks-count">{projectTasks.length} tasks</span>
                                                            <button
                                                                className="btn-icon"
                                                                style={{ fontSize: '0.75rem' }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteProject(project.id);
                                                                }}
                                                            >
                                                                <Icon name="close" size={12} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {projectExpanded && (
                                                        <div style={{ paddingLeft: '16px' }}>
                                                            {projectTasks.map((task) => (
                                                                <div key={task.id} className="project-item" style={{ fontSize: '0.8rem' }}>
                                                                    <span>• {task.name}</span>
                                                                    <button
                                                                        className="btn-icon"
                                                                        style={{ fontSize: '0.7rem' }}
                                                                        onClick={() => handleDeleteTask(task.id)}
                                                                    >
                                                                        <Icon name="close" size={10} />
                                                                    </button>
                                                                </div>
                                                            ))}

                                                            {/* Add Task inline */}
                                                            <div className="add-inline">
                                                                <input
                                                                    className="input"
                                                                    style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                                                                    placeholder="New task..."
                                                                    value={newTaskName[project.id] || ''}
                                                                    onChange={(e) => setNewTaskName((prev) => ({ ...prev, [project.id]: e.target.value }))}
                                                                    onKeyDown={(e) => e.key === 'Enter' && handleAddTask(project.id, company.id)}
                                                                />
                                                                <button
                                                                    className="btn btn-secondary btn-sm"
                                                                    onClick={() => handleAddTask(project.id, company.id)}
                                                                >
                                                                    +
                                                                </button>
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
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => handleAddProject(company.id)}
                                            >
                                                +
                                            </button>
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
