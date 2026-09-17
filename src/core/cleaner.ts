import { CleanOptions } from '../config';
import { getParserForLanguage, countErrors } from './parser';
import { processCodeLegacy } from './legacy-cleaner';
import { minify } from 'terser';
import Parser = require('web-tree-sitter');

type RangeInfo = { start: number; end: number; type: 'comment' | 'protect' };

function getProtectedRanges(node: Parser.SyntaxNode): RangeInfo[] {
    const ranges: RangeInfo[] = [];
    function traverse(n: Parser.SyntaxNode) {
        if (n.type.includes('comment')) {
            ranges.push({ start: n.startIndex, end: n.endIndex, type: 'comment' });
            return;
        }
        if (n.type.includes('string') || n.type.includes('regex') || n.type.includes('character')) {
            ranges.push({ start: n.startIndex, end: n.endIndex, type: 'protect' });
            return;
        }
        for (let i = 0; i < n.childCount; i++) {
            const child = n.child(i);
            if (child) traverse(child);
        }
    }
    traverse(node);
    return ranges.sort((a, b) => a.start - b.start);
}

import { shouldPreserveComment } from './comment-utils';
export { shouldPreserveComment };

function applyWhitespaceCompression(
    code: string,
    isWhitespaceDependent: boolean,
    disableOperatorTightening: boolean,
    options: CleanOptions,
    languageId?: string
): string {
    if (options.profile === 'Format') {
        return code;
    }

    if (!isWhitespaceDependent && options.removeIndentation) {
        code = code.replace(/^[ \t]+/gm, '');
    }

    // Standardize repeated spaces to single space between tokens
    code = code.replace(/(?<=\S)[ \t]{2,}(?=\S)/g, ' ');

    if (!disableOperatorTightening && options.removeSpacesAroundOperators) {
        // Protect CSS math functions (calc, min, max, clamp) where spaces around + and - are required by CSS spec
        const mathExprs: string[] = [];
        const isCssLike = languageId && ['css', 'scss', 'less'].includes(languageId);
        if (isCssLike) {
            code = code.replace(/(calc|min|max|clamp)\((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*\)/gi, match => {
                mathExprs.push(match);
                return `__CSS_MATH_${mathExprs.length - 1}__`;
            });
        }

        const multiCharOps = ['===', '!==', '\\+=', '-=', '\\*=', '/=', '==', '!=', '<=', '>=', '&&', '\\|\\|'];
        const multiRegex = new RegExp(`(?<=\\S)[ \\t]*(${multiCharOps.join('|')})[ \\t]*(?=\\S)`, 'g');
        code = code.replace(multiRegex, '$1');

        // Tighten single-character operators with lookaround guards:
        // 1. op === '/' should not be followed by '*' or '/' (would create comments)
        // 2. op === '-' should not be followed by '-' (would create decrement)
        // 3. op === '+' should not be followed by '+' (would create increment)
        code = code.replace(/(?<=[a-zA-Z0-9_$\]\)])[ \t]*([=+\-*\/<>])[ \t]*(?=[a-zA-Z0-9_$[({])/g, (match, op, offset, fullStr) => {
            const nextChar = fullStr[offset + match.length];
            if (op === '/' && (nextChar === '*' || nextChar === '/')) return match;
            if (op === '-' && nextChar === '-') return match;
            if (op === '+' && nextChar === '+') return match;
            return op;
        });

        if (isCssLike && mathExprs.length > 0) {
            code = code.replace(/__CSS_MATH_(\d+)__/g, (_, idx) => mathExprs[parseInt(idx, 10)]);
        }
    }

    return code;
}

export interface LlmCleanResult {
    cleanedText: string;
    originalLength: number;
    cleanedLength: number;
    charsSaved: number;
    reductionPercentage: number;
    estimatedTokensSaved: number;
}

export async function cleanForLlm(
    text: string,
    languageId: string,
    baseOptions: CleanOptions,
    isFragment = false
): Promise<LlmCleanResult> {
    const originalLength = text.length;
    const llmOptions: CleanOptions = {
        ...baseOptions,
        profile: 'Minify',
        removeComments: true,
        removeBlankLines: true,
        removeSpacesAroundOperators: true,
        removeIndentation: false,
        preserveLegalHeaders: false,
        preserveDocstrings: false
    };

    const cleanedText = await processCode(text, languageId, llmOptions, isFragment);
    const cleanedLength = cleanedText.length;
    const charsSaved = Math.max(0, originalLength - cleanedLength);
    const reductionPercentage = originalLength > 0 ? Math.round((charsSaved / originalLength) * 100) : 0;
    const estimatedTokensSaved = Math.round(charsSaved / 4);

    return {
        cleanedText,
        originalLength,
        cleanedLength,
        charsSaved,
        reductionPercentage,
        estimatedTokensSaved
    };
}

export async function processCode(
    text: string,
    languageId: string,
    options: CleanOptions,
    isFragment = false
): Promise<string> {
    const effectiveOptions = { ...options };

    // JSON / JSONC handling: format or minify structurally
    if (languageId === 'json' || languageId === 'jsonc') {
        if (effectiveOptions.profile === 'Minify') {
            try {
                return JSON.stringify(JSON.parse(text));
            } catch {
                // Fallback to cleaner logic if comments or trailing commas are present
            }
        } else if (effectiveOptions.profile === 'Format') {
            try {
                return JSON.stringify(JSON.parse(text), null, 2);
            } catch {
                return text;
            }
        }
    }

    // Terser for pure JS minification/obfuscation (exclude TS which has types that break Terser)
    const isPureJs = languageId === 'javascript';
    if (isPureJs && (effectiveOptions.profile === 'Minify' || effectiveOptions.profile === 'Obfuscate') && !isFragment) {
        try {
            const isObfuscate = effectiveOptions.profile === 'Obfuscate';
            const result = await minify(text, {
                mangle: isObfuscate ? { toplevel: true } : false,
                compress: {
                    defaults: true,
                    drop_console: isObfuscate,
                },
                format: {
                    comments: !effectiveOptions.removeComments,
                }
            });
            if (result.code) return result.code;
        } catch (e) {
            console.warn('Terser failed, falling back to AST cleaning', e);
        }
    }

    const isWhitespaceDependent = ['python', 'yaml', 'fsharp', 'haskell', 'jade', 'pug', 'slim', 'stylus', 'sass'].includes(languageId);
    const disableOperatorTightening = ['shellscript', 'bash', 'sh', 'yaml', 'powershell', 'makefile', 'sql'].includes(languageId);

    const p = await getParserForLanguage(languageId);
    if (!p) {
        return processCodeLegacy(text, languageId, effectiveOptions);
    }

    let tree: Parser.Tree | null = null;
    let cleanedTree: Parser.Tree | null = null;

    try {
        tree = p.parse(text);
        const originalErrors = countErrors(tree.rootNode);
        const ranges = getProtectedRanges(tree.rootNode);

        let result = '';
        let lastIndex = 0;

        for (const range of ranges) {
            if (range.start > lastIndex) {
                const codePart = text.substring(lastIndex, range.start);
                let compressed = applyWhitespaceCompression(codePart, isWhitespaceDependent, disableOperatorTightening, effectiveOptions, languageId);

                // WORD BOUNDARY GUARD:
                // Prevent fusing keywords/identifiers with protected literals
                // e.g. `return f"hello"` should not become `returnf"hello"`
                const endsWithWord = /[a-zA-Z0-9_$]$/.test(codePart.trimEnd());
                const rangeStartsWord = /^[a-zA-Z0-9_$"'`]/.test(text.substring(range.start, range.end));
                if (endsWithWord && rangeStartsWord && !compressed.endsWith(' ')) {
                    compressed = compressed.trimEnd() + ' ';
                }

                result += compressed;
            }

            if (range.type === 'comment') {
                const commentText = text.substring(range.start, range.end);
                if (shouldPreserveComment(commentText, effectiveOptions)) {
                    result += commentText;
                } else {
                    // Check if comment separated two identifiers/keywords (e.g. `let/*c*/x`)
                    const prevChar = text[range.start - 1] || '';
                    const nextChar = text[range.end] || '';
                    if (/[a-zA-Z0-9_$]/.test(prevChar) && /[a-zA-Z0-9_$]/.test(nextChar)) {
                        result += ' ';
                    }
                }
            } else if (range.type === 'protect') {
                result += text.substring(range.start, range.end);
            }

            lastIndex = range.end;
        }

        if (lastIndex < text.length) {
            const codePart = text.substring(lastIndex);
            result += applyWhitespaceCompression(codePart, isWhitespaceDependent, disableOperatorTightening, effectiveOptions, languageId);
        }

        if (effectiveOptions.profile !== 'Format' && effectiveOptions.removeBlankLines) {
            result = result.replace(/^[ \t]*(\r?\n)/gm, '');
        }

        // Dry-run syntax check: only run on full files (fragments have incomplete ASTs by nature)
        if (!isFragment) {
            cleanedTree = p.parse(result);
            const cleanedErrors = countErrors(cleanedTree.rootNode);
            if (cleanedErrors > originalErrors) {
                throw new Error(`Syntax error introduced during cleaning (${originalErrors} -> ${cleanedErrors} errors). Operation aborted to protect your code.`);
            }
        }

        return result;
    } finally {
        // ALWAYS free WebAssembly Tree allocations to prevent memory leaks
        if (tree) tree.delete();
        if (cleanedTree) cleanedTree.delete();
    }
}

