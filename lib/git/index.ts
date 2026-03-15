import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';

const WORKSPACE_ROOT = process.cwd();

const options: Partial<SimpleGitOptions> = {
    baseDir: WORKSPACE_ROOT,
    binary: 'git',
    maxConcurrentProcesses: 6,
    trimmed: false,
};

export const git: SimpleGit = simpleGit(options);

export async function getGitStatus() {
    const isRepo = await git.checkIsRepo();
    if (!isRepo) return null;

    const status = await git.status();
    return {
        currentBranch: status.current,
        modified: status.modified,
        staged: status.staged,
        untracked: status.not_added,
        deleted: status.deleted,
        conflicted: status.conflicted,
        behind: status.behind,
        ahead: status.ahead
    };
}

export async function getBranchList() {
    const branches = await git.branch();
    return {
        all: branches.all,
        current: branches.current
    };
}

export async function commitFiles(message: string, files: string[] = []) {
    if (files.length > 0) {
        await git.add(files);
    } else {
        await git.add('.');
    }
    return git.commit(message);
}

export async function getFileDiff(file: string) {
    return git.diff([file]);
}

export async function pushBranch() {
    return git.push();
}

export async function pullBranch() {
    return git.pull();
}

export async function checkoutBranch(branch: string, create: boolean = false) {
    if (create) {
        return git.checkoutLocalBranch(branch);
    }
    return git.checkout(branch);
}
