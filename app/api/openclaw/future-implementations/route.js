import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

function verifyServerKey(request) {
    const serverKey = process.env.OPENCLAW_SERVER_KEY;
    if (!serverKey) return { error: 'OPENCLAW_SERVER_KEY not configured', status: 500 };
    const auth = request.headers.get('authorization');
    if (!auth || !auth.startsWith('Bearer ')) return { error: 'Missing authorization header', status: 401 };
    if (auth.replace('Bearer ', '').trim() !== serverKey) return { error: 'Invalid server key', status: 403 };
    return null;
}

const IMPL_FILE = join(process.cwd(), '.openclaw', 'future-implementations.json');

function loadImplementations() {
    if (!existsSync(IMPL_FILE)) {
        return { version: '1.0', last_updated: new Date().toISOString().split('T')[0], items: [] };
    }
    try {
        return JSON.parse(readFileSync(IMPL_FILE, 'utf8'));
    } catch {
        return { version: '1.0', last_updated: new Date().toISOString().split('T')[0], items: [] };
    }
}

function saveImplementations(data) {
    data.last_updated = new Date().toISOString().split('T')[0];
    writeFileSync(IMPL_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// GET /api/openclaw/future-implementations - read the agent's backlog
export async function GET(request) {
    const authError = verifyServerKey(request);
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');

        const data = loadImplementations();
        let items = data.items || [];

        if (status) {
            items = items.filter(i => i.status === status);
        }

        return NextResponse.json({
            total: items.length,
            items,
        });
    } catch (err) {
        console.error('Future implementations read error:', err);
        return NextResponse.json({ error: 'Failed to read implementations' }, { status: 500 });
    }
}

// POST /api/openclaw/future-implementations - agent logs a new feature request
export async function POST(request) {
    const authError = verifyServerKey(request);
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

    try {
        const body = await request.json();
        const { title, description, priority, category } = body;

        if (!title || !description) {
            return NextResponse.json({ error: 'title and description are required' }, { status: 400 });
        }

        const data = loadImplementations();
        const nextId = `FI-${String((data.items || []).length + 1).padStart(3, '0')}`;

        const newItem = {
            id: nextId,
            title,
            description,
            requested_by: 'openclaw',
            date: new Date().toISOString().split('T')[0],
            priority: priority || 'medium',
            status: 'proposed',
            category: category || 'general',
        };

        data.items.push(newItem);
        saveImplementations(data);

        return NextResponse.json({ success: true, item: newItem }, { status: 201 });
    } catch (err) {
        console.error('Future implementations write error:', err);
        return NextResponse.json({ error: 'Failed to save implementation' }, { status: 500 });
    }
}

// PATCH /api/openclaw/future-implementations - update status of an item
export async function PATCH(request) {
    const authError = verifyServerKey(request);
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

    try {
        const body = await request.json();
        const { id, status: newStatus } = body;

        if (!id || !newStatus) {
            return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
        }

        const data = loadImplementations();
        const item = data.items.find(i => i.id === id);
        if (!item) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        }

        item.status = newStatus;
        saveImplementations(data);

        return NextResponse.json({ success: true, item });
    } catch (err) {
        console.error('Future implementations update error:', err);
        return NextResponse.json({ error: 'Failed to update implementation' }, { status: 500 });
    }
}
