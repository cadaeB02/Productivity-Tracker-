'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/Icon';
import { useCompany } from '@/components/CompanyContext';
import { getDocuments, uploadDocument, deleteDocument, getDocumentDownloadUrl, getCompanies, toggleDocumentFlag, getTransactions, updateDocument, getVendors, addVendor, deleteVendor, getVendorSpend, getVendorDocCounts, reorderVendors } from '@/lib/store';
import { generateDocumentName, hasApiKey } from '@/lib/gemini';

const DOC_CATEGORIES = [
    { key: 'all', label: 'All Files', icon: 'folder' },
    { key: 'flagged', label: 'Flagged', icon: 'flag-filled' },
    { key: 'techstack', label: 'Tech Stack', icon: 'grid' },
    { key: 'agreement', label: 'Agreements', icon: 'clipboard' },
    { key: 'legal', label: 'Legal', icon: 'shield' },
    { key: 'tax', label: 'Tax', icon: 'dollar' },
    { key: 'invoice', label: 'Invoices', icon: 'dollar' },
    { key: 'receipt', label: 'Receipts', icon: 'dollar' },
    { key: 'general', label: 'General', icon: 'folder' },
];

const VENDOR_CATEGORIES = [
    { key: 'ai', label: 'AI', color: '#a855f7' },
    { key: 'hosting', label: 'Hosting', color: '#3b82f6' },
    { key: 'communication', label: 'Communication', color: '#22c55e' },
    { key: 'marketing', label: 'Marketing', color: '#f59e0b' },
    { key: 'automation', label: 'Automation', color: '#ec4899' },
    { key: 'software', label: 'Software', color: '#6366f1' },
    { key: 'analytics', label: 'Analytics', color: '#14b8a6' },
    { key: 'payments', label: 'Payments', color: '#8b5cf6' },
    { key: 'legal', label: 'Legal', color: '#64748b' },
    { key: 'other', label: 'Other', color: '#94a3b8' },
];

