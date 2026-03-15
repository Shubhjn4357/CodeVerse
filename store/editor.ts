import { create } from 'zustand';
import { WorkspaceState, EditorSettings } from '../types';

interface AppState extends WorkspaceState {
    settings: EditorSettings;

    // Actions
    openFile: (path: string) => void;
    closeFile: (path: string) => void;
    setActiveFile: (path: string) => void;
    markUnsaved: (path: string, unsaved: boolean) => void;
    updateSettings: (settings: Partial<EditorSettings>) => void;
}

export const useAppStore = create<AppState>((set) => ({
    currentPath: '',
    openFiles: [],
    activeFile: null,
    unsavedFiles: new Set(),
    settings: {
        theme: 'dark',
        fontSize: 14,
        wordWrap: 'off',
        minimap: true
    },

    openFile: (path) => set((state) => {
        if (state.openFiles.includes(path)) {
            return { activeFile: path };
        }
        return {
            openFiles: [...state.openFiles, path],
            activeFile: path
        };
    }),

    closeFile: (path) => set((state) => {
        const newOpen = state.openFiles.filter(p => p !== path);
        const newUnsaved = new Set(state.unsavedFiles);
        newUnsaved.delete(path);

        let newActive = state.activeFile;
        if (newActive === path) {
            newActive = newOpen.length > 0 ? newOpen[newOpen.length - 1] : null;
        }

        return {
            openFiles: newOpen,
            activeFile: newActive,
            unsavedFiles: newUnsaved
        };
    }),

    setActiveFile: (path) => set({ activeFile: path }),

    markUnsaved: (path, unsaved) => set((state) => {
        const newSet = new Set(state.unsavedFiles);
        if (unsaved) newSet.add(path);
        else newSet.delete(path);
        return { unsavedFiles: newSet };
    }),

    updateSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings }
    }))
}));
