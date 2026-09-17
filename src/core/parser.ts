import Parser = require('web-tree-sitter');
import * as path from 'path';
import * as fs from 'fs';

let isInitialized = false;
const languageCache = new Map<string, Parser.Language>();

const langMap: Record<string, string> = {
    'javascript': 'javascript', 'javascriptreact': 'tsx', 'typescript': 'typescript', 'typescriptreact': 'tsx',
    'python': 'python', 'java': 'java', 'c': 'c', 'cpp': 'cpp', 'csharp': 'c_sharp', 'go': 'go',
    'rust': 'rust', 'php': 'php', 'ruby': 'ruby', 'swift': 'swift', 'kotlin': 'kotlin', 'dart': 'dart',
    'scala': 'scala', 'lua': 'lua', 'yaml': 'yaml', 'html': 'html', 'css': 'css', 'json': 'json',
    'jsonc': 'json', 'shellscript': 'bash', 'bash': 'bash', 'solidity': 'solidity', 'vue': 'vue',
    'toml': 'toml', 'zig': 'zig', 'elixir': 'elixir', 'elm': 'elm', 'ocaml': 'ocaml',
    'objective-c': 'objc', 'objc': 'objc', 'ql': 'ql', 'rescript': 'rescript'
};

function findWasmPath(fileName: string): string {
    const candidates = [
        path.join(__dirname, fileName),
        path.join(__dirname, '..', fileName),
        path.join(__dirname, '..', '..', fileName),
        path.join(__dirname, '..', '..', 'out', fileName),
        path.join(__dirname, '..', '..', 'node_modules', 'web-tree-sitter', fileName),
        path.join(__dirname, '..', '..', 'node_modules', 'tree-sitter-wasms', 'out', fileName),
        path.join(__dirname, '..', '..', '..', 'node_modules', 'web-tree-sitter', fileName),
        path.join(__dirname, '..', '..', '..', 'node_modules', 'tree-sitter-wasms', 'out', fileName)
    ];

    for (const c of candidates) {
        if (fs.existsSync(c)) {
            return c;
        }
    }
    return path.join(__dirname, fileName);
}

export async function initParserEngine(): Promise<void> {
    if (!isInitialized) {
        await Parser.init({
            locateFile(scriptName: string) {
                return findWasmPath(scriptName);
            }
        });
        isInitialized = true;
    }
}

/**
 * Returns a new Parser instance configured with the requested language grammar.
 * Thread-safe: Each parse request receives its own parser object, avoiding concurrent mutation.
 */
export async function getNewParser(languageId: string): Promise<Parser | null> {
    await initParserEngine();

    const wasmName = langMap[languageId];
    if (!wasmName) return null;

    if (!languageCache.has(wasmName)) {
        try {
            const wasmPath = findWasmPath(`tree-sitter-${wasmName}.wasm`);
            if (!fs.existsSync(wasmPath)) {
                console.warn(`WASM grammar file not found for ${wasmName} at ${wasmPath}`);
                return null;
            }
            const lang = await Parser.Language.load(wasmPath);
            languageCache.set(wasmName, lang);
        } catch (e) {
            console.error('Failed to load WASM grammar for', wasmName, e);
            return null;
        }
    }

    const parserInstance = new Parser();
    parserInstance.setLanguage(languageCache.get(wasmName)!);
    return parserInstance;
}

// Backward-compatible alias
export async function getParserForLanguage(languageId: string): Promise<Parser | null> {
    return getNewParser(languageId);
}

export function countErrors(node: Parser.SyntaxNode): number {
    let errors = 0;
    function walk(n: Parser.SyntaxNode) {
        if (n.type === 'ERROR' || n.isMissing()) errors++;
        for (let i = 0; i < n.childCount; i++) {
            const child = n.child(i);
            if (child) walk(child);
        }
    }
    walk(node);
    return errors;
}

