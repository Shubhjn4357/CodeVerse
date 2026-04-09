"use server";

import { auth } from "@/auth";
import { client as db } from "@/lib/db";
import { WorkspaceRecord } from "@/lib/db/schema";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { 
  getWorkspacePort, 
  isWorkspaceRunning, 
  prewarmWorkspace,
  WorkspaceConfig
} from "@/lib/docker/manager";

/**
 * 🛠️ Workspace Server Actions (Native Edition)
 * Secure, high-performance server-side communication layer for managing VS Code environments.
 * 100% Type-safe: Optimized for zero-dependency execution on Hugging Face Spaces.
 */

export interface WorkspaceActionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 🚀 Creates a new workspace for the authenticated user.
 */
export async function createWorkspace(projectName: string): Promise<WorkspaceActionResponse<{ id: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Unauthorized" };

  try {
    const id = randomUUID();
    await db.execute({
      sql: "INSERT INTO workspaces (id, user_id, project_name, status) VALUES (?, ?, ?, ?)",
      args: [id, session.user.id, projectName, "stopped"]
    });

    revalidatePath("/");
    return { success: true, data: { id } };
  } catch (error: unknown) {
    console.error("[ACTION:ERROR] createWorkspace failed:", error);
    return { success: false, error: "Failed to create workspace." };
  }
}

/**
 * 🚀 Retrieves all workspaces for the authenticated user.
 */
export async function getWorkspaces(): Promise<WorkspaceActionResponse<WorkspaceRecord[]>> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Unauthorized" };

  try {
    const res = await db.execute({
      sql: "SELECT * FROM workspaces WHERE user_id = ? ORDER BY created_at DESC",
      args: [session.user.id]
    });

    const userWorkspaces: WorkspaceRecord[] = res.rows.map(row => ({
      id: row.id as string,
      user_id: row.user_id as string,
      project_name: row.project_name as string,
      container_id: row.container_id as string | null,
      android_container_id: row.android_container_id as string | null,
      status: row.status as string | null,
      port_mapping: row.port_mapping as number | null,
      android_port: row.android_port as number | null,
      created_at: row.created_at as string | undefined
    }));

    return { success: true, data: userWorkspaces };
  } catch (error: unknown) {
    console.error("[ACTION:ERROR] getWorkspaces failed:", error);
    return { success: false, error: "Failed to fetch workspaces." };
  }
}

/**
 * 🚀 Starts or reconnects to an existing workspace.
 */
export async function startWorkspace(workspaceId: string): Promise<WorkspaceActionResponse<{ port: number | undefined }>> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Unauthorized" };

  try {
    const res = await db.execute({
      sql: "SELECT * FROM workspaces WHERE id = ? AND user_id = ? LIMIT 1",
      args: [workspaceId, session.user.id]
    });

    if (res.rows.length === 0) return { success: false, error: "Workspace not found." };
    const workspace = res.rows[0];

    // Prepare config for prewarming
    const config: WorkspaceConfig = {
        id: workspace.id as string,
        userId: workspace.user_id as string,
        projectName: workspace.project_name as string
    };

    // Trigger prewarming / starting via the manager
    await prewarmWorkspace(config);
    
    const port = getWorkspacePort(workspaceId);
    
    revalidatePath("/");
    return { success: true, data: { port } };
  } catch (error: unknown) {
    console.error("[ACTION:ERROR] startWorkspace failed:", error);
    return { success: false, error: "Failed to start workspace." };
  }
}

/**
 * 🚀 Checks the real-time status of a workspace.
 */
export async function getWorkspaceStatus(workspaceId: string): Promise<WorkspaceActionResponse<{ isRunning: boolean }>> {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    try {
        const isRunning = isWorkspaceRunning(workspaceId);
        return { success: true, data: { isRunning } };
    } catch (error: unknown) {
        console.error("[ACTION:ERROR] getWorkspaceStatus failed:", error);
        return { success: false, error: "Failed to check status." };
    }
}
