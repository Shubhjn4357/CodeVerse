import { Suspense } from "react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import IDEClient from "@/components/workspace/IDEClient";

export default async function IDEPage() {
    const session = await auth();

    if (!session) {
        redirect("/login");
    }

    return (
        <Suspense fallback={<div className="h-dvh w-screen bg-(--bg) flex items-center justify-center text-(--text-muted)">Loading Platform...</div>}>
            <IDEClient session={session} />
        </Suspense>
    );
}
