import { CleanOptions } from '../config';
import { shouldPreserveComment } from './comment-utils';

type Token = { type: 'code' | 'string' | 'regex' | 'comment', value: string };

function tokenize(code: string, languageId: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    let currentCode = '';
    let codeSoFar = '';
    
    // Determine language-specific comment characters
    const hashIsComment = ['python', 'yaml', 'shellscript', 'bash', 'sh', 'ruby', 'perl', 'powershell', 'makefile', 'r', 'dockerfile'].includes(languageId);
    const dashDashIsComment = ['lua', 'sql', 'haskell'].includes(languageId);
    const slashSlashIsComment = ['javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'vue', 'svelte', 'c', 'cpp', 'csharp', 'java', 'go', 'rust', 'swift', 'kotlin', 'php', 'dart', 'scala', 'json', 'jsonc', 'fsharp'].includes(languageId);
    const slashStarIsComment = ['javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'vue', 'svelte', 'c', 'cpp', 'csharp', 'java', 'go', 'rust', 'swift', 'kotlin', 'php', 'dart', 'scala', 'css', 'less', 'scss', 'sql'].includes(languageId);
    const htmlIsComment = ['html', 'xml', 'markdown', 'vue', 'svelte'].includes(languageId);
    const supportsRegexLiterals = ['javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'ruby', 'vue', 'svelte'].includes(languageId);
    
    function pushCode() {
        if (currentCode) {
            tokens.push({ type: 'code', value: currentCode });
            currentCode = '';
        }
    }
    
    while (i < code.length) {
        const char = code[i];
        const next = code[i + 1] || '';
        
        // Block comment /* */
        if (slashStarIsComment && char === '/' && next === '*') {
            pushCode();
            let comment = '/*';
            i += 2;
            while (i < code.length) {
                if (code[i] === '*' && code[i + 1] === '/') {
                    comment += '*/';
                    i += 2;
                    break;
                }
                comment += code[i];
                i++;
            }
            tokens.push({ type: 'comment', value: comment });
            continue;
        }
        
        // Single line comment //
        if (slashSlashIsComment && char === '/' && next === '/') {
            pushCode();
            let comment = '//';
            i += 2;
            while (i < code.length && code[i] !== '\n') {
                comment += code[i];
                i++;
            }
            tokens.push({ type: 'comment', value: comment });
            continue;
        }
        
        // HTML comment <!-- -->
        if (htmlIsComment && char === '<' && code.substring(i, i + 4) === '<!--') {
            pushCode();
            let comment = '<!--';
            i += 4;
            while (i < code.length) {
                if (code.substring(i, i + 3) === '-->') {
                    comment += '-->';
                    i += 3;
                    break;
                }
                comment += code[i];
                i++;
            }
            tokens.push({ type: 'comment', value: comment });
            continue;
        }
        
        // Hash comment #
        if (hashIsComment && char === '#') {
            pushCode();
            let comment = '#';
            i++;
            while (i < code.length && code[i] !== '\n') {
                comment += code[i];
                i++;
            }
            tokens.push({ type: 'comment', value: comment });
            continue;
        }
        
        // Dash Dash comment --
        if (dashDashIsComment && char === '-' && next === '-') {
            pushCode();
            let comment = '--';
            i += 2;
            while (i < code.length && code[i] !== '\n') {
                comment += code[i];
                i++;
            }
            tokens.push({ type: 'comment', value: comment });
            continue;
        }
        
        // Strings (" ' `)
        if (char === '"' || char === "'" || char === '`') {
            pushCode();
            const quote = char;
            const isMulti = (quote === '"' || quote === "'") && code.substring(i, i + 3) === quote + quote + quote;
            let str = isMulti ? quote + quote + quote : quote;
            i += isMulti ? 3 : 1;
            
            while (i < code.length) {
                if (code[i] === '\\') {
                    str += code[i];
                    i++;
                    if (i < code.length) {
                        str += code[i];
                        i++;
                    }
                    continue;
                }
                if (isMulti) {
                    if (code.substring(i, i + 3) === quote + quote + quote) {
                        str += quote + quote + quote;
                        i += 3;
                        break;
                    }
                } else {
                    if (code[i] === quote) {
                        str += quote;
                        i++;
                        break;
                    }
                }
                str += code[i];
                i++;
            }
            tokens.push({ type: 'string', value: str });
            codeSoFar += 'R'; // Placeholder indicating an expression
            continue;
        }
        
        // Regex Literal Heuristic (applicable mostly to JS/TS)
        if (supportsRegexLiterals && char === '/') {
            const trimmed = codeSoFar.trim();
            const lastChar = trimmed.slice(-1);
            const matchWord = trimmed.match(/[a-zA-Z_$][a-zA-Z0-9_$]*$/);
            const lastWord = matchWord ? matchWord[0] : '';
            
            const couldBeRegex = !lastChar || 
                                 /[-+*=[({!:,;<>|&?]/.test(lastChar) || 
                                 ['return', 'typeof', 'yield', 'await', 'throw', 'case', 'do', 'else', 'in', 'of'].includes(lastWord);
            
            if (couldBeRegex) {
                let isRegex = false;
                let j = i + 1;
                let regexContent = '/';
                while (j < code.length) {
                    if (code[j] === '\n') { break; } // Regex cannot contain unescaped newlines
                    if (code[j] === '\\') {
                        regexContent += code[j];
                        j++;
                        if (j < code.length) {
                            regexContent += code[j];
                            j++;
                        }
                        continue;
                    }
                    if (code[j] === '/') {
                        regexContent += '/';
                        j++;
                        // Flags
                        while (j < code.length && /[gimyusd]/i.test(code[j])) {
                            regexContent += code[j];
                            j++;
                        }
                        isRegex = true;
                        break;
                    }
                    regexContent += code[j];
                    j++;
                }
                
                if (isRegex) {
                    pushCode();
                    tokens.push({ type: 'regex', value: regexContent });
                    i = j;
                    codeSoFar += 'R';
                    continue;
                }
            }
        }
        
        currentCode += char;
        codeSoFar += char;
        i++;
    }
    
    pushCode();
    return tokens;
}

export function processCodeLegacy(text: string, languageId: string, options: CleanOptions): string {
    const isWhitespaceDependent = ['python', 'yaml', 'fsharp', 'haskell', 'jade', 'pug', 'slim', 'stylus', 'sass'].includes(languageId);
    const disableOperatorTightening = ['shellscript', 'bash', 'sh', 'yaml', 'powershell', 'makefile'].includes(languageId);
    
    const tokens = tokenize(text, languageId);
    let result = '';
    const protectedTokens: string[] = [];
    
    for (const token of tokens) {
        if (token.type === 'comment') {
            if (shouldPreserveComment(token.value, options)) {
                const placeholder = `__PROTECTED_TOKEN_${protectedTokens.length}__`;
                protectedTokens.push(token.value);
                result += placeholder;
                continue;
            } else {
                continue;
            }
        }
        
        if (token.type === 'string' || token.type === 'regex') {
            const placeholder = `__PROTECTED_TOKEN_${protectedTokens.length}__`;
            protectedTokens.push(token.value);
            result += placeholder;
            continue;
        }
        
        if (token.type === 'code') {
            let code = token.value;
            
            if (options.profile === 'Format') {
                // Standardize to single spaces, but don't aggressively remove indentation or newlines
            } else {
                if (!isWhitespaceDependent && options.removeIndentation) {
                    code = code.replace(/^[ \t]+/gm, '');
                }
                
                code = code.replace(/[ \t]+$/gm, '');
                code = code.replace(/(?<=\S)[ \t]{2,}/g, ' ');
                
                if (!disableOperatorTightening && options.removeSpacesAroundOperators) {
                    const operators = [
                        '\\+=', '-=', '\\*=', '/=', '===', '!==', '==', '!=', '<=', '>=', '&&', '\\|\\|', '\\+', '-', '\\*', '/', '=', '<', '>'
                    ];
                    const opsPattern = operators.join('|');
                    const opRegex = new RegExp(`(?<=\\S)[ \\t]*(${opsPattern})[ \\t]*(?=\\S)`, 'g');
                    code = code.replace(opRegex, '$1');
                }
            }
            
            result += code;
        }
    }
    
    if (options.profile !== 'Format' && options.removeBlankLines) {
        result = result.replace(/^[ \t]*(\r?\n)/gm, '');
    }
    
    result = result.replace(/__PROTECTED_TOKEN_(\d+)__/g, (match, index) => {
        return protectedTokens[parseInt(index, 10)];
    });
    
    return result;
}
