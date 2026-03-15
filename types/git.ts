export interface GitBranch {
    name: string;
    current: boolean;
    commit: string;
}

export interface GitStatus {
    staged: string[];
    modified: string[];
    untracked: string[];
    deleted: string[];
    conflicted: string[];
    ignored: string[];
    currentBranch: string;
    behind: number;
    ahead: number;
}

export interface GitCommit {
    hash: string;
    date: string;
    message: string;
    refs: string;
    body: string;
    author_name: string;
    author_email: string;
}

export interface GitDiffRecord {
    file: string;
    diff: string;
}
