'use client';

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/Icon';
import { useCompany } from '@/components/CompanyContext';
import { getCompanies, updateEntityCompliance, updateCompany, getEquityHolders, addEquityHolder, updateEquityHolder, deleteEquityHolder } from '@/lib/store';

const US_STATES = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
    'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
    'VA','WA','WV','WI','WY','DC',
];

function getRenewalStatus(dateStr) {
    if (!dateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const renewal = new Date(dateStr + 'T00:00:00');
    const diffMs = renewal - today;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { status: 'overdue', label: `Overdue by ${Math.abs(diffDays)}d`, days: diffDays };
    if (diffDays <= 30) return { status: 'due-soon', label: `Due in ${diffDays}d`, days: diffDays };
    return { status: 'ok', label: `${diffDays}d away`, days: diffDays };
}

export default function CompliancePage() {
    const { activeCompanyId, activeCompany } = useCompany();
    const [companies, setCompanies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editFields, setEditFields] = useState({});
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [showEin, setShowEin] = useState(false);

    // Equity
    const [equityHolders, setEquityHolders] = useState([]);
    const [showEquityForm, setShowEquityForm] = useState(false);
    const [editingEquityId, setEditingEquityId] = useState(null);
    const [equityForm, setEquityForm] = useState({ holder_name: '', percentage: '', role: '', notes: '' });

    const loadData = useCallback(async () => {
        try {
            const c = await getCompanies();
            c.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
            setCompanies(c);

            // If a company is selected, populate edit fields
            if (activeCompanyId) {
                const company = c.find(co => co.id === activeCompanyId);
                if (company) {
                    setEditFields({
                        is_entity: company.is_entity || false,
                        legal_name: company.legal_name || '',
                        ein: company.ein || '',
                        state_of_formation: company.state_of_formation || '',
                        formation_date: company.formation_date || '',
                        state_renewal_date: company.state_renewal_date || '',
                        registered_agent: company.registered_agent || '',
                        domains: Array.isArray(company.domains) ? company.domains.join(', ') : (company.domains || ''),
                    });
                }
            }
        } catch (err) {
            console.error('Failed to load compliance data', err);
        }
        setLoading(false);
    }, [activeCompanyId]);

    const loadEquity = useCallback(async () => {
        if (!activeCompanyId) return;
        try {
            const holders = await getEquityHolders(activeCompanyId);
            setEquityHolders(holders);
        } catch (err) {
            console.error('Failed to load equity data', err);
        }
    }, [activeCompanyId]);

    useEffect(() => {
        setLoading(true);
        setShowEin(false);
        loadData();
        loadEquity();
    }, [loadData, loadEquity]);

    const resetEquityForm = () => {
        setEquityForm({ holder_name: '', percentage: '', role: '', notes: '' });
        setEditingEquityId(null);
        setShowEquityForm(false);
    };

    const handleEquitySubmit = async (e) => {
        e.preventDefault();
        if (!equityForm.holder_name || !equityForm.percentage) return;
        try {
            if (editingEquityId) {
                await updateEquityHolder(editingEquityId, {
                    holder_name: equityForm.holder_name,
                    percentage: equityForm.percentage,
                    role: equityForm.role,
                    notes: equityForm.notes,
                });
            } else {
                await addEquityHolder({
                    company_id: activeCompanyId,
                    holder_name: equityForm.holder_name,
                    percentage: equityForm.percentage,
                    role: equityForm.role,
                    notes: equityForm.notes,
                });
            }
            resetEquityForm();
            loadEquity();
        } catch (err) {
            console.error('Failed to save equity holder', err);
        }
    };

    const handleEquityEdit = (holder) => {
        setEquityForm({
            holder_name: holder.holder_name,
            percentage: holder.percentage.toString(),
            role: holder.role || '',
            notes: holder.notes || '',
        });
        setEditingEquityId(holder.id);
        setShowEquityForm(true);
    };

    const handleEquityDelete = async (id) => {
        if (!confirm('Remove this equity holder?')) return;
        try {
            await deleteEquityHolder(id);
            loadEquity();
        } catch (err) {
            console.error('Failed to delete equity holder', err);
        }
    };

    const handleSave = async () => {
        if (!activeCompanyId) return;
        setSaving(true);
        try {
            const domainsArray = editFields.domains
                ? editFields.domains.split(',').map(d => d.trim()).filter(Boolean)
                : [];

            await updateEntityCompliance(activeCompanyId, {
                is_entity: editFields.is_entity,
                legal_name: editFields.legal_name,
                ein: editFields.ein,
                state_of_formation: editFields.state_of_formation,
                formation_date: editFields.formation_date || null,
                state_renewal_date: editFields.state_renewal_date || null,
                registered_agent: editFields.registered_agent,
                domains: domainsArray,
            });

            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
            loadData();
        } catch (err) {
            console.error('Failed to save compliance data', err);
        }
        setSaving(false);
    };

    const handleToggleEntity = async (companyId, currentValue) => {
        try {
            await updateEntityCompliance(companyId, { is_entity: !currentValue });
            loadData();
        } catch (err) {
            console.error('Failed to toggle entity', err);
        }
    };

    const setField = (key, value) => {
        setEditFields(prev => ({ ...prev, [key]: value }));
    };

    if (loading) {
        return (
            <AppLayout>
                <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                    <div className="loading-spinner" />
                </div>
            </AppLayout>
        );
    }

    // ===================== COMPANY VIEW =====================
    if (activeCompanyId && activeCompany) {
        const renewalInfo = getRenewalStatus(editFields.state_renewal_date);

        return (
            <AppLayout>
                <div className="page-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span className="color-dot" style={{ backgroundColor: activeCompany.color, width: '12px', height: '12px', borderRadius: '50%' }} />
                        <div>
                            <h2>{activeCompany.name} — Compliance</h2>
                            <p>Entity settings and compliance tracking</p>
                        </div>
                    </div>
                </div>

                {/* Entity Toggle */}
                <div className="card" style={{ marginBottom: '20px' }}>
                    <div className="compliance-toggle-row">
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '4px' }}>
                                <Icon name="shield" size={16} className="icon-inline" /> Formal LLC Entity
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                Mark this company as a registered LLC to track compliance info
                            </div>
                        </div>
                        <button
                            className={`compliance-toggle ${editFields.is_entity ? 'active' : ''}`}
                            onClick={() => setField('is_entity', !editFields.is_entity)}
                        >
                            <span className="compliance-toggle-knob" />
                        </button>
                    </div>
                </div>

                {/* Entity Fields */}
                {editFields.is_entity && (
                    <>
                        {/* Renewal Warning */}
                        {renewalInfo && renewalInfo.status !== 'ok' && (
                            <div className={`compliance-alert ${renewalInfo.status}`}>
                                <Icon name={renewalInfo.status === 'overdue' ? 'warning' : 'clock'} size={16} />
                                <span>
                                    <strong>State Renewal {renewalInfo.status === 'overdue' ? 'Overdue' : 'Due Soon'}:</strong>{' '}
                                    {renewalInfo.label}
                                </span>
                            </div>
                        )}

                        <div className="card" style={{ marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Icon name="building" size={16} /> Entity Information
                            </h3>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div className="input-group">
                                    <label>Legal Name</label>
                                    <input
                                        className="input"
                                        placeholder="e.g. GC Ventures LLC"
                                        value={editFields.legal_name}
                                        onChange={(e) => setField('legal_name', e.target.value)}
                                    />
                                </div>

                                <div className="input-group">
                                    <label>EIN (Tax ID)</label>
                                    <div className="flex gap-2">
                                        <input
                                            className="input"
                                            type={showEin ? 'text' : 'password'}
                                            placeholder="XX-XXXXXXX"
                                            value={editFields.ein}
                                            onChange={(e) => setField('ein', e.target.value)}
                                            style={{ flex: 1 }}
                                        />
                                        <button className="btn btn-ghost btn-sm" onClick={() => setShowEin(!showEin)}>
                                            <Icon name={showEin ? 'eye-off' : 'eye'} size={14} />
                                        </button>
                                    </div>
                                </div>

                                <div className="input-group">
                                    <label>State of Formation</label>
                                    <select
                                        className="input"
                                        value={editFields.state_of_formation}
                                        onChange={(e) => setField('state_of_formation', e.target.value)}
                                    >
                                        <option value="">Select state...</option>
                                        {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>

                                <div className="input-group">
                                    <label>Formation Date</label>
                                    <input
                                        className="input"
                                        type="date"
                                        value={editFields.formation_date}
                                        onChange={(e) => setField('formation_date', e.target.value)}
                                    />
                                </div>

                                <div className="input-group">
                                    <label>
                                        State Renewal Date
                                        {renewalInfo && (
                                            <span className={`compliance-badge-inline ${renewalInfo.status}`}>
                                                {renewalInfo.label}
                                            </span>
                                        )}
                                    </label>
                                    <input
                                        className="input"
                                        type="date"
                                        value={editFields.state_renewal_date}
                                        onChange={(e) => setField('state_renewal_date', e.target.value)}
                                    />
                                </div>

                                <div className="input-group">
                                    <label>Registered Agent</label>
                                    <input
                                        className="input"
                                        placeholder="e.g. Northwest Registered Agent"
                                        value={editFields.registered_agent}
                                        onChange={(e) => setField('registered_agent', e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="input-group" style={{ marginTop: '16px' }}>
                                <label>Linked Domains (comma separated)</label>
                                <input
                                    className="input"
                                    placeholder="e.g. gcventures.com, mysite.io"
                                    value={editFields.domains}
                                    onChange={(e) => setField('domains', e.target.value)}
                                />
                            </div>

                            <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                    {saving ? 'Saving...' : saved ? <><Icon name="check" size={14} /> Saved!</> : <><Icon name="save" size={14} /> Save Changes</>}
                                </button>
                            </div>
                        </div>

                        {/* Equity / Ownership */}
                        <div className="card" style={{ marginBottom: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                                    <Icon name="chart" size={16} /> Ownership / Equity
                                </h3>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => { setShowEquityForm(!showEquityForm); if (showEquityForm) resetEquityForm(); }}
                                >
                                    <Icon name="plus" size={12} /> {showEquityForm ? 'Cancel' : 'Add Holder'}
                                </button>
                            </div>

                            {/* Equity Form */}
                            {showEquityForm && (
                                <form onSubmit={handleEquitySubmit} style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: '10px', marginBottom: '10px' }}>
                                        <div className="input-group">
                                            <label>Name</label>
                                            <input
                                                className="input"
                                                placeholder="Shareholder name"
                                                value={equityForm.holder_name}
                                                onChange={(e) => setEquityForm(f => ({ ...f, holder_name: e.target.value }))}
                                                required
                                            />
                                        </div>
                                        <div className="input-group">
                                            <label>%</label>
                                            <input
                                                className="input"
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                max="100"
                                                placeholder="40"
                                                value={equityForm.percentage}
                                                onChange={(e) => setEquityForm(f => ({ ...f, percentage: e.target.value }))}
                                                required
                                            />
                                        </div>
                                        <div className="input-group">
                                            <label>Role</label>
                                            <input
                                                className="input"
                                                placeholder="e.g. Managing Member"
                                                value={equityForm.role}
                                                onChange={(e) => setEquityForm(f => ({ ...f, role: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    <button className="btn btn-primary btn-sm" type="submit">
                                        <Icon name="save" size={12} /> {editingEquityId ? 'Update' : 'Add'}
                                    </button>
                                </form>
                            )}

                            {/* Equity List */}
                            {equityHolders.length > 0 ? (
                                <>
                                    {/* Percentage Bar */}
                                    <div className="equity-bar" style={{ marginBottom: '16px' }}>
                                        {equityHolders.map((h, i) => {
                                            const colors = ['var(--color-accent)', 'var(--color-success)', 'var(--color-warning)', 'var(--color-danger)', '#8b5cf6', '#ec4899'];
                                            return (
                                                <div
                                                    key={h.id}
                                                    className="equity-bar-segment"
                                                    style={{
                                                        width: `${h.percentage}%`,
                                                        backgroundColor: colors[i % colors.length],
                                                    }}
                                                    title={`${h.holder_name}: ${h.percentage}%`}
                                                />
                                            );
                                        })}
                                    </div>

                                    {/* Holder Cards */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {equityHolders.map((h, i) => {
                                            const colors = ['var(--color-accent)', 'var(--color-success)', 'var(--color-warning)', 'var(--color-danger)', '#8b5cf6', '#ec4899'];
                                            return (
                                                <div key={h.id} className="equity-holder-row">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                                                        <div className="equity-color-dot" style={{ backgroundColor: colors[i % colors.length] }} />
                                                        <div>
                                                            <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{h.holder_name}</div>
                                                            {h.role && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{h.role}</div>}
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{h.percentage}%</span>
                                                        <button className="btn-icon" onClick={() => handleEquityEdit(h)} title="Edit">
                                                            <Icon name="edit" size={13} />
                                                        </button>
                                                        <button className="btn-icon" onClick={() => handleEquityDelete(h.id)} title="Remove">
                                                            <Icon name="trash" size={13} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Total */}
                                    {(() => {
                                        const total = equityHolders.reduce((s, h) => s + parseFloat(h.percentage), 0);
                                        return (
                                            <div style={{ marginTop: '12px', padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Total Allocated</span>
                                                <span style={{ fontWeight: 700, color: total === 100 ? 'var(--color-success)' : total > 100 ? 'var(--color-danger)' : 'var(--color-warning)' }}>
                                                    {total}%{total !== 100 && ` (${total < 100 ? `${(100 - total).toFixed(2)}% unallocated` : 'over-allocated'})`}
                                                </span>
                                            </div>
                                        );
                                    })()}
                                </>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                    No equity holders added yet. Click "Add Holder" to track ownership.
                                </div>
                            )}
                        </div>
                    </>
                )}

                {!editFields.is_entity && (
                    <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
                        <div style={{ color: 'var(--text-muted)', marginBottom: '12px' }}>
                            <Icon name="shield" size={40} />
                        </div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                            Toggle "Formal LLC Entity" above to start tracking compliance info for this company.
                        </div>
                    </div>
                )}
            </AppLayout>
        );
    }

    // ===================== GLOBAL VIEW =====================
    const entities = companies.filter(c => c.is_entity);
    const nonEntities = companies.filter(c => !c.is_entity);

    return (
        <AppLayout>
            <div className="page-header">
                <h2><Icon name="shield" size={22} className="icon-inline" /> Compliance</h2>
                <p>Entity status and compliance tracking across all companies</p>
            </div>

            {/* Summary Cards */}
            <div className="stats-grid" style={{ marginBottom: '24px' }}>
                <div className="stat-card">
                    <div className="stat-label">Total Companies</div>
                    <div className="stat-value">{companies.length}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Formal LLCs</div>
                    <div className="stat-value">{entities.length}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Renewals Due</div>
                    <div className="stat-value">
                        {entities.filter(c => {
                            const info = getRenewalStatus(c.state_renewal_date);
                            return info && (info.status === 'overdue' || info.status === 'due-soon');
                        }).length}
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Work Categories</div>
                    <div className="stat-value">{nonEntities.length}</div>
                </div>
            </div>

            {/* Entity Companies */}
            {entities.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
                        <Icon name="shield" size={14} className="icon-inline" /> Registered Entities
                    </h3>
                    <div className="compliance-grid">
                        {entities.map(company => {
                            const renewalInfo = getRenewalStatus(company.state_renewal_date);
                            return (
                                <div key={company.id} className="compliance-card">
                                    <div className="compliance-card-accent" style={{ backgroundColor: company.color }} />
                                    <div className="compliance-card-header">
                                        <span className="color-dot" style={{ backgroundColor: company.color, width: '10px', height: '10px', borderRadius: '50%' }} />
                                        <span className="compliance-card-name">{company.name}</span>
                                        <span className="badge badge-active" style={{ fontSize: '0.65rem' }}>LLC</span>
                                    </div>
                                    <div className="compliance-card-body">
                                        {company.legal_name && (
                                            <div className="compliance-card-field">
                                                <span className="compliance-label">Legal Name</span>
                                                <span>{company.legal_name}</span>
                                            </div>
                                        )}
                                        {company.state_of_formation && (
                                            <div className="compliance-card-field">
                                                <span className="compliance-label">State</span>
                                                <span>{company.state_of_formation}</span>
                                            </div>
                                        )}
                                        {company.ein && (
                                            <div className="compliance-card-field">
                                                <span className="compliance-label">EIN</span>
                                                <span>••••••{company.ein.slice(-4)}</span>
                                            </div>
                                        )}
                                        {renewalInfo && (
                                            <div className="compliance-card-field">
                                                <span className="compliance-label">Renewal</span>
                                                <span className={`compliance-badge-inline ${renewalInfo.status}`}>
                                                    {renewalInfo.label}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Non-Entity Companies */}
            {nonEntities.length > 0 && (
                <div>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
                        Work Categories
                    </h3>
                    <div className="compliance-grid">
                        {nonEntities.map(company => (
                            <div key={company.id} className="compliance-card compliance-card-simple">
                                <div className="compliance-card-accent" style={{ backgroundColor: company.color }} />
                                <div className="compliance-card-header">
                                    <span className="color-dot" style={{ backgroundColor: company.color, width: '10px', height: '10px', borderRadius: '50%' }} />
                                    <span className="compliance-card-name">{company.name}</span>
                                    {company.company_type === 'physical' && (
                                        <span className="badge badge-physical" style={{ fontSize: '0.65rem' }}>Physical</span>
                                    )}
                                </div>
                                <div className="compliance-card-body">
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        Not a registered entity — select this company and toggle to LLC to add compliance info.
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {companies.length === 0 && (
                <div className="empty-state">
                    <div className="empty-state-icon"><Icon name="shield" size={48} /></div>
                    <h3>No companies yet</h3>
                    <p>Create companies in the Projects page first, then manage their compliance here.</p>
                </div>
            )}
        </AppLayout>
    );
}
