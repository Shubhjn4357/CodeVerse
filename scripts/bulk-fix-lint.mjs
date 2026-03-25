import fs from 'fs';
import path from 'path';

const TARGET_DIRS = ['app/api', 'lib', 'components', 'hooks', 'store'];
const ROOT_DIR = process.cwd();

/**
 * Robust replacement for catch(any) patterns
 */
function fixCatchBlocks(content) {
    // Replace catch (anyVar: any) { ... } with catch (e: unknown) { const anyVar = e instanceof Error ? e : new Error(String(e)); }
    // Handles error: any, err: any, e: any, etc.
    return content.replace(/catch\s*\(\s*([a-zA-Z0-9_]+):\s*any\s*\)\s*{/g, (match, varName) => {
        if (varName === 'e') return 'catch (e: unknown) {';
        return `catch (e: unknown) {\n        const ${varName} = e instanceof Error ? e : new Error(String(e));`;
    });
}

/**
 * Remove unused Imports (basic heuristic)
 */
function removeUnusedImports(content) {
    const lines = content.split('\n');
    const resultLines = lines.map(line => {
        if (line.startsWith('import ')) {
            const match = line.match(/import\s*\{\s*([^}]+)\s*\}\s*from/);
            if (match) {
                const imports = match[1].split(',').map(i => i.trim());
                const remaining = imports.filter(i => {
                    if (['useEffect', 'useState', 'useRef', 'useMemo', 'useCallback'].includes(i)) {
                        const others = content.replace(line, '');
                        // Look for the word not preceded or followed by alphanumeric
                        const regex = new RegExp(`\\b${i}\\b`, 'g');
                        return regex.test(others);
                    }
                    return true;
                });
                if (remaining.length === 0) return null;
                if (remaining.length < imports.length) {
                    return line.replace(match[1], remaining.join(', '));
                }
            }
        }
        return line;
    });
    return resultLines.filter(l => l !== null).join('\n');
}

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    content = fixCatchBlocks(content);
    content = removeUnusedImports(content);

    if (content !== original) {
        console.log(`✅ Fixed: ${filePath}`);
        fs.writeFileSync(filePath, content);
    }
}

function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.next' && file !== '.git') {
                walk(fullPath);
            }
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            processFile(fullPath);
        }
    }
}

console.log("🚀 Starting improved bulk lint fix...");
TARGET_DIRS.forEach(dir => {
    const fullPath = path.join(ROOT_DIR, dir);
    walk(fullPath);
});
console.log("✨ Done!");
