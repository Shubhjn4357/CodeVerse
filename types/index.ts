export type PathPrefix = "/" | string;

export interface DirectoryNode {
    name: string;
    path: string;
    type: "file" | "directory";
    children?: DirectoryNode[];
    content?: string; // if loaded
}

export type ThemeType = "dark" | "light" | "high-contrast";

export interface EditorSettings {
    theme: ThemeType;
    fontSize: number;
    wordWrap: "on" | "off";
    minimap: boolean;
}

export interface WorkspaceState {
    currentPath: string;
    openFiles: string[];
    activeFile: string | null;
    unsavedFiles: Set<string>;
}
