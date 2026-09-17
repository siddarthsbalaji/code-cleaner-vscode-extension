import * as vscode from 'vscode';
import { registerCommands, CleanPreviewProvider, previewProvider } from './commands';
import { getConfig } from './config';
import { processCode } from './core/cleaner';

export function activate(context: vscode.ExtensionContext) {
    // Register all commands
    registerCommands(context);

    // Register diff preview content provider
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(CleanPreviewProvider.scheme, previewProvider)
    );

    // Register standard VS Code Document Formatting Provider
    const formattingProvider = vscode.languages.registerDocumentFormattingEditProvider(
        { scheme: 'file' },
        {
            async provideDocumentFormattingEdits(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
                const options = getConfig(document);
                const text = document.getText();
                try {
                    const cleaned = await processCode(text, document.languageId, options, false);
                    if (cleaned !== text) {
                        const fullRange = new vscode.Range(
                            document.lineAt(0).range.start,
                            document.lineAt(document.lineCount - 1).range.end
                        );
                        return [vscode.TextEdit.replace(fullRange, cleaned)];
                    }
                } catch (e: any) {
                    console.warn(`CodeCleaner: Formatting failed for ${document.fileName}: ${e.message}`);
                }
                return [];
            }
        }
    );

    const rangeFormattingProvider = vscode.languages.registerDocumentRangeFormattingEditProvider(
        { scheme: 'file' },
        {
            async provideDocumentRangeFormattingEdits(document: vscode.TextDocument, range: vscode.Range): Promise<vscode.TextEdit[]> {
                const options = getConfig(document);
                const text = document.getText(range);
                try {
                    const cleaned = await processCode(text, document.languageId, options, true);
                    if (cleaned !== text) {
                        return [vscode.TextEdit.replace(range, cleaned)];
                    }
                } catch (e: any) {
                    console.warn(`CodeCleaner: Range formatting failed for ${document.fileName}: ${e.message}`);
                }
                return [];
            }
        }
    );

    context.subscriptions.push(formattingProvider, rangeFormattingProvider);

    // Persistent Status Bar profile indicator
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'code-cleaner.switchProfile';

    const profileSummaries: Record<string, string> = {
        Format: 'Safe spacing & indentation (preserves comments & blank lines)',
        Clean: 'Balanced cleanup (removes comments & blank lines, tightens operators)',
        Minify: 'Maximum compression (strips non-essential whitespace & empty lines)',
        Obfuscate: 'Mangles JS variables & removes console.log statements'
    };

    function updateStatusBar() {
        const profile = getConfig().profile;
        statusBarItem.text = `$(sparkle) Clean: ${profile}`;
        const summary = profileSummaries[profile] || profile;
        const tooltip = new vscode.MarkdownString(
            `**CodeCleaner** (Default: **${profile}**)\n\n` +
            `${summary}\n\n` +
            `---\n\n` +
            `*Click to switch default profile*`
        );
        statusBarItem.tooltip = tooltip;
        statusBarItem.show();
    }

    updateStatusBar();
    context.subscriptions.push(statusBarItem);

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('codeCleaner.profile')) {
                updateStatusBar();
            }
        })
    );

    // Clean on Save functionality
    context.subscriptions.push(
        vscode.workspace.onWillSaveTextDocument(event => {
            const document = event.document;
            if (document.uri.scheme !== 'file') {
                return;
            }

            const options = getConfig(document);
            if (options.cleanOnSave) {
                const textToProcess = document.getText();
                const languageId = document.languageId;

                event.waitUntil((async () => {
                    try {
                        const cleanedText = await processCode(textToProcess, languageId, options, false);
                        if (cleanedText !== textToProcess) {
                            const fullRange = new vscode.Range(
                                document.lineAt(0).range.start,
                                document.lineAt(document.lineCount - 1).range.end
                            );
                            return [vscode.TextEdit.replace(fullRange, cleanedText)];
                        }
                    } catch (e: any) {
                        // Silently log to console instead of popping up an intrusive UI toast on save
                        console.warn(`CodeCleaner: Clean on save skipped for ${document.fileName}: ${e.message}`);
                    }
                    return [];
                })());
            }
        })
    );
}

export function deactivate() {}

