import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/merge-companies — merge child companies into a parent
// Moves all projects, tasks, sessions, transactions, and notes from children to parent
// Then deletes the empty child companies
export async function POST(request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { parentId, childIds } = await request.json();

        if (!parentId || !childIds || !Array.isArray(childIds) || childIds.length === 0) {
            return NextResponse.json({ error: 'parentId and childIds[] are required' }, { status: 400 });
        }

        if (childIds.includes(parentId)) {
            return NextResponse.json({ error: 'Parent company cannot be in the child list' }, { status: 400 });
        }

        // Verify all companies belong to this user
        const { data: companies } = await supabase
            .from('companies')
            .select('id')
            .eq('user_id', user.id)
            .in('id', [parentId, ...childIds]);

        if (!companies || companies.length !== childIds.length + 1) {
            return NextResponse.json({ error: 'One or more companies not found' }, { status: 404 });
        }

        const results = { projects: 0, tasks: 0, sessions: 0, transactions: 0, notes: 0 };

        // For each child company, create a project under parent with the child's name
        // then move all existing projects, tasks, sessions, transactions, notes
        for (const childId of childIds) {
            // Get child company name
            const { data: child } = await supabase
                .from('companies')
                .select('name')
                .eq('id', childId)
                .single();

            if (!child) continue;

            // Move projects: reassign company_id to parent
            const { data: movedProjects } = await supabase
                .from('projects')
                .update({ company_id: parentId })
                .eq('company_id', childId)
                .eq('user_id', user.id)
                .select('id');

            if (movedProjects) {
                results.projects += movedProjects.length;

                // Move tasks for those projects
                for (const proj of movedProjects) {
                    const { data: movedTasks } = await supabase
                        .from('tasks')
                        .update({ company_id: parentId })
                        .eq('project_id', proj.id)
                        .eq('user_id', user.id)
                        .select('id');
                    if (movedTasks) results.tasks += movedTasks.length;
                }
            }

            // Move orphaned tasks (tasks with company_id = childId but no project match)
            const { data: orphanTasks } = await supabase
                .from('tasks')
                .update({ company_id: parentId })
                .eq('company_id', childId)
                .eq('user_id', user.id)
                .select('id');
            if (orphanTasks) results.tasks += orphanTasks.length;

            // Move sessions
            const { data: movedSessions } = await supabase
                .from('sessions')
                .update({ company_id: parentId })
                .eq('company_id', childId)
                .eq('user_id', user.id)
                .select('id');
            if (movedSessions) results.sessions += movedSessions.length;

            // Move transactions
            const { data: movedTxns } = await supabase
                .from('transactions')
                .update({ company_id: parentId })
                .eq('company_id', childId)
                .eq('user_id', user.id)
                .select('id');
            if (movedTxns) results.transactions += movedTxns.length;

            // Move notes
            const { data: movedNotes } = await supabase
                .from('notes')
                .update({ company_id: parentId })
                .eq('company_id', childId)
                .eq('user_id', user.id)
                .select('id');
            if (movedNotes) results.notes += movedNotes.length;

            // Delete the empty child company
            await supabase
                .from('companies')
                .delete()
                .eq('id', childId)
                .eq('user_id', user.id);
        }

        return NextResponse.json({
            success: true,
            merged: childIds.length,
            moved: results,
        });
    } catch (err) {
        console.error('Merge companies error:', err);
        return NextResponse.json({ error: 'Failed to merge companies' }, { status: 500 });
    }
}
