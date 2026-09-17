const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const production = process.argv.includes('--minify');
const watch = process.argv.includes('--watch');
/**
 * @type {import('esbuild').Plugin}
 */
const copyWasmPlugin = {
    name: 'copy-wasm',
    setup(build) {
        build.onEnd(() => {
            const outDir = path.join(__dirname, 'out');
            if (!fs.existsSync(outDir)) {
                fs.mkdirSync(outDir, { recursive: true });
            }
            const wasmSourceDir = path.join(__dirname, 'node_modules', 'tree-sitter-wasms', 'out');
            if (fs.existsSync(wasmSourceDir)) {
                const files = fs.readdirSync(wasmSourceDir);
                for (const file of files) {
                    if (file.endsWith('.wasm')) {
                        fs.copyFileSync(
                            path.join(wasmSourceDir, file),
                            path.join(outDir, file)
                        );
                    }
                }
                
                // Also copy the core tree-sitter.wasm
                const coreWasmPath = path.join(__dirname, 'node_modules', 'web-tree-sitter', 'tree-sitter.wasm');
                if (fs.existsSync(coreWasmPath)) {
                    fs.copyFileSync(coreWasmPath, path.join(outDir, 'tree-sitter.wasm'));
                }
                
                console.log('Copied WASM files to out/');
            } else {
                console.warn('WASM source directory not found. Make sure tree-sitter-wasms is installed.');
            }
        });
    },
};

async function main() {
    const ctx = await esbuild.context({
        entryPoints: [
            'src/extension.ts',
            'src/test/runTest.ts',
            'src/test/suite/index.ts',
            'src/test/suite/cleaner.test.ts',
            'src/test/unit/cleaner.test.ts'
        ],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        outdir: 'out',
        external: ['vscode', 'mocha', 'chai', '@vscode/test-electron'],
        logLevel: 'info',
        plugins: [copyWasmPlugin],
    });

    if (watch) {
        await ctx.watch();
        console.log('Watching for changes...');
    } else {
        await ctx.rebuild();
        await ctx.dispose();
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
