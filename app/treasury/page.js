'use client';

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/Icon';
import { useCompany } from '@/components/CompanyContext';
import { getCompanies, getTransactions, addTransaction, updateTransaction, deleteTransaction } from '@/lib/store';

const EXPENSE_CATEGORIES = ['Operations', 'Software', 'Marketing', 'Legal', 'Payroll', 'Supplies', 'Travel', 'Other'];
const REVENUE_CATEGORIES = ['Services', 'Product Sales', 'Consulting', 'Contract', 'Recurring', 'Other'];

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TreasuryPage() {
    const { activeCompanyId, activeCompany } = useCompany();
    const [companies, setCompanies] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({
        type: 'revenue',
        amount: '',
        description: '',
        category: '',
        company_id: '',
        date: new Date().toISOString().split('T')[0],
    });

    const loadData = useCallback(async () => {
        try {
            const [comps, txns] = await Promise.all([
                getCompanies(),
                getTransactions(activeCompanyId ? { companyId: activeCompanyId } : {}),
            ]);
            comps.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
            setCompanies(comps);
            setTransactions(txns);
        } catch (err) {
            console.error('Failed to load treasury data', err);
        }
        setLoading(false);
    }, [activeCompanyId]);

    useEffect(() => {
        setLoading(true);
        loadData();
    }, [loadData]);

    const resetForm = () => {
        setForm({
            type: 'revenue',
            amount: '',
            description: '',
            category: '',
            company_id: activeCompanyId || '',
            date: new Date().toISOString().split('T')[0],
        });
        setEditingId(null);
        setShowForm(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.amount || !form.company_id) return;

        try {
            if (editingId) {
                await updateTransaction(editingId, {
                    type: form.type,
                    amount: parseFloat(form.amount),
                    description: form.description,
                    category: form.category,
                    date: form.date,
                });
            } else {
                await addTransaction({
                    type: form.type,
                    amount: parseFloat(form.amount),
                    description: form.description,
                    category: form.category,
                    company_id: form.company_id,
                    date: form.date,
                });
            }
            resetForm();
            loadData();
        } catch (err) {
            console.error('Failed to save transaction', err);
        }
    };

    const handleEdit = (txn) => {
        setForm({
            type: txn.type,
            amount: txn.amount.toString(),
            description: txn.description || '',
            category: txn.category || '',
            company_id: txn.company_id,
            date: txn.date,
        });
        setEditingId(txn.id);
        setShowForm(true);
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this transaction?')) return;
        try {
            await deleteTransaction(id);
            loadData();
        } catch (err) {
            console.error('Failed to delete transaction', err);
        }
    };

    // Calculate totals
    const totalRevenue = transactions.filter(t => t.type === 'revenue').reduce((s, t) => s + parseFloat(t.amount), 0);
    const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);
    const netIncome = totalRevenue - totalExpenses;

    const categories = form.type === 'revenue' ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES;

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
        return (
            <AppLayout>
                <div className="page-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span className="color-dot" style={{ backgroundColor: activeCompany.color, width: '12px', height: '12px', borderRadius: '50%' }} />
                        <div>
                            <h2>{activeCompany.name} — Treasury</h2>
                            <p>Revenue, expenses, and cash flow</p>
                        </div>
                    </div>
                </div>

                {/* P&L Summary */}
                <div className="stats-grid" style={{ marginBottom: '24px' }}>
                    <div className="stat-card">
                        <div className="stat-label">Revenue</div>
                        <div className="stat-value" style={{ color: 'var(--color-success)' }}>{formatCurrency(totalRevenue)}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Expenses</div>
                        <div className="stat-value" style={{ color: 'var(--color-danger)' }}>{formatCurrency(totalExpenses)}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Net Income</div>
                        <div className="stat-value" style={{ color: netIncome >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                            {formatCurrency(netIncome)}
                        </div>
                    </div>
                </div>

                {/* Add Button */}
                <div style={{ marginBottom: '16px' }}>
                    <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}>
                        <Icon name="plus" size={14} /> {showForm ? 'Cancel' : 'Add Transaction'}
                    </button>
                </div>

                {/* Entry Form */}
                {showForm && (
                    <div className="card" style={{ marginBottom: '20px' }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '16px' }}>
                            {editingId ? 'Edit Transaction' : 'New Transaction'}
                        </h3>
                        <form onSubmit={handleSubmit}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                <div className="input-group">
                                    <label>Type</label>
                                    <div className="treasury-type-toggle">
                                        <button
                                            type="button"
                                            className={`treasury-type-btn ${form.type === 'revenue' ? 'active revenue' : ''}`}
                                            onClick={() => setForm(f => ({ ...f, type: 'revenue', category: '' }))}
                                        >
                                            <Icon name="arrow-down" size={12} /> Revenue
                                        </button>
                                        <button
                                            type="button"
                                            className={`treasury-type-btn ${form.type === 'expense' ? 'active expense' : ''}`}
                                            onClick={() => setForm(f => ({ ...f, type: 'expense', category: '' }))}
                                        >
                                            <Icon name="arrow-up" size={12} /> Expense
                                        </button>
                                    </div>
                                </div>
                                <div className="input-group">
                                    <label>Amount ($)</label>
                                    <input
                                        className="input"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="0.00"
                                        value={form.amount}
                                        onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="input-group">
                                    <label>Category</label>
                                    <select
                                        className="input"
                                        value={form.category}
                                        onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                                    >
                                        <option value="">Select category...</option>
                                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label>Date</label>
                                    <input
                                        className="input"
                                        type="date"
                                        value={form.date}
                                        onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="input-group" style={{ marginBottom: '16px' }}>
                                <label>Description</label>
                                <input
                                    className="input"
                                    placeholder="What was this for?"
                                    value={form.description}
                                    onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                                />
                            </div>
                            <button className="btn btn-primary" type="submit">
                                <Icon name="save" size={14} /> {editingId ? 'Update' : 'Add'} Transaction
                            </button>
                        </form>
                    </div>
                )}

                {/* Transaction List */}
                {transactions.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon"><Icon name="dollar" size={48} /></div>
                        <h3>No transactions yet</h3>
                        <p>Add your first revenue or expense entry to start tracking cash flow.</p>
                    </div>
                ) : (
                    <div className="card">
                        <div className="treasury-list">
                            {transactions.map(txn => (
                                <div key={txn.id} className="treasury-row">
                                    <div className="treasury-row-left">
                                        <span className={`treasury-type-dot ${txn.type}`} />
                                        <div>
                                            <div className="treasury-row-desc">
                                                {txn.description || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No description</span>}
                                            </div>
                                            <div className="treasury-row-meta">
                                                {formatDate(txn.date)}
                                                {txn.category && <> · <span className="treasury-category">{txn.category}</span></>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="treasury-row-right">
                                        <span className={`treasury-amount ${txn.type}`}>
                                            {txn.type === 'expense' ? '−' : '+'}{formatCurrency(txn.amount)}
                                        </span>
                                        <button className="btn-icon" onClick={() => handleEdit(txn)} title="Edit">
                                            <Icon name="edit" size={14} />
                                        </button>
                                        <button className="btn-icon" onClick={() => handleDelete(txn.id)} title="Delete">
                                            <Icon name="trash" size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </AppLayout>
        );
    }

    // ===================== GLOBAL VIEW =====================
    // Per-company P&L breakdown
    const companyBreakdowns = companies.map(company => {
        const compTxns = transactions.filter(t => t.company_id === company.id);
        const rev = compTxns.filter(t => t.type === 'revenue').reduce((s, t) => s + parseFloat(t.amount), 0);
        const exp = compTxns.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);
        return { ...company, revenue: rev, expenses: exp, net: rev - exp, count: compTxns.length };
    }).filter(c => c.count > 0);

    return (
        <AppLayout>
            <div className="page-header">
                <h2><Icon name="dollar" size={22} className="icon-inline" /> Treasury</h2>
                <p>Financial overview across all companies</p>
            </div>

            {/* Global Summary */}
            <div className="stats-grid" style={{ marginBottom: '24px' }}>
                <div className="stat-card">
                    <div className="stat-label">Total Revenue</div>
                    <div className="stat-value" style={{ color: 'var(--color-success)' }}>{formatCurrency(totalRevenue)}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Total Expenses</div>
                    <div className="stat-value" style={{ color: 'var(--color-danger)' }}>{formatCurrency(totalExpenses)}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Net Income</div>
                    <div className="stat-value" style={{ color: netIncome >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                        {formatCurrency(netIncome)}
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Companies Active</div>
                    <div className="stat-value">{companyBreakdowns.length}</div>
                </div>
            </div>

            {/* Per-Company Breakdown */}
            {companyBreakdowns.length > 0 ? (
                <>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
                        Per-Company P&L
                    </h3>
                    <div className="compliance-grid">
                        {companyBreakdowns.map(company => (
                            <div key={company.id} className="compliance-card">
                                <div className="compliance-card-accent" style={{ backgroundColor: company.color }} />
                                <div className="compliance-card-header">
                                    <span className="color-dot" style={{ backgroundColor: company.color, width: '10px', height: '10px', borderRadius: '50%' }} />
                                    <span className="compliance-card-name">{company.name}</span>
                                </div>
                                <div className="compliance-card-body">
                                    <div className="compliance-card-field">
                                        <span className="compliance-label">Revenue</span>
                                        <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{formatCurrency(company.revenue)}</span>
                                    </div>
                                    <div className="compliance-card-field">
                                        <span className="compliance-label">Expenses</span>
                                        <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{formatCurrency(company.expenses)}</span>
                                    </div>
                                    <div className="compliance-card-field" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '8px', marginTop: '4px' }}>
                                        <span className="compliance-label" style={{ fontWeight: 600 }}>Net</span>
                                        <span style={{ color: company.net >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 700, fontSize: '0.95rem' }}>
                                            {formatCurrency(company.net)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <div className="empty-state">
                    <div className="empty-state-icon"><Icon name="dollar" size={48} /></div>
                    <h3>No financial data yet</h3>
                    <p>Select a company from the sidebar switcher and add your first transaction.</p>
                </div>
            )}
        </AppLayout>
    );
}
