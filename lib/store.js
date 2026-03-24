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
            // V6 Entity fields
            is_entity: config.is_entity || false,
            legal_name: config.legal_name || '',
            ein: config.ein || '',
            state_of_formation: config.state_of_formation || '',
            formation_date: config.formation_date || null,
            state_renewal_date: config.state_renewal_date || null,
            registered_agent: config.registered_agent || '',
            domains: config.domains || [],
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

// ==================== ENTITIES (V6) ====================

export async function getEntities() {
    const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('is_entity', true)
        .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
}

export async function updateEntityCompliance(id, fields) {
    // fields can include: legal_name, ein, state_of_formation, formation_date,
    //                     state_renewal_date, registered_agent, domains, is_entity
    const allowed = [
        'is_entity', 'legal_name', 'ein', 'state_of_formation',
        'formation_date', 'state_renewal_date', 'registered_agent', 'domains',
    ];
    const updates = {};
    for (const key of allowed) {
        if (key in fields) updates[key] = fields[key];
    }
    const { data, error } = await supabase
        .from('companies')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
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
    // Handle both date-only "2026-03-20" and datetime "2026-03-20T09:26:00"
    const startTime = new Date(date.includes('T') ? date : `${date}T00:00:00`);
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

export function downloadCSV(csvString, filename = 'parallax-export.csv') {
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

export async function getPayEstimate(companyId, dateRange = 'payperiod') {
    // Get the company's pay config
    const { data: company, error: compError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single();
    if (compError) throw compError;
    if (!company.pay_rate) return null;

    const r = (v) => Math.round(parseFloat(v) * 100) / 100;

    // Calculate date range for query
    const now = new Date();
    let periodStart, periodEnd, periodLabel;

    if (dateRange === 'today') {
        periodStart = new Date(now);
        periodStart.setHours(0, 0, 0, 0);
        periodEnd = new Date(now);
        periodEnd.setHours(23, 59, 59, 999);
        periodLabel = 'Today';
    } else if (dateRange === 'week') {
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - now.getDay());
        periodStart.setHours(0, 0, 0, 0);
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodEnd.getDate() + 7);
        periodLabel = 'This Week';
    } else if (dateRange === 'month') {
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        periodLabel = 'This Month';
    } else if (dateRange === 'all') {
        periodStart = new Date(2020, 0, 1);
        periodEnd = new Date(2099, 0, 1);
        periodLabel = 'All Time';
    } else {
        // 'payperiod' — use company's pay period config
        if (company.pay_period_start) {
            periodStart = new Date(company.pay_period_start);
            const periodDays = company.pay_period === 'weekly' ? 7 : company.pay_period === 'biweekly' ? 14 : 30;
            while (periodStart <= now) {
                const next = new Date(periodStart);
                next.setDate(next.getDate() + periodDays);
                if (next > now) break;
                periodStart = next;
            }
            periodEnd = new Date(periodStart);
            periodEnd.setDate(periodEnd.getDate() + periodDays);
        } else {
            periodStart = new Date(now);
            periodStart.setDate(now.getDate() - now.getDay());
            periodStart.setHours(0, 0, 0, 0);
            const periodDays = company.pay_period === 'weekly' ? 7 : company.pay_period === 'biweekly' ? 14 : 30;
            periodEnd = new Date(periodStart);
            periodEnd.setDate(periodEnd.getDate() + periodDays);
        }
        periodLabel = company.pay_period === 'weekly' ? 'Weekly' : company.pay_period === 'biweekly' ? 'Biweekly' : 'Monthly';
    }

    // Fetch sessions in this range
    const { data: sessions, error: sessError } = await supabase
        .from('sessions')
        .select('duration')
        .eq('company_id', companyId)
        .gte('start_time', periodStart.toISOString())
        .lte('start_time', periodEnd.toISOString())
        .not('end_time', 'is', null);
    if (sessError) throw sessError;

    const totalSeconds = (sessions || []).reduce((sum, s) => sum + (s.duration || 0), 0);
    const totalHours = totalSeconds / 3600;

    const payRate = r(company.pay_rate);
    const grossPay = totalHours * payRate;
    const preTaxDeductions = r(company.tax_deductions_pretax) || 0;
    const taxableIncome = Math.max(0, grossPay - preTaxDeductions);

    const federalTax = taxableIncome * (r(company.tax_federal_rate) / 100);
    const stateTax = taxableIncome * (r(company.tax_state_rate) / 100);
    const ficaTax = taxableIncome * (r(company.tax_fica_rate) / 100);
    const totalTax = federalTax + stateTax + ficaTax;
    const netPay = grossPay - preTaxDeductions - totalTax;

    const daysUntilPayday = Math.max(0, Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24)));

    return {
        companyName: company.name,
        companyColor: company.color,
        totalHours: Math.round(totalHours * 100) / 100,
        payRate,
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
        periodLabel,
        payPeriod: company.pay_period,
    };
}

