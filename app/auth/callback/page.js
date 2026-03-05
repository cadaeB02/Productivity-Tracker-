'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function AuthCallbackPage() {
    useEffect(() => {
        const supabase = createClient();
        supabase.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_IN') {
                window.location.href = '/';
            }
        });
    }, []);

    return (
        <div className="loading-page">
            <div className="loading-spinner" />
        </div>
    );
}
