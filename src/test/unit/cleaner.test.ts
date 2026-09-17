import * as assert from 'assert';
import { processCode, cleanForLlm } from '../../core/cleaner';
import { CleanOptions } from '../../config';
import { initParserEngine } from '../../core/parser';

describe('CodeCleaner Core Unit Tests', () => {
    before(async () => {
        await initParserEngine();
    });

    const defaultOptions: CleanOptions = {
        profile: 'Clean',
        removeComments: true,
        removeBlankLines: true,
        removeSpacesAroundOperators: true,
        removeIndentation: false,
        cleanOnSave: false,
        preserveLegalHeaders: true,
        preserveDocstrings: false
    };

    describe('Python Word Boundary & Protected Ranges', () => {
        it('preserves space between return keyword and f-string without syntax error', async () => {
            const input = 'def greet(name: str) -> str:\n    # comment\n    return f"Hello {name}"';
            const result = await processCode(input, 'python', defaultOptions);
            assert.ok(result.includes('return f"Hello {name}"'), `Expected 'return f"Hello {name}"', got: ${result}`);
            assert.ok(!result.includes('returnf'), 'Keyword must not fuse with string prefix');
        });

        it('preserves space between return keyword and raw string', async () => {
            const input = 'def get_regex():\n    return r"\\d+\\w+"';
            const result = await processCode(input, 'python', defaultOptions);
            assert.ok(result.includes('return r"\\d+\\w+"'), `Expected 'return r"\\d+\\w+"', got: ${result}`);
        });

        it('preserves space between yield keyword and string', async () => {
            const input = 'def gen():\n    yield "data"';
            const result = await processCode(input, 'python', defaultOptions);
            assert.ok(result.includes('yield "data"'), `Expected 'yield "data"', got: ${result}`);
        });
    });

    describe('Operator Tightening Collision Guards', () => {
        it('does not turn subtraction of negative number into decrement operator in JS', async () => {
            const input = 'const fn = (a, b) => a - -b;';
            const result = await processCode(input, 'javascript', defaultOptions);
            assert.ok(result.includes('- -b') || result.includes(' - -b'), `Expected safe unary minus, got: ${result}`);
            assert.ok(!result.includes('a--b'), 'Must not create illegal decrement operator a--b');
        });

        it('does not turn addition of positive into increment operator in JS', async () => {
            const input = 'const val = x + +y;';
            const result = await processCode(input, 'javascript', defaultOptions);
            assert.ok(!result.includes('x++y'), 'Must not create illegal increment operator x++y');
        });

        it('does not turn division by dereferenced pointer into a block comment in C', async () => {
            const input = 'int div(int a, int *b) {\n    return a / *b;\n}\nint next() {\n    return 1;\n}';
            const result = await processCode(input, 'c', defaultOptions);
            assert.ok(!result.includes('a/*b'), 'Must not transform division into block comment start /*');
            assert.ok(result.includes('next()'), 'Code after pointer division must not be swallowed into comment');
        });
    });

    describe('Comment Removal Safety & Legal Header Preservation', () => {
        it('preserves single separating space when removing inline comment between keywords/identifiers', async () => {
            const input = 'let/*comment*/x = 1;';
            const result = await processCode(input, 'javascript', defaultOptions);
            assert.ok(!result.includes('letx'), 'Must not fuse tokens into letx');
            assert.ok(result.includes('let x'), `Expected 'let x', got: ${result}`);
        });

        it('preserves legal comments and license banners when preserveLegalHeaders is true', async () => {
            const input = '/*! (c) 2026 Acme Corp MIT License */\n// regular debug comment\nconst x = 10;';
            const result = await processCode(input, 'javascript', defaultOptions);
            assert.ok(result.includes('/*! (c) 2026 Acme Corp MIT License */'), 'Legal banner must be preserved');
            assert.ok(!result.includes('regular debug comment'), 'Regular comments must be stripped');
        });

        it('preserves JSDoc comments when preserveDocstrings is enabled', async () => {
            const input = '/** Returns total */\n// debug\nfunction getSum() { return 1; }';
            const options: CleanOptions = { ...defaultOptions, preserveDocstrings: true };
            const result = await processCode(input, 'javascript', options);
            assert.ok(result.includes('/** Returns total */'), 'JSDoc comment must be preserved');
            assert.ok(!result.includes('// debug'), 'Non-JSDoc comment must be stripped');
        });
    });

    describe('CSS Math Expression (calc) Safety Guard', () => {
        it('preserves whitespace around + and - inside CSS calc functions', async () => {
            const input = '.box {\n    width: calc(100% - 20px);\n    height: calc(50% + 10px);\n}';
            const result = await processCode(input, 'css', defaultOptions);
            assert.ok(result.includes('100% - 20px'), 'calc minus spacing must be preserved');
            assert.ok(result.includes('50% + 10px'), 'calc plus spacing must be preserved');
        });
    });

    describe('Fragment / Selection Handling', () => {
        it('cleans selection without failing full-file dry-run guard', async () => {
            const fragment = 'return a + b;';
            const result = await processCode(fragment, 'typescript', defaultOptions, true);
            assert.strictEqual(result, 'return a+b;');
        });

        it('cleans indented python block selection without error', async () => {
            const fragment = '    x = 10\n    y = 20\n    return x + y';
            const result = await processCode(fragment, 'python', defaultOptions, true);
            assert.ok(result.includes('x=10'));
            assert.ok(result.includes('y=20'));
            assert.ok(result.includes('return x+y'));
        });
    });

    describe('JSON Formatting and Minification', () => {
        it('correctly minifies JSON', async () => {
            const input = '{\n  "name": "test",\n  "version": 1\n}';
            const options: CleanOptions = { ...defaultOptions, profile: 'Minify' };
            const result = await processCode(input, 'json', options);
            assert.strictEqual(result, '{"name":"test","version":1}');
        });

        it('correctly formats JSON', async () => {
            const input = '{"name":"test","version":1}';
            const options: CleanOptions = { ...defaultOptions, profile: 'Format' };
            const result = await processCode(input, 'json', options);
            assert.ok(result.includes('\n  "name": "test"'));
        });
    });

    describe('Clean for LLM Token Optimizer', () => {
        it('produces compact token-optimized code and calculates reduction metrics', async () => {
            const code = `
                // Calculate Fibonacci
                function fib(n) {
                    /* base cases */
                    if (n <= 1) {
                        return n;
                    }

                    // recursive step
                    return fib(n - 1) + fib(n - 2);
                }
            `;
            const result = await cleanForLlm(code, 'javascript', defaultOptions);
            assert.ok(result.cleanedLength < result.originalLength);
            assert.ok(result.charsSaved > 0);
            assert.ok(result.reductionPercentage > 20);
            assert.ok(result.estimatedTokensSaved > 5);
            assert.ok(!result.cleanedText.includes('Calculate Fibonacci'));
        });
    });

    describe('Extended Languages & Concurrency', () => {
        it('cleans Solidity smart contracts with native grammar', async () => {
            const sol = 'contract Token {\n    // comment\n    uint256 public balance = 100;\n}';
            const result = await processCode(sol, 'solidity', defaultOptions);
            assert.ok(!result.includes('// comment'));
            assert.ok(result.includes('contract Token'));
        });

        it('cleans TOML configuration with native grammar', async () => {
            const toml = '[package]\nname = "code-cleaner"\n# version\nversion = "3.0.0"\n';
            const result = await processCode(toml, 'toml', defaultOptions);
            assert.ok(!result.includes('# version'));
            assert.ok(result.includes('[package]'));
        });

        it('cleans multiple files of different languages concurrently without swapping language state', async () => {
            const tasks = [
                processCode('def f():\n    return 42', 'python', defaultOptions),
                processCode('function f() {\n    return 42;\n}', 'javascript', defaultOptions),
                processCode('fn f() -> i32 {\n    42\n}', 'rust', defaultOptions),
                processCode('int f() {\n    return 42;\n}', 'c', defaultOptions),
                processCode('package main\nfunc f() int {\n    return 42\n}', 'go', defaultOptions),
            ];

            const results = await Promise.all(tasks);
            assert.strictEqual(results.length, 5);
            assert.ok(results[0].includes('def f():'));
            assert.ok(results[1].includes('function f()'));
            assert.ok(results[2].includes('fn f()'));
            assert.ok(results[3].includes('int f()'));
            assert.ok(results[4].includes('func f()'));
        });
    });
});