// ==================== SCHEDULE BLOCKS ====================

export async function getScheduleBlocks(year, month) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0); // last day of month
    const endStr = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

    const { data, error } = await supabase
        .from('schedule_blocks')
        .select('*, companies(name, color)')
        .or(`date.gte.${startDate},is_recurring.eq.true`)
        .or(`date.lte.${endStr},date.is.null`)
        .order('start_time', { ascending: true });
    if (error) throw error;
    return data || [];
}

export async function addScheduleBlock(block) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
        .from('schedule_blocks')
        .insert({ ...block, user_id: user.id })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function updateScheduleBlock(id, updates) {
    const { data, error } = await supabase
        .from('schedule_blocks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteScheduleBlock(id) {
    const { error } = await supabase.from('schedule_blocks').delete().eq('id', id);
    if (error) throw error;
}

export async function addScheduleException(recurringBlockId, exceptionDate) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
        .from('schedule_blocks')
        .insert({
            user_id: user.id,
            is_exception: true,
            exception_date: exceptionDate,
            label: '',
            start_time: '00:00',
            end_time: '00:00',
            block_type: 'exception',
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function getExceptions(year, month) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0);
    const endStr = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

    const { data, error } = await supabase
        .from('schedule_blocks')
        .select('*')
        .eq('is_exception', true)
        .gte('exception_date', startDate)
        .lte('exception_date', endStr);
    if (error) throw error;
    return data || [];
}

// ==================== SCHEDULE TASKS ====================

export async function getScheduleTasks(filters = {}) {
    let query = supabase
        .from('schedule_tasks')
        .select('*, companies(name, color)')
        .order('created_at', { ascending: false });

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.date) query = query.eq('scheduled_date', filters.date);
    if (filters.unscheduled) query = query.is('scheduled_date', null);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function addScheduleTask(title, durationEstimate = 'unknown', description = '') {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
        .from('schedule_tasks')
        .insert({
            user_id: user.id,
            title,
            description,
            duration_estimate: durationEstimate,
            status: 'pending',
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function updateScheduleTask(id, updates) {
    const { data, error } = await supabase
        .from('schedule_tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteScheduleTask(id) {
    const { error } = await supabase.from('schedule_tasks').delete().eq('id', id);
    if (error) throw error;
}

export async function scheduleTask(id, date, startTime, endTime) {
    return updateScheduleTask(id, {
        scheduled_date: date,
        scheduled_start_time: startTime,
        scheduled_end_time: endTime,
        status: 'scheduled',
    });
}

// ==================== AUTO CLOCK RULES ====================

export async function getAutoClockRules() {
    const { data, error } = await supabase
        .from('auto_clock_rules')
        .select('*, companies(name, color), tasks(name), projects(name)')
        .order('day_of_week', { ascending: true });
    if (error) throw error;
    return data || [];
}

export async function addAutoClockRule(companyId, projectId, taskId, dayOfWeek, startTime, endTime = null) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
        .from('auto_clock_rules')
        .insert({
            user_id: user.id,
            company_id: companyId,
            project_id: projectId,
            task_id: taskId,
            day_of_week: dayOfWeek,
            start_time: startTime,
            end_time: endTime,
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function updateAutoClockRule(id, updates) {
    const { data, error } = await supabase
        .from('auto_clock_rules')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteAutoClockRule(id) {
    const { error } = await supabase.from('auto_clock_rules').delete().eq('id', id);
    if (error) throw error;
}

// ==================== SLEEP LOGS ====================

export async function getSleepLogs(year, month) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0);
    const endStr = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

    const { data, error } = await supabase
        .from('sleep_logs')
        .select('*')
        .gte('date', startDate)
        .lte('date', endStr)
        .order('date', { ascending: true });
    if (error) throw error;
    return data || [];
}

export async function getSleepLog(date) {
    const { data, error } = await supabase
        .from('sleep_logs')
        .select('*')
        .eq('date', date)
        .maybeSingle();
    if (error) throw error;
    return data;
}

export async function getAllSleepLogs(limit = 60) {
    const { data, error } = await supabase
        .from('sleep_logs')
        .select('*')
        .order('date', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data || [];
}

export async function deleteSleepLog(id) {
    const { error } = await supabase
        .from('sleep_logs')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

export async function upsertSleepLog(date, wakeTime, sleepTime, source = 'manual') {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
        .from('sleep_logs')
        .upsert({
            user_id: user.id,
            date,
            wake_time: wakeTime,
            sleep_time: sleepTime,
            source,
        }, { onConflict: 'user_id,date' })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function importSleepLogs(logs) {
    // logs = [{ date, wake_time, sleep_time }]
    const { data: { user } } = await supabase.auth.getUser();
    const rows = logs.map(l => ({
        user_id: user.id,
        date: l.date,
        wake_time: l.wake_time,
        sleep_time: l.sleep_time,
        source: 'apple_health',
    }));
    const { data, error } = await supabase
        .from('sleep_logs')
        .upsert(rows, { onConflict: 'user_id,date' })
        .select();
    if (error) throw error;
    return data;
}

// ==================== SESSION HELPERS ====================

export async function getSessionsForDate(date) {
    // date = 'YYYY-MM-DD'
    const dayStart = `${date}T00:00:00`;
    const dayEnd = `${date}T23:59:59`;

    // Sessions that started on this day
    const { data, error } = await supabase
        .from('sessions')
        .select('*, tasks(name), projects(name), companies(name, color)')
        .gte('start_time', dayStart)
        .lte('start_time', dayEnd)
        .order('start_time', { ascending: true });
    if (error) throw error;

    // Also include multi-day sessions that started before this day AND ended during/after it
    // (exclude end_time IS NULL — unclosed sessions only show on the day they started)
    const { data: spanning, error: err2 } = await supabase
        .from('sessions')
        .select('*, tasks(name), projects(name), companies(name, color)')
        .lt('start_time', dayStart)
        .gte('end_time', dayStart)
        .not('end_time', 'is', null);
    if (err2) throw err2;

    // Merge and dedupe
    const allSessions = [...(data || []), ...(spanning || [])];
    const seen = new Set();
    return allSessions.filter(s => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
    });
}

export async function getSessionsForMonth(year, month) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01T00:00:00`;
    const endOfMonth = new Date(year, month, 0);
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(endOfMonth.getDate()).padStart(2, '0')}T23:59:59`;

    const { data, error } = await supabase
        .from('sessions')
        .select('*, tasks(name), projects(name), companies(name, color)')
        .gte('start_time', startDate)
        .lte('start_time', endDate)
        .not('end_time', 'is', null)
        .order('start_time', { ascending: true });
    if (error) throw error;
    return data || [];
}
