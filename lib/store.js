'use client';

import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

// ==================== COMPANIES ====================

export async function getCompanies() {
    const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
}

export async function addCompany(name, color = '#6366f1', config = {}) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
        .from('companies')
        .insert({
            name,
            color,
            user_id: user.id,
            company_type: config.company_type || 'digital',
            pay_rate: config.pay_rate || null,
            pay_type: config.pay_type || 'hourly',
            pay_period: config.pay_period || 'biweekly',
            pay_period_start: config.pay_period_start || null,
            tax_federal_rate: config.tax_federal_rate ?? 12.00,
            tax_state_rate: config.tax_state_rate ?? 4.40,
            tax_fica_rate: config.tax_fica_rate ?? 7.65,
            tax_deductions_pretax: config.tax_deductions_pretax ?? 0,
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function updateCompany(id, updates) {
    const { data, error } = await supabase
        .from('companies')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteCompany(id) {
    const { error } = await supabase.from('companies').delete().eq('id', id);
    if (error) throw error;
}

// ==================== PROJECTS ====================

export async function getProjects(companyId) {
    let query = supabase.from('projects').select('*').order('created_at', { ascending: true });
    if (companyId) query = query.eq('company_id', companyId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
}

export async function getAllProjects() {
    const { data, error } = await supabase
        .from('projects')
        .select('*, companies(name, color)')
        .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
}

export async function addProject(companyId, name) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
        .from('projects')
        .insert({ company_id: companyId, name, user_id: user.id })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function updateProject(id, updates) {
    const { data, error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteProject(id) {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
}

// ==================== TASKS ====================

export async function getTasks(projectId) {
    let query = supabase.from('tasks').select('*').order('created_at', { ascending: true });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
}

export async function getAllTasks() {
    const { data, error } = await supabase
        .from('tasks')
        .select('*, projects(name, company_id, companies(name, color))')
        .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
}

export async function addTask(projectId, companyId, name) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
        .from('tasks')
        .insert({ project_id: projectId, company_id: companyId, name, user_id: user.id })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function updateTask(id, updates) {
    const { data, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteTask(id) {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) throw error;
}

// ==================== SESSIONS ====================

export async function startSession(taskId, projectId, companyId) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
        .from('sessions')
        .insert({
            task_id: taskId,
            project_id: projectId,
            company_id: companyId,
            start_time: new Date().toISOString(),
            user_id: user.id,
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function endSession(sessionId, summary = '', customDuration = null) {
    const endTime = new Date();
    // Get the session to calculate duration
    const { data: session } = await supabase
        .from('sessions')
        .select('start_time, paused_at, paused_duration')
        .eq('id', sessionId)
        .single();

    let duration;
    if (customDuration !== null) {
        // User manually adjusted the time
        duration = customDuration;
    } else {
        const startTime = new Date(session.start_time);
        const totalElapsed = Math.floor((endTime - startTime) / 1000);
        const pausedDur = session.paused_duration || 0;
        // If currently paused, add time since pause started
        let currentPauseGap = 0;
        if (session.paused_at) {
            currentPauseGap = Math.floor((endTime - new Date(session.paused_at)) / 1000);
        }
        duration = totalElapsed - pausedDur - currentPauseGap;
    }

    const { data, error } = await supabase
        .from('sessions')
        .update({
            end_time: endTime.toISOString(),
            duration: Math.max(0, duration),
            summary,
            paused_at: null,
        })
        .eq('id', sessionId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function updateSessionAISummary(sessionId, aiSummary) {
    const { data, error } = await supabase
        .from('sessions')
        .update({ ai_summary: aiSummary })
        .eq('id', sessionId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function addManualSession(taskId, projectId, companyId, date, durationSeconds, summary = '') {
    const { data: { user } } = await supabase.auth.getUser();
    const startTime = new Date(date);
    const endTime = new Date(startTime.getTime() + durationSeconds * 1000);

    const { data, error } = await supabase
        .from('sessions')
        .insert({
            task_id: taskId,
            project_id: projectId,
            company_id: companyId,
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            duration: durationSeconds,
            summary,
            is_manual: true,
            user_id: user.id,
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function getSessions(filters = {}) {
    let query = supabase
        .from('sessions')
        .select('*, tasks(name), projects(name), companies(name, color)')
        .order('start_time', { ascending: false });

    if (filters.companyId) query = query.eq('company_id', filters.companyId);
    if (filters.projectId) query = query.eq('project_id', filters.projectId);
    if (filters.taskId) query = query.eq('task_id', filters.taskId);
    if (filters.startDate) query = query.gte('start_time', filters.startDate);
    if (filters.endDate) query = query.lte('start_time', filters.endDate);

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

export async function getActiveSession() {
    const { data, error } = await supabase
        .from('sessions')
        .select('*, tasks(name), projects(name), companies(name, color)')
        .is('end_time', null)
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return data;
}

export async function getActiveSessions() {
    const { data, error } = await supabase
        .from('sessions')
        .select('*, tasks(name), projects(name), companies(name, color)')
        .is('end_time', null)
        .order('start_time', { ascending: true });
    if (error) throw error;
    return data || [];
}

export async function pauseSession(sessionId) {
    const { data, error } = await supabase
        .from('sessions')
        .update({ paused_at: new Date().toISOString() })
        .eq('id', sessionId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function resumeSession(sessionId) {
    // Get the session to calculate pause gap
    const { data: session } = await supabase
        .from('sessions')
        .select('paused_at, paused_duration')
        .eq('id', sessionId)
        .single();

    if (!session.paused_at) return session;

    const pauseStart = new Date(session.paused_at);
    const pauseGap = Math.floor((Date.now() - pauseStart.getTime()) / 1000);
    const newPausedDuration = (session.paused_duration || 0) + pauseGap;

    const { data, error } = await supabase
        .from('sessions')
        .update({
            paused_at: null,
            paused_duration: newPausedDuration,
        })
        .eq('id', sessionId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function updateSession(id, updates) {
    const { data, error } = await supabase
        .from('sessions')
        .update(updates)
        .eq('id', id)
        .select('*, tasks(name), projects(name), companies(name, color)')
        .single();
    if (error) throw error;
    return data;
}

export async function deleteSession(id) {
    const { error } = await supabase.from('sessions').delete().eq('id', id);
    if (error) throw error;
}

// ==================== STATS ====================

export async function getStats(dateRange = 'week') {
    const now = new Date();
    let startDate;

    switch (dateRange) {
        case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
        case 'week':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 7);
            break;
        case 'month':
            startDate = new Date(now);
            startDate.setMonth(now.getMonth() - 1);
            break;
        case 'all':
            startDate = new Date(0);
            break;
        default:
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 7);
    }

    const { data, error } = await supabase
        .from('sessions')
        .select('*, companies(name, color)')
        .gte('start_time', startDate.toISOString())
        .not('end_time', 'is', null)
        .order('start_time', { ascending: false });

    if (error) throw error;
    return data;
}

// ==================== EXPORT ====================

export function exportSessionsToCSV(sessions) {
    if (!sessions || sessions.length === 0) return '';

    const headers = ['Date', 'Company', 'Project', 'Task', 'Start Time', 'End Time', 'Duration (hrs)', 'Summary', 'AI Summary'];
    const rows = sessions.map((s) => {
        const date = new Date(s.start_time).toLocaleDateString();
        const start = new Date(s.start_time).toLocaleTimeString();
        const end = s.end_time ? new Date(s.end_time).toLocaleTimeString() : 'In Progress';
        const hours = (s.duration / 3600).toFixed(2);
        const company = s.companies?.name || '';
        const project = s.projects?.name || '';
        const task = s.tasks?.name || '';
        const escapeCsv = (str) => `"${(str || '').replace(/"/g, '""')}"`;
        return [date, company, project, task, start, end, hours, escapeCsv(s.summary), escapeCsv(s.ai_summary)].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
}

export function downloadCSV(csvString, filename = 'focusarch-export.csv') {
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}

// ==================== USER SETTINGS ====================

export async function getUserSettings() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
    if (error) throw error;
    return data;
}

export async function saveUserSettings(settings) {
    const { data: { user } } = await supabase.auth.getUser();
    // Upsert: insert if not exists, update if exists
    const { data, error } = await supabase
        .from('user_settings')
        .upsert({
            user_id: user.id,
            ...settings,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        .select()
        .single();
    if (error) throw error;
    return data;
}

// ==================== PAY ESTIMATES ====================

export async function getPayEstimate(companyId) {
    // Get the company's pay config
    const { data: company, error: compError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single();
    if (compError) throw compError;
    if (!company.pay_rate) return null;

    // Calculate pay period date range
    const now = new Date();
    let periodStart;
    if (company.pay_period_start) {
        periodStart = new Date(company.pay_period_start);
        // Advance to current period
        const periodDays = company.pay_period === 'weekly' ? 7 : company.pay_period === 'biweekly' ? 14 : 30;
        while (periodStart <= now) {
            const next = new Date(periodStart);
            next.setDate(next.getDate() + periodDays);
            if (next > now) break;
            periodStart = next;
        }
    } else {
        // Default: start of current week (Sunday)
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - now.getDay());
        periodStart.setHours(0, 0, 0, 0);
    }

    // Fetch sessions in this pay period
    const { data: sessions, error: sessError } = await supabase
        .from('sessions')
        .select('duration')
        .eq('company_id', companyId)
        .gte('start_time', periodStart.toISOString())
        .not('end_time', 'is', null);
    if (sessError) throw sessError;

    const totalSeconds = (sessions || []).reduce((sum, s) => sum + (s.duration || 0), 0);
    const totalHours = totalSeconds / 3600;

    const grossPay = totalHours * parseFloat(company.pay_rate);
    const preTaxDeductions = parseFloat(company.tax_deductions_pretax) || 0;
    const taxableIncome = Math.max(0, grossPay - preTaxDeductions);

    const federalTax = taxableIncome * (parseFloat(company.tax_federal_rate) / 100);
    const stateTax = taxableIncome * (parseFloat(company.tax_state_rate) / 100);
    const ficaTax = taxableIncome * (parseFloat(company.tax_fica_rate) / 100);
    const totalTax = federalTax + stateTax + ficaTax;
    const netPay = grossPay - preTaxDeductions - totalTax;

    // Calculate next payday
    const periodDays = company.pay_period === 'weekly' ? 7 : company.pay_period === 'biweekly' ? 14 : 30;
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + periodDays);
    const daysUntilPayday = Math.max(0, Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24)));

    return {
        companyName: company.name,
        companyColor: company.color,
        totalHours: Math.round(totalHours * 100) / 100,
        payRate: parseFloat(company.pay_rate),
        grossPay: Math.round(grossPay * 100) / 100,
        preTaxDeductions,
        federalTax: Math.round(federalTax * 100) / 100,
        stateTax: Math.round(stateTax * 100) / 100,
        ficaTax: Math.round(ficaTax * 100) / 100,
        totalTax: Math.round(totalTax * 100) / 100,
        netPay: Math.round(netPay * 100) / 100,
        daysUntilPayday,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        payPeriod: company.pay_period,
    };
}