function getVendorLogo(website) {
    if (!website) return null;
    const domain = website.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fileIcon(type) {
    if (!type) return 'folder';
    if (type.includes('pdf')) return 'clipboard';
    if (type.includes('image')) return 'eye';
    if (type.includes('word') || type.includes('document')) return 'note';
    if (type.includes('sheet') || type.includes('excel')) return 'chart';
    return 'folder';
}

/**
 * Format a raw file_name into a clean human-readable display name.
 * Strips hashes, UUIDs, dashes, and extensions for instant readability.
 * If the document has a display_name set (from AI), use that instead.
 */
function formatDocName(doc) {
    // If a clean display_name is stored, prefer that
    if (doc.display_name) return doc.display_name;

    const raw = doc.file_name || '';

    // Strip the file extension
    let name = raw.replace(/\.[^/.]+$/, '');

    // Strip trailing UUIDs/hashes (8+ hex chars at the end, often after a dash)
    name = name.replace(/[-_][a-f0-9]{7,}$/i, '');

    // Replace dashes and underscores with spaces
    name = name.replace(/[-_]+/g, ' ');

    // Clean up double spaces
    name = name.replace(/\s{2,}/g, ' ').trim();

    // If we still have something ugly (very long or no spaces), just show first 40 chars
    if (name.length > 50) {
        name = name.substring(0, 47) + '...';
    }

    return name || raw;
}

export default function FilingPage() {
    const { activeCompanyId, activeCompany } = useCompany();
    const [documents, setDocuments] = useState([]);
    const [companies, setCompanies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('all');
    const [uploading, setUploading] = useState(false);
    const [showUpload, setShowUpload] = useState(false);
    const [uploadForm, setUploadForm] = useState({ category: 'general', description: '', company_id: '' });
    const fileInputRef = useRef(null);
    const [docCounts, setDocCounts] = useState({});
    const [previewDoc, setPreviewDoc] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [linkedTransaction, setLinkedTransaction] = useState(null);
    const [namingDocId, setNamingDocId] = useState(null);
    const [editingDocId, setEditingDocId] = useState(null);
    const [editingName, setEditingName] = useState('');

    // Vendor / Tech Stack state
    const [vendors, setVendors] = useState([]);
    const [vendorSpend, setVendorSpend] = useState({});
    const [vendorDocCounts, setVendorDocCounts] = useState({});
    const [showAddVendor, setShowAddVendor] = useState(false);
    const [vendorForm, setVendorForm] = useState({ name: '', website: '', category: 'software', color: '#6366f1' });
    const [selectedVendor, setSelectedVendor] = useState(null);
    const [vendorDocs, setVendorDocs] = useState([]);
    const [vendorTxns, setVendorTxns] = useState([]);
    const [vendorFilter, setVendorFilter] = useState('all');

    const loadDocs = useCallback(async () => {
        try {
            const filters = {};
            if (activeCompanyId) filters.companyId = activeCompanyId;
            if (activeTab !== 'all' && activeTab !== 'flagged') filters.category = activeTab;
            const [docs, comps] = await Promise.all([
                getDocuments(filters),
                getCompanies(),
            ]);
            const filteredDocs = activeTab === 'flagged' ? docs.filter(d => d.flagged) : docs;
            setDocuments(filteredDocs);
            comps.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
            setCompanies(comps);
        } catch (err) {
            console.error('Failed to load documents', err);
        }
        setLoading(false);
    }, [activeCompanyId, activeTab]);

    const loadCounts = useCallback(async () => {
        try {
            const filters = {};
            if (activeCompanyId) filters.companyId = activeCompanyId;
            const allDocs = await getDocuments(filters);
            const counts = { all: allDocs.length, flagged: allDocs.filter(d => d.flagged).length };
            DOC_CATEGORIES.filter(c => c.key !== 'all' && c.key !== 'flagged').forEach(cat => {
                counts[cat.key] = allDocs.filter(d => d.category === cat.key).length;
            });
            setDocCounts(counts);
        } catch (err) {
            console.error('Failed to load doc counts', err);
        }
    }, [activeCompanyId]);

    useEffect(() => {
        setLoading(true);
        loadDocs();
        loadCounts();
        if (activeTab === 'techstack') loadVendorData();
    }, [loadDocs, loadCounts, activeTab]);

    const loadVendorData = async () => {
        try {
            const filters = activeCompanyId ? { companyId: activeCompanyId } : {};
            const [v, spend, docCnts] = await Promise.all([
                getVendors(filters),
                getVendorSpend(filters),
                getVendorDocCounts(filters),
            ]);
            setVendors(v);
            setVendorSpend(spend);
            setVendorDocCounts(docCnts);
        } catch (err) {
            console.error('Failed to load vendor data', err);
        }
    };

    const handleAddVendor = async (e) => {
        e.preventDefault();
        const companyId = activeCompanyId || vendorForm.company_id;
        if (!companyId) { alert('Please select a company'); return; }
        try {
            await addVendor({ ...vendorForm, company_id: companyId });
            setShowAddVendor(false);
            setVendorForm({ name: '', website: '', category: 'software', color: '#6366f1' });
            loadVendorData();
        } catch (err) {
            console.error('Failed to add vendor', err);
            alert('Failed to add vendor: ' + err.message);
        }
    };

    const handleDeleteVendor = async (vendorId) => {
        if (!confirm('Delete this vendor? Documents and transactions will be unlinked.')) return;
        try {
            await deleteVendor(vendorId);
            setSelectedVendor(null);
            loadVendorData();
        } catch (err) {
            console.error('Failed to delete vendor', err);
        }
    };

    const openVendorDetail = async (vendor) => {
        setSelectedVendor(vendor);
        try {
            const [docs, txns] = await Promise.all([
                getDocuments({ companyId: vendor.company_id }),
                getTransactions({ companyId: vendor.company_id }),
            ]);
            setVendorDocs(docs.filter(d => d.vendor_id === vendor.id));
            setVendorTxns(txns.filter(t => t.vendor_id === vendor.id));
        } catch (err) {
            console.error('Failed to load vendor details', err);
        }
    };

    // ── AI Auto-naming on upload ──
    const handleUpload = async (e) => {
        e.preventDefault();
        const file = fileInputRef.current?.files?.[0];
        if (!file) return;

        const companyId = activeCompanyId || uploadForm.company_id;
        if (!companyId) { alert('Please select a company'); return; }

        setUploading(true);
        try {
            const doc = await uploadDocument({
                file,
                company_id: companyId,
                category: uploadForm.category,
                description: uploadForm.description,
            });

            setShowUpload(false);
            setUploadForm({ category: 'general', description: '', company_id: '' });
            if (fileInputRef.current) fileInputRef.current.value = '';
            loadDocs();
            loadCounts();

            // Fire-and-forget: AI-generate a clean display name
            if (hasApiKey() && doc?.id) {
                setNamingDocId(doc.id);
                try {
                    // If it's an image, read it for vision analysis
                    let imageData = null;
                    if (file.type?.startsWith('image/')) {
                        imageData = await readFileAsBase64(file);
                    }

                    const displayName = await generateDocumentName(
                        file.name,
                        uploadForm.description,
                        uploadForm.category,
                        imageData
                    );

                    if (displayName) {
                        await updateDocument(doc.id, { display_name: displayName });
                        loadDocs(); // Refresh to show the new name
                    }
                } catch (err) {
                    console.warn('AI naming failed, keeping original name:', err);
                }
                setNamingDocId(null);
            }
        } catch (err) {
            console.error('Upload failed:', err);
            alert('Upload failed: ' + err.message);
        }
        setUploading(false);
    };

    // Helper to read file as base64 data URL
    const readFileAsBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    // ── Inline rename ──
    const startRename = (doc) => {
        setEditingDocId(doc.id);
        setEditingName(doc.display_name || formatDocName(doc));
    };

    const saveRename = async () => {
        if (!editingDocId || !editingName.trim()) return;
        try {
            await updateDocument(editingDocId, { display_name: editingName.trim() });
            setEditingDocId(null);
            setEditingName('');
            loadDocs();
        } catch (err) {
            console.error('Rename failed:', err);
        }
    };

    const cancelRename = () => {
        setEditingDocId(null);
        setEditingName('');
    };

    // ── AI re-name existing doc ──
    const handleAiRename = async (doc) => {
        if (!hasApiKey()) return;
        setNamingDocId(doc.id);
        try {
            // Try to get the image for receipt analysis
            let imageData = null;
            if (doc.file_type?.includes('image')) {
                try {
                    const url = await getDocumentDownloadUrl(doc.file_url);
                    const response = await fetch(url);
                    const blob = await response.blob();
                    imageData = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                } catch {} // If image fetch fails, AI can still name from text
            }

            const displayName = await generateDocumentName(
                doc.file_name,
                doc.description,
                doc.category,
                imageData
            );

            if (displayName) {
                await updateDocument(doc.id, { display_name: displayName });
                loadDocs();
            }
        } catch (err) {
            console.warn('AI rename failed:', err);
        }
        setNamingDocId(null);
    };

    const handleDownload = async (doc) => {
        try {
            const url = await getDocumentDownloadUrl(doc.file_url);
            window.open(url, '_blank');
        } catch (err) {
            console.error('Download failed:', err);
        }
    };

    const handleDelete = async (doc) => {
        if (!confirm(`Delete "${formatDocName(doc)}"?`)) return;
        try {
            await deleteDocument(doc.id);
            loadDocs();
            loadCounts();
        } catch (err) {
            console.error('Delete failed:', err);
        }
    };

    const handleFlag = async (doc) => {
        try {
            await toggleDocumentFlag(doc.id, doc.flagged);
            loadDocs();
            loadCounts();
        } catch (err) {
            console.error('Flag failed:', err);
        }
    };

    const handlePreview = async (doc) => {
        setPreviewDoc(doc);
        setPreviewLoading(true);
        setLinkedTransaction(null);
        try {
            const url = await getDocumentDownloadUrl(doc.file_url);
            setPreviewUrl(url);
        } catch (err) {
            console.error('Preview URL failed:', err);
            setPreviewUrl(null);
        }
        // Fetch linked transaction if present
        if (doc.linked_type === 'transaction' && doc.linked_id) {
            try {
                const allTxns = await getTransactions({});
                const txn = allTxns.find(t => t.id === doc.linked_id);
                if (txn) setLinkedTransaction(txn);
            } catch (err) {
                console.error('Linked transaction lookup failed:', err);
            }
        }
        setPreviewLoading(false);
    };

    const closePreview = () => {
        setPreviewDoc(null);
        setPreviewUrl(null);
        setLinkedTransaction(null);
    };

    const companyMap = {};
    companies.forEach(c => { companyMap[c.id] = c; });

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
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {activeCompany && (
                        <span className="color-dot" style={{ backgroundColor: activeCompany.color, width: '12px', height: '12px', borderRadius: '50%' }} />
                    )}
                    <div>
                        <h2>{activeCompany ? `${activeCompany.name} — Filing` : 'Filing Cabinet'}</h2>
                        <p>Documents, agreements, and records</p>
                    </div>
                </div>
            </div>

            {/* Category Tabs */}
            <div className="notes-tabs" style={{ marginBottom: '16px' }}>
                {DOC_CATEGORIES.filter(cat => cat.key !== 'flagged' || (docCounts.flagged || 0) > 0).map(cat => (
                    <button
                        key={cat.key}
                        className={`notes-tab ${activeTab === cat.key ? 'active' : ''}`}
                        onClick={() => setActiveTab(cat.key)}
                    >
                        <Icon name={cat.icon} size={14} />
                        <span>{cat.label}</span>
                        {(docCounts[cat.key] || 0) > 0 && (
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                minWidth: '18px', height: '18px', borderRadius: '9px',
                                fontSize: '0.65rem', fontWeight: 700, padding: '0 5px',
                                background: cat.key === 'flagged' ? '#f59e0b' : 'var(--bg-elevated)',
                                color: cat.key === 'flagged' ? '#fff' : 'var(--text-muted)',
                                marginLeft: '4px',
                                animation: cat.key === 'flagged' ? 'pulse-badge 2s ease-in-out infinite' : 'none',
                            }}>
                                {docCounts[cat.key]}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Upload Button */}
            <div style={{ marginBottom: '16px' }}>
                <button className="btn btn-primary" onClick={() => setShowUpload(!showUpload)}>
                    <Icon name="plus" size={14} /> {showUpload ? 'Cancel' : 'Upload File'}
                </button>
            </div>

            {/* Upload Form */}
            {showUpload && (
                <div className="card" style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '12px' }}>Upload Document</h3>
                    <form onSubmit={handleUpload}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                            <div className="input-group">
                                <label>File</label>
                                <input
                                    ref={fileInputRef}
                                    className="input"
                                    type="file"
                                    required
                                    style={{ padding: '6px' }}
                                />
                            </div>
                            <div className="input-group">
                                <label>Category</label>
                                <select
                                    className="input"
                                    value={uploadForm.category}
                                    onChange={(e) => setUploadForm(f => ({ ...f, category: e.target.value }))}
                                >
                                    {DOC_CATEGORIES.filter(c => c.key !== 'all' && c.key !== 'flagged').map(c => (
                                        <option key={c.key} value={c.key}>{c.label}</option>
                                    ))}
                                </select>
                            </div>
                            {!activeCompanyId && (
                                <div className="input-group">
                                    <label>Company</label>
                                    <select
                                        className="input"
                                        value={uploadForm.company_id}
                                        onChange={(e) => setUploadForm(f => ({ ...f, company_id: e.target.value }))}
                                        required
                                    >
                                        <option value="">Select company...</option>
                                        {companies.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div className="input-group">
                                <label>Description (optional)</label>
                                <input
                                    className="input"
                                    placeholder="What is this document?"
                                    value={uploadForm.description}
                                    onChange={(e) => setUploadForm(f => ({ ...f, description: e.target.value }))}
                                />
                            </div>
                        </div>
                        {hasApiKey() && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                marginBottom: '12px', fontSize: '0.72rem', color: 'var(--text-muted)',
                            }}>
                                <Icon name="sparkle" size={12} style={{ color: 'var(--color-accent)' }} />
                                AI will auto-generate a clean display name after upload
                            </div>
                        )}
                        <button className="btn btn-primary" type="submit" disabled={uploading}>
                            <Icon name="save" size={14} /> {uploading ? 'Uploading...' : 'Upload'}
                        </button>
                    </form>
                </div>
            )}

            {/* ═══════════ TECH STACK VIEW ═══════════ */}
            {activeTab === 'techstack' ? (
                <div>
                    {/* Add Vendor + Category Filter */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button
                                className={`badge ${vendorFilter === 'all' ? 'badge-active' : ''}`}
                                onClick={() => setVendorFilter('all')}
                                style={{ cursor: 'pointer', padding: '4px 10px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 600, border: '1px solid var(--border-subtle)', background: vendorFilter === 'all' ? 'var(--gradient-accent)' : 'var(--bg-card)', color: vendorFilter === 'all' ? '#fff' : 'var(--text-secondary)' }}
                            >All</button>
                            {VENDOR_CATEGORIES.map(cat => {
                                const count = vendors.filter(v => v.category === cat.key).length;
                                if (count === 0 && vendorFilter !== cat.key) return null;
                                return (
                                    <button
                                        key={cat.key}
                                        onClick={() => setVendorFilter(vendorFilter === cat.key ? 'all' : cat.key)}
                                        style={{
                                            cursor: 'pointer', padding: '4px 10px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 600,
                                            border: `1px solid ${vendorFilter === cat.key ? cat.color : 'var(--border-subtle)'}`,
                                            background: vendorFilter === cat.key ? `${cat.color}20` : 'var(--bg-card)',
                                            color: vendorFilter === cat.key ? cat.color : 'var(--text-secondary)',
                                        }}
                                    >{cat.label} ({count})</button>
                                );
                            })}
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowAddVendor(!showAddVendor)}>
                            <Icon name="plus" size={12} /> {showAddVendor ? 'Cancel' : 'Add Vendor'}
                        </button>
                    </div>

                    {/* Add Vendor Form */}
                    {showAddVendor && (
                        <div className="card" style={{ marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '12px' }}>Add Vendor / Service</h3>
                            <form onSubmit={handleAddVendor}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                                    <div className="input-group">
                                        <label>Vendor Name *</label>
                                        <input className="input" placeholder="e.g. Google, Supabase" value={vendorForm.name} onChange={e => setVendorForm(f => ({ ...f, name: e.target.value }))} required />
                                    </div>
                                    <div className="input-group">
                                        <label>Website</label>
                                        <input className="input" placeholder="e.g. google.com" value={vendorForm.website} onChange={e => setVendorForm(f => ({ ...f, website: e.target.value }))} />
                                    </div>
                                    <div className="input-group">
                                        <label>Category</label>
                                        <select className="input" value={vendorForm.category} onChange={e => setVendorForm(f => ({ ...f, category: e.target.value }))}>
                                            {VENDOR_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                                        </select>
                                    </div>
                                    <div className="input-group">
                                        <label>Brand Color</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input type="color" value={vendorForm.color} onChange={e => setVendorForm(f => ({ ...f, color: e.target.value }))} style={{ width: '40px', height: '36px', border: 'none', borderRadius: '6px', cursor: 'pointer' }} />
                                            <input className="input" value={vendorForm.color} onChange={e => setVendorForm(f => ({ ...f, color: e.target.value }))} style={{ flex: 1, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }} />
                                        </div>
                                    </div>
                                    {!activeCompanyId && (
                                        <div className="input-group">
                                            <label>Company *</label>
                                            <select className="input" value={vendorForm.company_id || ''} onChange={e => setVendorForm(f => ({ ...f, company_id: e.target.value }))} required>
                                                <option value="">Select company...</option>
                                                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </select>
                                        </div>
                                    )}
                                </div>
                                <button className="btn btn-primary" type="submit">
                                    <Icon name="save" size={14} /> Add Vendor
                                </button>
                            </form>
                        </div>
                    )}

                    {/* Vendor Grid with Drag & Drop */}
                    {vendors.filter(v => vendorFilter === 'all' || v.category === vendorFilter).length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon"><Icon name="grid" size={48} /></div>
                            <h3>No vendors yet</h3>
                            <p>Add your tech stack — tools, platforms, and services you use.</p>
                        </div>
                    ) : (
                        <div
                            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}
                        >
                            {vendors
                                .filter(v => vendorFilter === 'all' || v.category === vendorFilter)
                                .map((vendor, index) => {
                                    const spend = vendorSpend[vendor.id] || { total: 0, monthly: 0, count: 0 };
                                    const docCount = vendorDocCounts[vendor.id] || 0;
                                    const logo = getVendorLogo(vendor.website);
                                    const catInfo = VENDOR_CATEGORIES.find(c => c.key === vendor.category);

                                    return (
                                        <div
                                            key={vendor.id}
                                            className="card"
                                            draggable
                                            onDragStart={(e) => {
                                                e.dataTransfer.setData('vendorId', vendor.id);
                                                e.dataTransfer.setData('vendorIndex', index.toString());
                                                e.currentTarget.style.opacity = '0.5';
                                            }}
                                            onDragEnd={(e) => {
                                                e.currentTarget.style.opacity = '1';
                                            }}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                e.currentTarget.style.borderColor = vendor.color || 'var(--color-accent)';
                                            }}
                                            onDragLeave={(e) => {
                                                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                                            }}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                                                const draggedId = e.dataTransfer.getData('vendorId');
                                                if (draggedId === vendor.id) return;
                                                const filtered = vendors.filter(v => vendorFilter === 'all' || v.category === vendorFilter);
                                                const currentIds = filtered.map(v => v.id);
                                                const fromIndex = currentIds.indexOf(draggedId);
                                                const toIndex = currentIds.indexOf(vendor.id);
                                                if (fromIndex === -1 || toIndex === -1) return;
                                                const reordered = [...currentIds];
                                                reordered.splice(fromIndex, 1);
                                                reordered.splice(toIndex, 0, draggedId);
                                                // Optimistic update
                                                const reorderedVendors = reordered.map((id, i) => {
                                                    const v = vendors.find(x => x.id === id);
                                                    return { ...v, display_order: i };
                                                });
                                                setVendors(prev => {
                                                    const unchanged = prev.filter(v => !reordered.includes(v.id));
                                                    return [...reorderedVendors, ...unchanged].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
                                                });
                                                reorderVendors(reordered);
                                            }}
                                            onClick={() => openVendorDetail(vendor)}
                                            style={{
                                                cursor: 'grab', padding: '16px', position: 'relative', overflow: 'hidden',
                                                borderTop: `3px solid ${vendor.color || 'var(--color-accent)'}`,
                                                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
                                        >
                                            {/* Logo + Name */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                                {logo ? (
                                                    <img
                                                        src={logo}
                                                        alt={vendor.name}
                                                        style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'white', padding: '2px' }}
                                                        onError={(e) => { e.target.style.display = 'none'; }}
                                                    />
                                                ) : (
                                                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: vendor.color || 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem', color: '#fff' }}>
                                                        {vendor.name.charAt(0)}
                                                    </div>
                                                )}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: '0.88rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {vendor.name}
                                                    </div>
                                                    {catInfo && (
                                                        <div style={{ fontSize: '0.62rem', fontWeight: 600, color: catInfo.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                            {catInfo.label}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Spend + Docs */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                                <div>
                                                    {spend.total > 0 ? (
                                                        <>
                                                            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>{formatCurrency(spend.total)}</div>
                                                            {spend.monthly > 0 && (
                                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{formatCurrency(spend.monthly)}/mo</div>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No spend yet</div>
                                                    )}
                                                </div>
                                                {(docCount > 0 || spend.count > 0) && (
                                                    <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                                                        {docCount > 0 && <div>{docCount} doc{docCount !== 1 ? 's' : ''}</div>}
                                                        {spend.count > 0 && <div>{spend.count} txn{spend.count !== 1 ? 's' : ''}</div>}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Drag handle hint */}
                                            <div style={{ position: 'absolute', top: '6px', right: '6px', color: 'var(--text-muted)', opacity: 0.3 }}>
                                                <Icon name="grid" size={10} />
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}

                    {/* Vendor Detail Modal */}
                    {selectedVendor && (
                        <div className="modal-overlay" onClick={() => setSelectedVendor(null)}>
                            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                                {/* Vendor Header */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                                    {getVendorLogo(selectedVendor.website) ? (
                                        <img src={getVendorLogo(selectedVendor.website)} alt="" style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'white', padding: '2px' }} />
                                    ) : (
                                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: selectedVendor.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.1rem', color: '#fff' }}>
                                            {selectedVendor.name.charAt(0)}
                                        </div>
                                    )}
                                    <div style={{ flex: 1 }}>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{selectedVendor.name}</h3>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                            {VENDOR_CATEGORIES.find(c => c.key === selectedVendor.category)?.label || selectedVendor.category}
                                            {selectedVendor.website && <> · {selectedVendor.website}</>}
                                        </div>
                                    </div>
                                    <button className="btn-icon" onClick={() => setSelectedVendor(null)}><Icon name="close" size={18} /></button>
                                </div>

                                {/* Spend Summary */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                                    {[
                                        { label: 'Total Spend', value: formatCurrency(vendorSpend[selectedVendor.id]?.total || 0) },
                                        { label: 'This Month', value: formatCurrency(vendorSpend[selectedVendor.id]?.monthly || 0) },
                                        { label: 'Transactions', value: vendorSpend[selectedVendor.id]?.count || 0 },
                                    ].map(s => (
                                        <div key={s.label} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '12px', textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
                                            <div style={{ fontSize: '1rem', fontWeight: 800, marginTop: '4px' }}>{s.value}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Documents */}
                                {vendorDocs.length > 0 && (
                                    <div style={{ marginBottom: '16px' }}>
                                        <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                            <Icon name="folder" size={12} className="icon-inline" /> Documents ({vendorDocs.length})
                                        </h4>
                                        {vendorDocs.map(doc => (
                                            <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', marginBottom: '4px', border: '1px solid var(--border-subtle)' }}>
                                                <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{formatDocName(doc)}</div>
                                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{formatDate(doc.created_at)}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Transactions */}
                                {vendorTxns.length > 0 && (
                                    <div style={{ marginBottom: '16px' }}>
                                        <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                            <Icon name="dollar" size={12} className="icon-inline" /> Transactions ({vendorTxns.length})
                                        </h4>
                                        {vendorTxns.slice(0, 10).map(txn => (
                                            <div key={txn.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', marginBottom: '4px', border: '1px solid var(--border-subtle)' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{txn.description}</div>
                                                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{txn.date} · {txn.category}</div>
                                                </div>
                                                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: txn.type === 'expense' ? 'var(--color-danger)' : 'var(--color-success)' }}>
                                                    {txn.type === 'expense' ? '-' : '+'}{formatCurrency(txn.amount)}
                                                </div>
                                            </div>
                                        ))}
                                        {vendorTxns.length > 10 && (
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', padding: '8px' }}>
                                                + {vendorTxns.length - 10} more transactions
                                            </div>
                                        )}
                                    </div>
                                )}

                                {vendorDocs.length === 0 && vendorTxns.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                        No documents or transactions linked yet.
                                        <br /><span style={{ fontSize: '0.72rem' }}>Upload receipts or scan expenses to auto-file under this vendor.</span>
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="modal-actions">
                                    {selectedVendor.website && (
                                        <a href={`https://${selectedVendor.website}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ textDecoration: 'none' }}>
                                            <Icon name="link" size={14} /> Visit Site
                                        </a>
                                    )}
                                    <button className="btn btn-ghost" style={{ color: 'var(--color-danger)' }} onClick={() => handleDeleteVendor(selectedVendor.id)}>
                                        <Icon name="trash" size={14} /> Delete Vendor
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
            /* ═══════════ DOCUMENTS LIST ═══════════ */
            <>
            {/* Documents List */}
            {documents.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon"><Icon name="folder" size={48} /></div>
                    <h3>No documents yet</h3>
                    <p>{activeCompany
                        ? 'Upload agreements, contracts, and records for this company.'
                        : 'Select a company or upload documents from the global view.'}</p>
                </div>
            ) : (
                <div className="filing-list">
                    {documents.map(doc => {
                        const company = companyMap[doc.company_id];
                        const isNaming = namingDocId === doc.id;
                        const isEditing = editingDocId === doc.id;

                        return (
                            <div key={doc.id} className="filing-row">
                                <div className="filing-row-icon">
                                    <Icon name={fileIcon(doc.file_type)} size={20} />
                                </div>
                                <div className="filing-row-info">
                                    {isEditing ? (
                                        <div className="filing-rename-row">
                                            <input
                                                className="input filing-rename-input"
                                                value={editingName}
                                                onChange={(e) => setEditingName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') saveRename();
                                                    if (e.key === 'Escape') cancelRename();
                                                }}
                                                autoFocus
                                            />
                                            <button className="btn-icon" onClick={saveRename} title="Save"><Icon name="check" size={14} /></button>
                                            <button className="btn-icon" onClick={cancelRename} title="Cancel"><Icon name="close" size={14} /></button>
                                        </div>
                                    ) : (
                                        <div
                                            className="filing-row-name"
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => handlePreview(doc)}
                                        >
                                            {isNaming ? (
                                                <span className="filing-naming">
                                                    <Icon name="sparkle" size={12} style={{ color: 'var(--color-accent)' }} />
                                                    Generating name...
                                                </span>
                                            ) : (
                                                formatDocName(doc)
                                            )}
                                        </div>
                                    )}
                                    <div className="filing-row-meta">
                                        {formatDate(doc.created_at)}
                                        {doc.description && <> &middot; {doc.description}</>}
                                        {/* Show original filename as hint if display_name is set */}
                                        {doc.display_name && (
                                            <> &middot; <span style={{ opacity: 0.5, fontSize: '0.7rem' }}>{doc.file_name}</span></>
                                        )}
                                        {!activeCompanyId && company && (
                                            <>
                                                {' '}&middot;{' '}
                                                <span className="color-dot" style={{ backgroundColor: company.color, width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block' }} />
                                                {' '}{company.name}
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="filing-row-details">
                                    <span className="filing-category-badge">{doc.category}</span>
                                    <span className="filing-size">{formatFileSize(doc.file_size)}</span>
                                </div>
                                <div className="filing-row-actions">
                                    {/* AI rename button */}
                                    {hasApiKey() && (
                                        <button
                                            className="btn-icon"
                                            onClick={() => handleAiRename(doc)}
                                            title="AI rename"
                                            disabled={isNaming}
                                            style={{ color: isNaming ? 'var(--color-accent)' : undefined }}
                                        >
                                            <Icon name="sparkle" size={14} />
                                        </button>
                                    )}
                                    <button
                                        className="btn-icon"
                                        onClick={() => startRename(doc)}
                                        title="Rename"
                                    >
                                        <Icon name="edit" size={14} />
                                    </button>
                                    <button
                                        className="btn-icon"
                                        onClick={() => handleFlag(doc)}
                                        title={doc.flagged ? 'Unflag' : 'Flag for review'}
                                        style={{ color: doc.flagged ? '#f59e0b' : undefined }}
                                    >
                                        <Icon name={doc.flagged ? 'flag-filled' : 'flag'} size={14} />
                                    </button>
                                    <button className="btn-icon" onClick={() => handlePreview(doc)} title="Preview">
                                        <Icon name="eye" size={14} />
                                    </button>
                                    <button className="btn-icon" onClick={() => handleDownload(doc)} title="Download">
                                        <Icon name="download" size={14} />
                                    </button>
                                    <button className="btn-icon" onClick={() => handleDelete(doc)} title="Delete">
                                        <Icon name="trash" size={14} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            </>
            )}
            {/* Preview Modal */}
            {previewDoc && (
                <div className="modal-overlay" onClick={closePreview}>
                    <div className="modal-content" style={{ maxWidth: '800px', width: '90vw', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{formatDocName(previewDoc)}</h3>
                            <button className="btn-icon" onClick={closePreview}><Icon name="close" size={18} /></button>
                        </div>

                        {previewLoading ? (
                            <div style={{ textAlign: 'center', padding: '40px' }}><div className="loading-spinner" /></div>
                        ) : (
                            <>
                                {/* Receipt Image */}
                                {previewUrl && previewDoc.file_type?.includes('image') ? (
                                    <div style={{ textAlign: 'center', marginBottom: '16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '16px' }}>
                                        <img
                                            src={previewUrl}
                                            alt={formatDocName(previewDoc)}
                                            style={{ maxWidth: '100%', maxHeight: '50vh', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}
                                        />
                                    </div>
                                ) : previewUrl && previewDoc.file_type?.includes('pdf') ? (
                                    <div style={{ marginBottom: '16px' }}>
                                        <iframe src={previewUrl} style={{ width: '100%', height: '50vh', border: 'none', borderRadius: 'var(--radius-md)' }} />
                                    </div>
                                ) : previewUrl ? (
                                    <div style={{ textAlign: 'center', padding: '24px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', marginBottom: '16px' }}>
                                        <Icon name="folder" size={48} />
                                        <p style={{ marginTop: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Preview not available for this file type</p>
                                    </div>
                                ) : null}

                                {/* Document Details */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                    <div>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Category</div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{previewDoc.category}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Uploaded</div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{formatDate(previewDoc.created_at)}</div>
                                    </div>
                                    {previewDoc.description && (
                                        <div style={{ gridColumn: '1 / -1' }}>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Description</div>
                                            <div style={{ fontSize: '0.85rem' }}>{previewDoc.description}</div>
                                        </div>
                                    )}
                                    {previewDoc.display_name && previewDoc.file_name && (
                                        <div style={{ gridColumn: '1 / -1' }}>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Original Filename</div>
                                            <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>{previewDoc.file_name}</div>
                                        </div>
                                    )}
                                    {!activeCompanyId && companyMap[previewDoc.company_id] && (
                                        <div>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Company</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                                                <span className="color-dot" style={{ backgroundColor: companyMap[previewDoc.company_id].color, width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' }} />
                                                {companyMap[previewDoc.company_id].name}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Linked Transaction */}
                                {linkedTransaction && (
                                    <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '14px', border: '1px solid var(--border-subtle)' }}>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>Linked Transaction</div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{linkedTransaction.description}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                    {formatDate(linkedTransaction.date + 'T00:00:00')} &middot; {linkedTransaction.category}
                                                    {linkedTransaction.is_recurring && <span style={{ marginLeft: '6px', padding: '1px 6px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 600, background: 'rgba(139,92,246,0.15)', color: 'var(--color-accent)' }}>RECURRING</span>}
                                                </div>
                                            </div>
                                            <div style={{
                                                fontSize: '1.1rem',
                                                fontWeight: 800,
                                                color: linkedTransaction.type === 'expense' ? 'var(--color-danger)' : 'var(--color-success)',
                                            }}>
                                                {linkedTransaction.type === 'expense' ? '-' : '+'}
                                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(linkedTransaction.amount)}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
                                    <button className="btn btn-ghost" onClick={() => { handleDownload(previewDoc); }}>
                                        <Icon name="download" size={14} /> Download
                                    </button>
                                    <button className="btn btn-ghost" style={{ color: 'var(--color-danger)' }} onClick={() => { handleDelete(previewDoc); closePreview(); }}>
                                        <Icon name="trash" size={14} /> Delete
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </AppLayout>
    );
}
