import { startWorkspaceContainer } from './lib/docker/manager';

async function testNativeFallback() {
    console.log("--- NATIVE FALLBACK TEST ---");
    try {
        const result = await startWorkspaceContainer({
            id: 'test-id',
            userId: 'test-user',
            projectName: 'test-project',
            onLog: (msg: string) => console.log(`[TEST-LOG] ${msg}`)
        });
        
        console.log("Test Result:", JSON.stringify(result, null, 2));
        
        if (result.containerId?.startsWith('native-')) {
            console.log("SUCCESS: Fallback to Native Mode detected.");
        } else {
            console.log("INFO: Docker was available, running in Docker mode.");
        }
        
    } catch (error) {
        console.error("TEST FAILED:", error);
    }
}

testNativeFallback();
