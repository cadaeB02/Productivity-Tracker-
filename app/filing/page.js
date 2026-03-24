'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/Icon';
import { useCompany } from '@/components/CompanyContext';
import { getDocuments, uploadDocument, deleteDocument, getDocumentDownloadUrl, getCompanies, toggleDocumentFlag } from '@/lib/store';

const DOC_CATEGORIES = [
    { key: 'all', label: 'All Files', icon: 'folder' },
    { key: 'flagged', label: 'Flagged', icon: 'flag-filled' },
    { key: 'agreement', label: 'Agreements', icon: 'clipboard' },
    { key: 'legal', label: 'Legal', icon: 'shield' },
    { key: 'tax', label: 'Tax', icon: 'dollar' },
    { key: 'invoice', label: 'Invoices', icon: 'dollar' },
    { key: 'receipt', label: 'Receipts', icon: 'dollar' },
    { key: 'general', label: 'General', icon: 'folder' },
];

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
    }, [loadDocs, loadCounts]);

    const handleUpload = async (e) => {
        e.preventDefault();
        const file = fileInputRef.current?.files?.[0];
        if (!file) return;

        const companyId = activeCompanyId || uploadForm.company_id;
        if (!companyId) { alert('Please select a company'); return; }

        setUploading(true);
        try {
            await uploadDocument({
                file,
                company_id: companyId,
                category: uploadForm.category,
                description: uploadForm.description,
            });
            setShowUpload(false);
            setUploadForm({ category: 'general', description: '', company_id: '' });
            if (fileInputRef.current) fileInputRef.current.value = '';
            loadDocs();
        } catch (err) {
            console.error('Upload failed:', err);
            alert('Upload failed: ' + err.message);
        }
        setUploading(false);
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
        if (!confirm(`Delete "${doc.file_name}"?`)) return;
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
                                    {DOC_CATEGORIES.filter(c => c.key !== 'all').map(c => (
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
                        <button className="btn btn-primary" type="submit" disabled={uploading}>
                            <Icon name="save" size={14} /> {uploading ? 'Uploading...' : 'Upload'}
                        </button>
                    </form>
                </div>
            )}

            {/* Documents List */}
            {documents.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon"><Icon name="folder" size={48} /></div>
                    <h3>No documents yet</h3>
                    <p>{activeCompany
                        ? 'Upload agreements, contracts, and records for this company.'
                        : 'Select a company or upload documents from the global view.'}
                    </p>
                </div>
            ) : (
                <div className="filing-list">
                    {documents.map(doc => {
                        const company = companyMap[doc.company_id];
                        return (
                            <div key={doc.id} className="filing-row">
                                <div className="filing-row-icon">
                                    <Icon name={fileIcon(doc.file_type)} size={20} />
                                </div>
                                <div className="filing-row-info">
                                    <div className="filing-row-name">{doc.file_name}</div>
                                    <div className="filing-row-meta">
                                        {formatDate(doc.created_at)}
                                        {doc.description && <> &middot; {doc.description}</>}
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
                                    <button
                                        className="btn-icon"
                                        onClick={() => handleFlag(doc)}
                                        title={doc.flagged ? 'Unflag' : 'Flag for review'}
                                        style={{ color: doc.flagged ? '#f59e0b' : undefined }}
                                    >
                                        <Icon name={doc.flagged ? 'flag-filled' : 'flag'} size={14} />
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
        </AppLayout>
    );
}
