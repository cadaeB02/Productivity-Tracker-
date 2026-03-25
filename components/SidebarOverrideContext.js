'use client';

import { createContext, useContext, useState } from 'react';

const SidebarOverrideContext = createContext({
    overrideContent: null,
    setOverrideContent: () => {},
});

export function SidebarOverrideProvider({ children }) {
    const [overrideContent, setOverrideContent] = useState(null);
    return (
        <SidebarOverrideContext.Provider value={{ overrideContent, setOverrideContent }}>
            {children}
        </SidebarOverrideContext.Provider>
    );
}

export function useSidebarOverride() {
    return useContext(SidebarOverrideContext);
}
