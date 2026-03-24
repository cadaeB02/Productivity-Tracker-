'use client';

// AppLayout is now a simple passthrough.
// The sidebar and auth protection are handled by PersistentLayout
// which lives at the root layout level and persists across navigations.
export default function AppLayout({ children }) {
    return <>{children}</>;
}
