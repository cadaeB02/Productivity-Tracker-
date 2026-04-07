'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/Icon';
import { useCompany } from '@/components/CompanyContext';
import { getCompanies, getTransactions, addTransaction, updateTransaction, deleteTransaction, getSessions, getAllProjects, uploadDocument } from '@/lib/store';

const EXPENSE_CATEGORIES = ['Operations', 'Software', 'Marketing', 'Legal', 'Payroll', 'Supplies', 'Travel', 'Other'];
const REVENUE_CATEGORIES = ['Services', 'Product Sales', 'Consulting', 'Contract', 'Paycheck', 'Recurring', 'Other'];
const SCAN_CATEGORIES = ['Food & Dining', 'Software & Tools', 'Office', 'Travel', 'Gas & Auto', 'Shopping', 'Entertainment', 'Utilities', 'Marketing', 'Contractors', 'Paycheck', 'Other'];

// ── Image Processing Helpers ──
function compressImage(file, maxWidth = 1200, quality = 0.8) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            canvas.toBlob(blob => resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file), 'image/jpeg', quality);
        };
        img.src = URL.createObjectURL(file);
    });
}
async function processImage(file) {
    if (file.type === 'application/pdf') return file;
    let processed = file;
    // HEIC conversion
    if (file.name?.toLowerCase().endsWith('.heic') || file.type === 'image/heic') {
        try {
            const heic2any = (await import('heic2any')).default;
            const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
            processed = new File([blob], file.name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' });
        } catch (e) { console.warn('HEIC conversion failed, using original', e); }
    }
    // Compress if > 1MB
    if (processed.size > 1024 * 1024) processed = await compressImage(processed);
    return processed;
}

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
    const [sessions, setSessions] = useState([]);
    const [projects, setProjects] = useState([]);
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

    // Receipt scanner state
    const [showScanner, setShowScanner] = useState(false);
    const [scanFile, setScanFile] = useState(null);
    const [scanPreview, setScanPreview] = useState(null);
    const [scanProcessing, setScanProcessing] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [scannedItems, setScannedItems] = useState([]);
    const [scanError, setScanError] = useState('');
    const [scanSaved, setScanSaved] = useState(false);
    const [scanSaving, setScanSaving] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [scanManual, setScanManual] = useState(false);
    const [manualForm, setManualForm] = useState({ vendor: '', amount: '', date: new Date().toISOString().split('T')[0], category: 'Other', type: 'expense', is_recurring: false });
    const [showEditor, setShowEditor] = useState(false);
    const [editorMessages, setEditorMessages] = useState([]);
    const [editorInput, setEditorInput] = useState('');
    const [editorSending, setEditorSending] = useState(false);
    const scanFileInputRef = useRef(null);
    const editorScrollRef = useRef(null);
    const editorInputRef = useRef(null);

    // Plaid bank accounts
    const [bankAccounts, setBankAccounts] = useState([]);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState(null);

    const loadData = useCallback(async () => {
        try {
            const [comps, txns, allSessions, allProjects] = await Promise.all([
                getCompanies(),
                getTransactions(activeCompanyId ? { companyId: activeCompanyId } : {}),
                getSessions(),
                getAllProjects(),
            ]);
            comps.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
            setCompanies(comps);
            setTransactions(txns);
            setProjects(allProjects || []);
            // Filter sessions by company if needed
            if (activeCompanyId) {
                setSessions(allSessions.filter(s => s.company_id === activeCompanyId));
            } else {
                setSessions(allSessions);
            }
        } catch (err) {
            console.error('Failed to load treasury data', err);
        }
        setLoading(false);
    }, [activeCompanyId]);

    useEffect(() => {
        setLoading(true);
        loadData();
        loadBankAccounts();
    }, [loadData]);

    const loadBankAccounts = async () => {
        try {
            const res = await fetch('/api/plaid/get-accounts');
            if (res.ok) {
                const data = await res.json();
                setBankAccounts(data.accounts || []);
            }
        } catch (err) {
            console.error('Failed to load bank accounts', err);
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        setSyncResult(null);
        try {
            const body = activeCompanyId ? { company_id: activeCompanyId } : {};
            const res = await fetch('/api/plaid/sync-transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            setSyncResult(data);
            if (data.success) {
                loadData();
                loadBankAccounts();
            }
        } catch (err) {
            setSyncResult({ error: err.message });
        }
        setSyncing(false);
        setTimeout(() => setSyncResult(null), 5000);
    };

    const resetForm = () => {
        setForm({
            type: 'revenue',
            amount: '',
            description: '',
            category: '',
            company_id: activeCompanyId || '',
            project_id: '',
            date: new Date().toISOString().split('T')[0],
            is_recurring: false,
        });
        setEditingId(null);
        setShowForm(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.amount || !form.company_id) return;

        try {
            if (editingId) {
                const updates = {
                    type: form.type,
                    amount: parseFloat(form.amount),
                    description: form.description,
                    category: form.category,
                    date: form.date,
                    company_id: form.company_id,
                    is_recurring: form.is_recurring || false,
                };
                if (form.project_id) updates.project_id = form.project_id;
                else updates.project_id = null;
                await updateTransaction(editingId, updates);
            } else {
                await addTransaction({
                    type: form.type,
                    amount: parseFloat(form.amount),
                    description: form.description,
                    category: form.category,
                    company_id: form.company_id,
                    date: form.date,
                    is_recurring: form.is_recurring || false,
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
            project_id: txn.project_id || '',
            date: txn.date,
            is_recurring: txn.is_recurring || false,
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

    // ── Receipt Scanner Handlers ──
    const handleScanFileSelect = async (selectedFile) => {
        if (!selectedFile) return;
        setScanError('');
        setScannedItems([]);
        setScanSaved(false);
        setScanProcessing(true);
        try {
            const processed = await processImage(selectedFile);
            setScanFile(processed);
            setScanPreview(URL.createObjectURL(processed));
        } catch (err) {
            setScanError(err.message || 'Failed to process image');
        }
        setScanProcessing(false);
    };

    const handleScanAnalyze = async () => {
        if (!scanFile) return;
        setScanning(true);
        setScanError('');
        setScannedItems([]);
        try {
            const fd = new FormData();
            fd.append('receipt', scanFile);
            const res = await fetch('/api/analyze-receipt', { method: 'POST', body: fd });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Analysis failed');
            const dataArr = Array.isArray(json.data) ? json.data : [json.data];
            setScannedItems(dataArr.map((item, idx) => ({ ...item, _id: Date.now() + idx, _selected: true, company_id: activeCompanyId || '' })));
            setEditorMessages([{ role: 'assistant', content: `${dataArr.length} items ready for review. Tell me what to change — for example:\n• "Item #3 is recurring"\n• "Change items 5-8 to Travel"\n• "Delete item #2"` }]);
        } catch (err) {
            setScanError(err.message || 'Failed to analyze document');
        }
        setScanning(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) handleScanFileSelect(f);
    };

    const updateScannedItem = (index, updates) => {
        setScannedItems(prev => { const n = [...prev]; n[index] = { ...n[index], ...updates }; return n; });
    };

    const handleManualSubmit = () => {
        if (!manualForm.vendor || !manualForm.amount) return;
        setScannedItems([{
            type: manualForm.type,
            vendor: manualForm.vendor,
            amount: parseFloat(manualForm.amount),
            date: manualForm.date,
            category: manualForm.category,
            description: '',
            tax: null,
            confidence: 100,
            is_recurring: manualForm.is_recurring,
            _selected: true,
            _id: Date.now(),
            company_id: activeCompanyId || '',
            card_last_four: null,
        }]);
    };

    const handleSaveScanSelected = async () => {
        const selected = scannedItems.filter(i => i._selected);
        if (selected.length === 0) return;
        setScanSaving(true);
        try {
            const savedTxns = [];
            for (const item of selected) {
                const txn = await addTransaction({
                    type: item.type === 'revenue' ? 'revenue' : 'expense',
                    amount: parseFloat(item.amount) || 0,
                    description: `${item.vendor || ''} — ${item.description || ''}`.trim(),
                    category: item.category || 'Other',
                    company_id: item.company_id || activeCompanyId,
                    date: item.date || new Date().toISOString().split('T')[0],
                    is_recurring: item.is_recurring || false,
                });
                savedTxns.push(txn);
            }

            // Upload the receipt image to Filing for each saved transaction
            if (scanFile && savedTxns.length > 0) {
                for (const txn of savedTxns) {
                    try {
                        const receiptName = `receipt-${txn.description?.replace(/[^a-zA-Z0-9]/g, '-')?.substring(0, 40) || 'scan'}-${txn.id.substring(0, 8)}.${scanFile.name.split('.').pop() || 'jpg'}`;
                        const receiptFile = new File([scanFile], receiptName, { type: scanFile.type });
                        await uploadDocument({
                            file: receiptFile,
                            company_id: txn.company_id,
                            category: 'receipt',
                            description: `${txn.description} — ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(txn.amount)}`,
                            linked_type: 'transaction',
                            linked_id: txn.id,
                        });
                    } catch (uploadErr) {
                        console.error('Receipt upload to filing failed:', uploadErr);
                    }
                }
            }

            setScanSaved(true);
            loadData();
        } catch (err) {
            setScanError(err.message || 'Failed to save');
        }
        setScanSaving(false);
    };

    const resetScanner = () => {
        setScanFile(null);
        setScanPreview(null);
        setScannedItems([]);
        setScanError('');
        setScanSaved(false);
        setScanManual(false);
        setShowEditor(false);
        setEditorMessages([]);
        if (scanFileInputRef.current) scanFileInputRef.current.value = '';
    };

    // AI Receipt Editor chat
    const sendEditorMessage = async () => {
        if (!editorInput.trim() || editorSending) return;
        const userMsg = { role: 'user', content: editorInput.trim() };
        const newMsgs = [...editorMessages, userMsg];
        setEditorMessages(newMsgs);
        setEditorInput('');
        setEditorSending(true);
        try {
            const res = await fetch('/api/receipt-editor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: newMsgs.map(m => ({ role: m.role, content: m.content })), items: scannedItems }),
            });
            const result = await res.json();
            if (result.success && result.data) {
                setEditorMessages(prev => [...prev, { role: 'assistant', content: result.data.message || 'Done!' }]);
                if (result.data.updates && Array.isArray(result.data.updates)) {
                    const updated = [...scannedItems];
                    for (const u of result.data.updates) {
                        if (u.index >= 0 && u.index < updated.length && u.changes) {
                            updated[u.index] = { ...updated[u.index], ...u.changes };
                        }
                    }
                    setScannedItems(updated);
                }
            } else {
                setEditorMessages(prev => [...prev, { role: 'assistant', content: result.error || 'Something went wrong.' }]);
            }
        } catch {
            setEditorMessages(prev => [...prev, { role: 'assistant', content: 'Connection error — please try again.' }]);
        }
        setEditorSending(false);
    };

    useEffect(() => {
        if (editorScrollRef.current) editorScrollRef.current.scrollTop = editorScrollRef.current.scrollHeight;
    }, [editorMessages]);

    // Calculate totals
    const totalRevenue = transactions.filter(t => t.type === 'revenue').reduce((s, t) => s + parseFloat(t.amount), 0);
    const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);
    const netIncome = totalRevenue - totalExpenses;

    // ROFT calculation — Return on Founder Time
    const totalSessionSeconds = sessions.reduce((s, sess) => s + (sess.duration || 0), 0);
    const totalHours = totalSessionSeconds / 3600;
    const roft = totalHours > 0 ? totalRevenue / totalHours : 0;

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

                {/* P&L Summary + ROFT */}
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
                    <div className="stat-card roft-card">
                        <div className="stat-label"><Icon name="timer" size={12} className="icon-inline" /> ROFT</div>
                        <div className="stat-value" style={{ color: 'var(--color-accent)' }}>
                            {totalHours > 0 ? `${formatCurrency(roft)}/hr` : '—'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {totalHours > 0 ? `${Math.round(totalHours * 10) / 10}h tracked` : 'No hours logged'}
                        </div>
                    </div>
                </div>

                {/* Add Button + Scanner Button */}
                <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setShowScanner(false); if (showForm) resetForm(); }}>
                        <Icon name="plus" size={14} /> {showForm ? 'Cancel' : 'Add Transaction'}
                    </button>
                    <button className="btn btn-secondary" onClick={() => { setShowScanner(!showScanner); setShowForm(false); if (showScanner) resetScanner(); }}>
                        <Icon name="search" size={14} /> {showScanner ? 'Close Scanner' : 'Scan Receipt'}
                    </button>
                    {bankAccounts.length > 0 && (
                        <button className="btn btn-secondary" onClick={handleSync} disabled={syncing}>
                            <Icon name="download" size={14} /> {syncing ? 'Syncing...' : 'Sync Bank'}
                        </button>
                    )}
                </div>

                {/* Sync Result Toast */}
                {syncResult && (
                    <div style={{
                        padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: '12px',
                        fontSize: '0.82rem', fontWeight: 600,
                        background: syncResult.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                        color: syncResult.success ? 'var(--color-success)' : 'var(--color-danger)',
                        border: `1px solid ${syncResult.success ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                    }}>
                        {syncResult.success
                            ? `✓ Synced: ${syncResult.added} added, ${syncResult.modified} updated, ${syncResult.removed} removed`
                            : `✗ ${syncResult.error || 'Sync failed'}`
                        }
                    </div>
                )}

                {/* Bank Account Cards */}
                {bankAccounts.filter(a => !activeCompanyId || a.company_id === activeCompanyId).length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px', marginBottom: '20px' }}>
                        {bankAccounts
                            .filter(a => !activeCompanyId || a.company_id === activeCompanyId)
                            .map(acct => (
                                <div key={acct.id} className="card" style={{ padding: '14px', background: 'var(--bg-elevated)' }}>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'capitalize', marginBottom: '4px' }}>
                                        {acct.plaid_items?.institution_name || 'Bank'} • {acct.subtype || acct.type}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '2px' }}>
                                        {acct.name} {acct.mask && <span style={{ color: 'var(--text-muted)' }}>••••{acct.mask}</span>}
                                    </div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-accent)' }}>
                                        {acct.current_balance != null ? formatCurrency(acct.current_balance) : '—'}
                                    </div>
                                    {acct.available_balance != null && acct.available_balance !== acct.current_balance && (
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                            Available: {formatCurrency(acct.available_balance)}
                                        </div>
                                    )}
                                </div>
                            ))}
                    </div>
                )}

                {/* ═══════════ RECEIPT SCANNER ═══════════ */}
                {showScanner && (
                    <div className="card" style={{ marginBottom: '20px' }}>
                        {/* Header + AI/Manual toggle */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                                <Icon name="search" size={16} /> Receipt Scanner
                            </h3>
                            <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: '8px', padding: '2px' }}>
                                <button onClick={() => { setScanManual(false); setScannedItems([]); }} style={{
                                    padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, border: 'none', cursor: 'pointer',
                                    background: !scanManual ? 'var(--bg-primary)' : 'transparent',
                                    color: !scanManual ? '#fff' : 'var(--text-muted)',
                                }}>AI Scan</button>
                                <button onClick={() => { setScanManual(true); setScannedItems([]); setScanFile(null); setScanPreview(null); }} style={{
                                    padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, border: 'none', cursor: 'pointer',
                                    background: scanManual ? 'var(--bg-primary)' : 'transparent',
                                    color: scanManual ? '#fff' : 'var(--text-muted)',
                                }}>Manual</button>
                            </div>
                        </div>

                        {/* ── Manual Entry Form ── */}
                        {scanManual && scannedItems.length === 0 && (
                            <div style={{ padding: '12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', marginBottom: '12px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                                    <div className="input-group"><label>Vendor</label><input className="input" placeholder="e.g. Google" value={manualForm.vendor} onChange={e => setManualForm(f => ({ ...f, vendor: e.target.value }))} /></div>
                                    <div className="input-group"><label>Amount ($)</label><input className="input" type="number" step="0.01" placeholder="0.00" value={manualForm.amount} onChange={e => setManualForm(f => ({ ...f, amount: e.target.value }))} /></div>
                                    <div className="input-group"><label>Date</label><input className="input" type="date" value={manualForm.date} onChange={e => setManualForm(f => ({ ...f, date: e.target.value }))} /></div>
                                    <div className="input-group"><label>Category</label><select className="input" value={manualForm.category} onChange={e => setManualForm(f => ({ ...f, category: e.target.value }))}>{SCAN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                                    <button type="button" onClick={() => setManualForm(f => ({ ...f, type: 'expense' }))} className={`btn btn-sm ${manualForm.type === 'expense' ? 'btn-danger' : 'btn-secondary'}`}>
                                        <Icon name="arrow-up" size={12} /> Expense
                                    </button>
                                    <button type="button" onClick={() => setManualForm(f => ({ ...f, type: 'revenue' }))} className={`btn btn-sm ${manualForm.type === 'revenue' ? 'btn-primary' : 'btn-secondary'}`}>
                                        <Icon name="arrow-down" size={12} /> Revenue
                                    </button>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', marginLeft: 'auto', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={manualForm.is_recurring} onChange={e => setManualForm(f => ({ ...f, is_recurring: e.target.checked }))} /> Recurring
                                    </label>
                                </div>
                                <button className="btn btn-primary" disabled={!manualForm.vendor || !manualForm.amount} onClick={handleManualSubmit}>
                                    <Icon name="check" size={14} /> Review Entry
                                </button>
                            </div>
                        )}

                        {/* ── AI Upload Zone ── */}
                        {!scanManual && (
                            <>
                                <div
                                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                    onDragLeave={() => setDragOver(false)}
                                    onDrop={handleDrop}
                                    onClick={() => !scanPreview && scanFileInputRef.current?.click()}
                                    style={{
                                        border: `2px dashed ${dragOver ? 'var(--color-accent)' : 'var(--border-subtle)'}`,
                                        borderRadius: 'var(--radius-md)', padding: scanPreview ? '16px' : '32px',
                                        textAlign: 'center', cursor: scanPreview ? 'default' : 'pointer',
                                        background: dragOver ? 'rgba(99,102,241,0.05)' : 'transparent',
                                        transition: 'all 0.2s', marginBottom: '12px',
                                    }}
                                >
                                    {scanProcessing ? (
                                        <div><div className="loading-spinner" style={{ margin: '0 auto 12px' }} /><p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Processing image...</p></div>
                                    ) : scanPreview ? (
                                        <div style={{ position: 'relative', display: 'inline-block' }}>
                                            <img src={scanPreview} alt="Receipt" style={{ maxHeight: '200px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }} />
                                            <button onClick={(e) => { e.stopPropagation(); resetScanner(); }} style={{
                                                position: 'absolute', top: '-8px', right: '-8px', width: '24px', height: '24px',
                                                borderRadius: '50%', background: 'var(--bg-primary)', color: '#fff', border: 'none',
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem',
                                            }}>✕</button>
                                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>{scanFile?.name} ({(scanFile?.size / 1024).toFixed(0)} KB)</p>
                                        </div>
                                    ) : (
                                        <div>
                                            <Icon name="arrow-up" size={32} style={{ color: 'var(--text-muted)', marginBottom: '8px' }} />
                                            <p style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.9rem' }}>Drop receipt image here</p>
                                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>or click to browse • JPG, PNG, PDF, HEIC</p>
                                        </div>
                                    )}
                                    <input ref={scanFileInputRef} type="file" accept="image/*,.pdf,.heic" style={{ display: 'none' }} onChange={e => handleScanFileSelect(e.target.files?.[0])} />
                                </div>

                                {/* Analyze Button */}
                                {scanFile && scannedItems.length === 0 && !scanning && (
                                    <button className="btn btn-primary" style={{ width: '100%', marginBottom: '12px' }} onClick={handleScanAnalyze}>
                                        <Icon name="search" size={14} /> Analyze Receipt
                                    </button>
                                )}

                                {scanning && (
                                    <div style={{ textAlign: 'center', padding: '20px', background: 'rgba(99,102,241,0.05)', borderRadius: 'var(--radius-md)', marginBottom: '12px' }}>
                                        <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
                                        <p style={{ fontWeight: 600, color: 'var(--color-accent)', fontSize: '0.85rem' }}>Analyzing with Gemini AI...</p>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Extracting vendor, amount, date, and category</p>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Error */}
                        {scanError && (
                            <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: '12px', padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>{scanError}</span>
                                {!scanManual && <button className="btn-icon" onClick={() => { setScanError(''); handleScanAnalyze(); }}><Icon name="timer" size={14} /></button>}
                            </div>
                        )}

                        {/* ══ Batch Results ══ */}
                        {scannedItems.length > 0 && (
                            <div>
                                {/* Header row */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <h4 style={{ fontSize: '0.9rem', fontWeight: 700 }}>Found {scannedItems.length} Items</h4>
                                    {!scanSaved && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <button onClick={() => setScannedItems(prev => prev.map(i => ({ ...i, _selected: prev.some(x => !x._selected) })))} style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                                {scannedItems.some(x => !x._selected) ? 'Select All' : 'Deselect All'}
                                            </button>
                                            <button className="btn btn-primary btn-sm" disabled={scanSaving || scannedItems.filter(i => i._selected).length === 0} onClick={handleSaveScanSelected}>
                                                {scanSaving ? '...' : <><Icon name="check" size={12} /> Save Selected ({scannedItems.filter(i => i._selected).length})</>}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Saved confirmation */}
                                {scanSaved && (
                                    <div style={{ textAlign: 'center', padding: '16px', background: 'rgba(34,197,94,0.08)', borderRadius: 'var(--radius-md)', marginBottom: '12px' }}>
                                        <p style={{ color: 'var(--color-success)', fontWeight: 600 }}>✓ Saved {scannedItems.filter(i => i._selected).length} items to Treasury!</p>
                                        <button onClick={resetScanner} style={{ fontSize: '0.8rem', color: 'var(--color-success)', background: 'none', border: 'none', cursor: 'pointer', marginTop: '4px' }}>Process another document</button>
                                    </div>
                                )}

                                {/* Item cards */}
                                {!scanSaved && scannedItems.map((item, index) => (
                                    <div key={item._id} style={{
                                        padding: '12px', marginBottom: '8px', borderRadius: 'var(--radius-md)',
                                        border: `1px solid ${item._selected ? 'var(--color-accent)' : 'var(--border-subtle)'}`,
                                        background: item._selected ? 'var(--bg-elevated)' : 'transparent',
                                        opacity: item._selected ? 1 : 0.5, transition: 'all 0.15s',
                                    }}>
                                        {/* Checkbox + inline fields */}
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'start' }}>
                                            <input type="checkbox" checked={item._selected || false} onChange={e => updateScannedItem(index, { _selected: e.target.checked })} style={{ marginTop: '4px', cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--color-accent)' }} />
                                            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'auto 1fr 80px 110px', gap: '8px', alignItems: 'center' }}>
                                                <select className="input" style={{ padding: '3px 6px', fontSize: '0.7rem', width: 'auto' }} value={item.type} onChange={e => updateScannedItem(index, { type: e.target.value })}>
                                                    <option value="expense">Expense</option>
                                                    <option value="revenue">Revenue</option>
                                                </select>
                                                <input className="input" style={{ padding: '3px 6px', fontSize: '0.8rem' }} value={item.vendor || ''} onChange={e => updateScannedItem(index, { vendor: e.target.value })} placeholder="Vendor" />
                                                <input className="input" type="number" step="0.01" style={{ padding: '3px 6px', fontSize: '0.8rem' }} value={item.amount ?? ''} onChange={e => updateScannedItem(index, { amount: parseFloat(e.target.value) || 0 })} />
                                                <input className="input" type="date" style={{ padding: '3px 6px', fontSize: '0.7rem' }} value={item.date || ''} onChange={e => updateScannedItem(index, { date: e.target.value })} />
                                            </div>
                                        </div>
                                        {/* Description + meta row */}
                                        <div style={{ marginLeft: '24px', marginTop: '6px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <input className="input" style={{ padding: '3px 6px', fontSize: '0.75rem', flex: 1, minWidth: '120px' }} value={item.description || ''} onChange={e => updateScannedItem(index, { description: e.target.value })} placeholder="Description" />
                                            <select className="input" style={{ padding: '3px 6px', fontSize: '0.7rem', width: 'auto' }} value={item.category || 'Other'} onChange={e => updateScannedItem(index, { category: e.target.value })}>
                                                {SCAN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                            {!activeCompanyId && (
                                                <select className="input" style={{ padding: '3px 6px', fontSize: '0.7rem', width: 'auto' }} value={item.company_id} onChange={e => updateScannedItem(index, { company_id: e.target.value })}>
                                                    <option value="">Company...</option>
                                                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                </select>
                                            )}
                                            {item.card_last_four && <span style={{ padding: '1px 6px', background: 'rgba(99,102,241,0.15)', borderRadius: '4px', fontSize: '0.65rem', color: 'var(--color-accent)', fontWeight: 600 }}>Card ••••{item.card_last_four}</span>}
                                            {item.is_recurring && <span style={{ padding: '1px 6px', background: 'rgba(234,179,8,0.15)', borderRadius: '4px', fontSize: '0.65rem', color: '#eab308', fontWeight: 600 }}>Recurring</span>}
                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{item.confidence}%</span>
                                        </div>
                                    </div>
                                ))}

                                {/* AI Receipt Editor */}
                                {!scanSaved && scannedItems.length > 0 && (
                                    <div style={{ marginTop: '12px' }}>
                                        {!showEditor ? (
                                            <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => { setShowEditor(true); setTimeout(() => editorInputRef.current?.focus(), 200); }}>
                                                <Icon name="edit" size={14} /> Open Receipt Editor (AI)
                                            </button>
                                        ) : (
                                            <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden', height: '320px', display: 'flex', flexDirection: 'column' }}>
                                                {/* Editor header */}
                                                <div style={{ padding: '8px 12px', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Receipt Editor • {scannedItems.length} items</span>
                                                    <button onClick={() => setShowEditor(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
                                                </div>
                                                {/* Messages */}
                                                <div ref={editorScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    {editorMessages.map((msg, i) => (
                                                        <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                                            <div style={{
                                                                maxWidth: '85%', padding: '8px 12px', borderRadius: '12px', fontSize: '0.8rem', whiteSpace: 'pre-wrap',
                                                                background: msg.role === 'user' ? '#7c3aed' : 'var(--bg-elevated)',
                                                                color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                                                            }}>{msg.content}</div>
                                                        </div>
                                                    ))}
                                                    {editorSending && (
                                                        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                                            <div style={{ padding: '8px 12px', borderRadius: '12px', background: 'var(--bg-elevated)' }}>
                                                                <div className="loading-spinner" style={{ width: '16px', height: '16px' }} />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                {/* Input */}
                                                <div style={{ padding: '8px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: '6px' }}>
                                                    <input ref={editorInputRef} className="input" style={{ flex: 1, padding: '6px 10px', fontSize: '0.8rem' }} value={editorInput} onChange={e => setEditorInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendEditorMessage(); } }} placeholder="Edit items in plain English..." disabled={editorSending} />
                                                    <button className="btn btn-primary btn-sm" onClick={sendEditorMessage} disabled={editorSending || !editorInput.trim()}>
                                                        <Icon name="arrow-right" size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

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
                                            onClick={() => setForm(f => ({ ...f, type: 'revenue', ...(f.type !== 'revenue' ? { category: '' } : {}) }))}
                                        >
                                            <Icon name="arrow-down" size={12} /> Revenue
                                        </button>
                                        <button
                                            type="button"
                                            className={`treasury-type-btn ${form.type === 'expense' ? 'active expense' : ''}`}
                                            onClick={() => setForm(f => ({ ...f, type: 'expense', ...(f.type !== 'expense' ? { category: '' } : {}) }))}
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
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                <div className="input-group">
                                    <label>Company</label>
                                    <select className="input" value={form.company_id} onChange={e => setForm(f => ({ ...f, company_id: e.target.value, project_id: '' }))}>
                                        <option value="">Select company...</option>
                                        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label>Project (optional)</label>
                                    <select className="input" value={form.project_id || ''} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
                                        <option value="">No project</option>
                                        {projects.filter(p => p.company_id === form.company_id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={form.is_recurring || false} onChange={e => setForm(f => ({ ...f, is_recurring: e.target.checked }))} /> Recurring
                                </label>
                            </div>
                            <button className="btn btn-primary" type="submit">
                                <Icon name="save" size={14} /> {editingId ? 'Update' : 'Add'} Transaction
                            </button>
                        </form>
                    </div>
                )}

                {/* Upcoming Recurring Expenses */}
                {(() => {
                    const recurring = transactions.filter(t => t.is_recurring);
                    if (recurring.length === 0) return null;
                    // Group by description to deduplicate, take latest date for each
                    const grouped = {};
                    recurring.forEach(t => {
                        const key = t.description || t.category || 'Recurring';
                        if (!grouped[key] || t.date > grouped[key].date) grouped[key] = t;
                    });
                    const items = Object.values(grouped).map(t => {
                        const lastDate = new Date(t.date + 'T00:00:00');
                        const nextDate = new Date(lastDate);
                        nextDate.setMonth(nextDate.getMonth() + 1);
                        const daysUntil = Math.ceil((nextDate - new Date()) / (1000 * 60 * 60 * 24));
                        return { ...t, nextDate, daysUntil };
                    }).sort((a, b) => a.daysUntil - b.daysUntil);

                    return (
                        <div className="card" style={{ marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Icon name="timer" size={16} /> Upcoming Recurring
                            </h3>
                            <div style={{ display: 'grid', gap: '8px' }}>
                                {items.map((item, i) => (
                                    <div key={i} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                                        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{item.description || 'Recurring Charge'}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                Next: {item.nextDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                {item.daysUntil <= 7 && <span style={{ marginLeft: '6px', padding: '1px 6px', background: 'rgba(239,68,68,0.15)', borderRadius: '4px', fontSize: '0.65rem', color: 'var(--color-danger)', fontWeight: 600 }}>{item.daysUntil <= 0 ? 'Due!' : `${item.daysUntil}d`}</span>}
                                                {item.daysUntil > 7 && <span style={{ marginLeft: '6px', padding: '1px 6px', background: 'rgba(234,179,8,0.15)', borderRadius: '4px', fontSize: '0.65rem', color: '#eab308', fontWeight: 600 }}>{item.daysUntil}d</span>}
                                            </div>
                                        </div>
                                        <span style={{ fontWeight: 700, color: item.type === 'expense' ? 'var(--color-danger)' : 'var(--color-success)', fontSize: '0.9rem' }}>
                                            {item.type === 'expense' ? '−' : '+'}{formatCurrency(item.amount)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })()}

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
                                                {txn.is_recurring && <span style={{ marginLeft: '6px', padding: '1px 6px', background: 'rgba(234,179,8,0.15)', borderRadius: '4px', fontSize: '0.65rem', color: '#eab308', fontWeight: 600 }}>Recurring</span>}
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

    const companyMap = {};
    companies.forEach(c => { companyMap[c.id] = c; });

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

            {/* Bank Account Cards (All) */}
            {bankAccounts.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', margin: 0 }}>
                            <Icon name="building" size={14} className="icon-inline" /> Linked Accounts
                        </h3>
                        <button className="btn btn-secondary btn-sm" onClick={handleSync} disabled={syncing}>
                            <Icon name="download" size={12} /> {syncing ? 'Syncing...' : 'Sync All'}
                        </button>
                    </div>

                    {syncResult && (
                        <div style={{
                            padding: '8px 12px', borderRadius: 'var(--radius-sm)', marginBottom: '10px',
                            fontSize: '0.78rem', fontWeight: 600,
                            background: syncResult.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                            color: syncResult.success ? 'var(--color-success)' : 'var(--color-danger)',
                        }}>
                            {syncResult.success
                                ? `✓ ${syncResult.added} added, ${syncResult.modified} updated`
                                : `✗ ${syncResult.error || 'Sync failed'}`
                            }
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                        {bankAccounts.map(acct => (
                            <div key={acct.id} className="card" style={{ padding: '12px', background: 'var(--bg-elevated)' }}>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                                    {acct.plaid_items?.institution_name || 'Bank'} • {acct.subtype || acct.type}
                                </div>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                                    {acct.name} {acct.mask && <span style={{ color: 'var(--text-muted)' }}>••••{acct.mask}</span>}
                                </div>
                                <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-accent)' }}>
                                    {acct.current_balance != null ? formatCurrency(acct.current_balance) : '—'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Add Transaction Button */}
            <div style={{ marginBottom: '16px' }}>
                <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}>
                    <Icon name="plus" size={14} /> {showForm ? 'Cancel' : 'Add Transaction'}
                </button>
            </div>

            {/* Entry Form (Global) */}
            {showForm && (
                <div className="card" style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '16px' }}>
                        {editingId ? 'Edit Transaction' : 'New Transaction'}
                    </h3>
                    <form onSubmit={handleSubmit}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                            <div className="input-group">
                                <label>Company</label>
                                <select
                                    className="input"
                                    value={form.company_id}
                                    onChange={(e) => setForm(f => ({ ...f, company_id: e.target.value }))}
                                    required
                                >
                                    <option value="">Select company...</option>
                                    {companies.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="input-group">
                                <label>Type</label>
                                <div className="treasury-type-toggle">
                                    <button
                                        type="button"
                                        className={`treasury-type-btn ${form.type === 'revenue' ? 'active revenue' : ''}`}
                                        onClick={() => setForm(f => ({ ...f, type: 'revenue', ...(f.type !== 'revenue' ? { category: '' } : {}) }))}
                                    >
                                        <Icon name="arrow-down" size={12} /> Revenue
                                    </button>
                                    <button
                                        type="button"
                                        className={`treasury-type-btn ${form.type === 'expense' ? 'active expense' : ''}`}
                                        onClick={() => setForm(f => ({ ...f, type: 'expense', ...(f.type !== 'expense' ? { category: '' } : {}) }))}
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

            {/* Per-Company Breakdown */}
            {companyBreakdowns.length > 0 && (
                <>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
                        Per-Company P&L
                    </h3>
                    <div className="compliance-grid" style={{ marginBottom: '24px' }}>
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
            )}

            {/* All Transactions List */}
            {transactions.length > 0 && (
                <div className="card">
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px', padding: '16px 16px 0' }}>
                        All Transactions
                    </h3>
                    <div className="treasury-list">
                        {transactions.map(txn => {
                            const company = companyMap[txn.company_id];
                            return (
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
                                                {txn.is_recurring && <span style={{ marginLeft: '6px', padding: '1px 6px', background: 'rgba(234,179,8,0.15)', borderRadius: '4px', fontSize: '0.65rem', color: '#eab308', fontWeight: 600 }}>Recurring</span>}
                                                {company && (
                                                    <>
                                                        {' '}·{' '}
                                                        <span className="color-dot" style={{ backgroundColor: company.color, width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block' }} />
                                                        {' '}{company.name}
                                                    </>
                                                )}
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
                            );
                        })}
                    </div>
                </div>
            )}

            {transactions.length === 0 && companyBreakdowns.length === 0 && (
                <div className="empty-state">
                    <div className="empty-state-icon"><Icon name="dollar" size={48} /></div>
                    <h3>No financial data yet</h3>
                    <p>Click "Add Transaction" above to start tracking cash flow across your companies.</p>
                </div>
            )}
        </AppLayout>
    );
}
