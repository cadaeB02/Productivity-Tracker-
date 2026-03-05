'use client';

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
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

    // New item states
    const [newCompanyName, setNewCompanyName] = useState('');
    const [newCompanyColor, setNewCompanyColor] = useState(COMPANY_COLORS[0]);
    const [showNewCompany, setShowNewCompany] = useState(false);
    const [newProjectName, setNewProjectName] = useState({});
    const [newTaskName, setNewTaskName] = useState({});

    // Edit states
    const [editingCompany, setEditingCompany] = useState(null);
    const [editCompanyName, setEditCompanyName] = useState('');

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

    const handleAddCompany = async () => {
        if (!newCompanyName.trim()) return;
        await addCompany(newCompanyName.trim(), newCompanyColor);
        setNewCompanyName('');
        setShowNewCompany(false);
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
                            placeholder="e.g. Acme Corp"
                            value={newCompanyName}
                            onChange={(e) => setNewCompanyName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddCompany()}
                            autoFocus
                        />
                    </div>
                    <div className="input-group" style={{ marginBottom: '16px' }}>
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
                    <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
                        <button className="btn btn-primary" onClick={handleAddCompany}>Create</button>
                        <button className="btn btn-ghost" onClick={() => setShowNewCompany(false)}>Cancel</button>
                    </div>
                </div>
            )}

            {/* Companies List */}
            {companies.length === 0 && !showNewCompany ? (
                <div className="empty-state">
                    <div className="emoji">🏢</div>
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
                        const isExpanded = expanded[company.id] !== false; // default expanded

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
                                            company.name
                                        )}
                                    </h3>
                                    <div className="flex gap-2">
                                        <button
                                            className="btn-icon"
                                            title="Edit"
                                            onClick={() => {
                                                setEditingCompany(company.id);
                                                setEditCompanyName(company.name);
                                            }}
                                        >
                                            ✏️
                                        </button>
                                        <button
                                            className="btn-icon"
                                            title="Delete"
                                            onClick={() => handleDeleteCompany(company.id)}
                                        >
                                            🗑
                                        </button>
                                    </div>
                                </div>

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
                                                                ✕
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
                                                                        ✕
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
