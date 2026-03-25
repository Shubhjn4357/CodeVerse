import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';

const options: Partial<SimpleGitOptions> = {
    binary: 'git',
    maxConcurrentProcesses: 6,
    trimmed: false,
};

export function getGit(baseDir: string = process.cwd()): SimpleGit {
    return simpleGit({ ...options, baseDir });
}

export async function getGitStatus(baseDir?: string) {
    const instance = getGit(baseDir);
    const isRepo = await instance.checkIsRepo();
    if (!isRepo) return null;

    const status = await instance.status();
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

export async function getBranchList(baseDir?: string) {
    const instance = getGit(baseDir);
    const branches = await instance.branch();
    return {
        all: branches.all,
        current: branches.current
    };
}

export async function commitFiles(message: string, files: string[] = [], baseDir?: string) {
    const instance = getGit(baseDir);
    if (files.length > 0) {
        await instance.add(files);
    } else {
        await instance.add('.');
    }
    return instance.commit(message);
}

export async function getFileDiff(file: string, baseDir?: string) {
    return getGit(baseDir).diff([file]);
}

export async function pushBranch(baseDir?: string) {
    return getGit(baseDir).push();
}

export async function pullBranch(baseDir?: string) {
    return getGit(baseDir).pull();
}

export async function checkoutBranch(branch: string, create: boolean = false, baseDir?: string) {
    const instance = getGit(baseDir);
    if (create) {
        return instance.checkoutLocalBranch(branch);
    }
    return instance.checkout(branch);
}


// Export for legacy access if needed, but discouraged
// export { git } from 'simple-git'; 
