"use server";

import {
    getGitStatus,
    getBranchList,
    commitFiles,
    getFileDiff,
    pushBranch,
    pullBranch,
    checkoutBranch
} from "@/lib/git";

export async function getGitStatusAction() {
    return getGitStatus();
}

export async function getBranchListAction() {
    return getBranchList();
}

export async function commitFilesAction(message: string, files: string[] = []) {
    try {
        const res = await commitFiles(message, files);
        return { success: true, commit: res.commit };
    } catch (e: unknown) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
}

export async function getFileDiffAction(file: string) {
    return getFileDiff(file);
}

export async function pushBranchAction() {
    try {
        await pushBranch();
        return { success: true };
    } catch (e: unknown) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
}

export async function pullBranchAction() {
    try {
        await pullBranch();
        return { success: true };
    } catch (e: unknown) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
}

export async function checkoutBranchAction(branch: string, create: boolean = false) {
    try {
        await checkoutBranch(branch, create);
        return { success: true };
    } catch (e: unknown) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
}
