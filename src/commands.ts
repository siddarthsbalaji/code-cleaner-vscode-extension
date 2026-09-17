import * as vscode from 'vscode';
import * as path from 'path';
import { getConfig, CleanOptions } from './config';
import { processCode } from './core/cleaner';

export class CleanPreviewProvider implements vscode.TextDocumentContentProvider {
    static readonly scheme = 'codecleaner-preview';
    private contents = new Map<string, string>();
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;

    setContent(uri: vscode.Uri, content: string) {
        this.contents.set(uri.toString(), content);
        this._onDidChange.fire(uri);
    }

    provideTextDocumentContent(uri: vscode.Uri): string {
        return this.contents.get(uri.toString()) || '';
    }
}

export const previewProvider = new CleanPreviewProvider();

const BINARY_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.pdf', '.zip', '.tar', '.gz',
    '.wasm', '.exe', '.dll', '.so', '.dylib', '.ttf', '.woff', '.woff2', '.sqlite', '.db',
    '.mp4', '.mp3', '.mov', '.avi', '.bin'
]);

const IGNORED_NAMES = new Set([
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'cargo.lock', 'composer.lock'
]);

function isCleanableFile(uri: vscode.Uri): boolean {
    const ext = path.extname(uri.fsPath).toLowerCase();
    const basename = path.basename(uri.fsPath);
    if (BINARY_EXTENSIONS.has(ext) || IGNORED_NAMES.has(basename)) {
        return false;
    }
    return true;
}

async function processTextPreservingWhitespace(
    textToProcess: string,
    languageId: string,
    options: CleanOptions,
    isFragment = false
): Promise<string> {
    if (textToProcess.length === 0 || textToProcess.trim().length === 0) {
        return textToProcess;
    }
    return await processCode(textToProcess, languageId, options, isFragment);
}

export type ProfileType = 'Format' | 'Clean' | 'Minify' | 'Obfuscate';

export interface ProfileQuickPickItem extends vscode.QuickPickItem {
    profile: ProfileType;
}

export function getProfileQuickPickItems(currentProfile?: ProfileType): ProfileQuickPickItem[] {
    return [
        {
            label: `$(symbol-keyword) Format${currentProfile === 'Format' ? '  ✓ (Active)' : ''}`,
            description: 'Safe spacing & indentation',
            detail: 'Standardizes indentation and spacing without removing comments or blank lines. Safest option for formatting.',
            profile: 'Format',
            picked: currentProfile === 'Format'
        },
        {
            label: `$(sparkle) Clean${currentProfile === 'Clean' ? '  ✓ (Active - Default)' : ' (Default)'}`,
            description: 'Balanced cleanup',
            detail: 'Removes comments, blank lines, and tightens operator spacing while preserving readable indentation.',
            profile: 'Clean',
            picked: currentProfile === 'Clean'
        },
        {
            label: `$(zap) Minify${currentProfile === 'Minify' ? '  ✓ (Active)' : ''}`,
            description: 'Maximum compression',
            detail: 'Aggressively removes all unnecessary whitespace, empty lines, and indentation for minimal file size.',
            profile: 'Minify',
            picked: currentProfile === 'Minify'
        },
        {
            label: `$(shield) Obfuscate${currentProfile === 'Obfuscate' ? '  ✓ (Active)' : ''}`,
            description: 'Mangle JS variables & drop logs',
            detail: 'Mangles identifier names to single letters and removes console.log statements (JavaScript only).',
            profile: 'Obfuscate',
            picked: currentProfile === 'Obfuscate'
        }
    ];
}

async function executeCleanOnEditor(
    editor: vscode.TextEditor,
    customProfile?: ProfileType,
    forceScope?: 'selection' | 'file'
) {
    const document = editor.document;
    const languageId = document.languageId;
    const selection = editor.selection;
    const isFragment = forceScope === 'selection' ? true : forceScope === 'file' ? false : !selection.isEmpty;

    let rangeToReplace: vscode.Range;
    let textToProcess: string;

    if (isFragment) {
        rangeToReplace = new vscode.Range(selection.start, selection.end);
        textToProcess = document.getText(rangeToReplace);
    } else {
        const firstLine = document.lineAt(0);
        const lastLine = document.lineAt(document.lineCount - 1);
        rangeToReplace = new vscode.Range(firstLine.range.start, lastLine.range.end);
        textToProcess = document.getText();
    }

    const options = getConfig(document);
    if (customProfile) {
        options.profile = customProfile;
    }

    try {
        const finalText = await processTextPreservingWhitespace(textToProcess, languageId, options, isFragment);

        if (finalText !== textToProcess) {
            await editor.edit(editBuilder => {
                editBuilder.replace(rangeToReplace, finalText);
            });
            vscode.window.showInformationMessage(
                isFragment ? `Selection cleaned (${options.profile}).` : `File cleaned (${options.profile}).`
            );
        } else {
            vscode.window.showInformationMessage(
                isFragment ? 'Selected code is already clean.' : 'File is already clean.'
            );
        }
    } catch (err: any) {
        vscode.window.showErrorMessage('Failed to apply code cleaner: ' + err.message);
    }
}

export function registerCommands(context: vscode.ExtensionContext) {
    let cleanDisposable = vscode.commands.registerCommand('code-cleaner.cleanCode', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }
        await executeCleanOnEditor(editor);
    });

    let cleanSelectionDisposable = vscode.commands.registerCommand('code-cleaner.cleanSelection', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }
        await executeCleanOnEditor(editor, undefined, 'selection');
    });

    let cleanFileDisposable = vscode.commands.registerCommand('code-cleaner.cleanFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }
        await executeCleanOnEditor(editor, undefined, 'file');
    });

    let cleanWithProfileDisposable = vscode.commands.registerCommand('code-cleaner.cleanWithProfile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }

        const currentProfile = getConfig(editor.document).profile;
        const isSelection = !editor.selection.isEmpty;
        const targetLabel = isSelection ? 'selection' : 'file';

        const selected = await vscode.window.showQuickPick(getProfileQuickPickItems(currentProfile), {
            placeHolder: `Select profile to clean ${targetLabel} (current default: ${currentProfile})`
        });

        if (selected) {
            await executeCleanOnEditor(editor, selected.profile);
        }
    });

    let previewDisposable = vscode.commands.registerCommand('code-cleaner.cleanWithPreview', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }

        const document = editor.document;
        const languageId = document.languageId;
        const textToProcess = document.getText();
        const options = getConfig(document);

        try {
            const finalText = await processTextPreservingWhitespace(textToProcess, languageId, options, false);
            const previewUri = vscode.Uri.parse(
                `${CleanPreviewProvider.scheme}://${path.basename(document.fileName)}`
            );
            previewProvider.setContent(previewUri, finalText);

            await vscode.commands.executeCommand(
                'vscode.diff',
                document.uri,
                previewUri,
                `${path.basename(document.fileName)} ↔ Cleaned Preview`
            );
        } catch (err: any) {
            vscode.window.showErrorMessage('Failed to generate clean preview: ' + err.message);
        }
    });

    let cleanFileFromExplorerDisposable = vscode.commands.registerCommand('code-cleaner.cleanFileFromExplorer', async (fileUri?: vscode.Uri) => {
        const targetUri = fileUri || vscode.window.activeTextEditor?.document.uri;
        if (!targetUri) {
            vscode.window.showErrorMessage('No file selected.');
            return;
        }

        if (!isCleanableFile(targetUri)) {
            vscode.window.showWarningMessage('Selected file is binary or ignored.');
            return;
        }

        try {
            const document = await vscode.workspace.openTextDocument(targetUri);
            const options = getConfig(document);
            const textToProcess = document.getText();
            const finalText = await processTextPreservingWhitespace(textToProcess, document.languageId, options, false);

            if (finalText !== textToProcess) {
                const edit = new vscode.WorkspaceEdit();
                const fullRange = new vscode.Range(
                    document.lineAt(0).range.start,
                    document.lineAt(document.lineCount - 1).range.end
                );
                edit.replace(targetUri, fullRange, finalText);
                const success = await vscode.workspace.applyEdit(edit);
                if (success) {
                    await document.save();
                    vscode.window.showInformationMessage(`CodeCleaner: ${path.basename(targetUri.fsPath)} cleaned and saved.`);
                }
            } else {
                vscode.window.showInformationMessage(`CodeCleaner: ${path.basename(targetUri.fsPath)} is already clean.`);
            }
        } catch (err: any) {
            vscode.window.showErrorMessage('Failed to clean file: ' + err.message);
        }
    });

    let switchProfileDisposable = vscode.commands.registerCommand('code-cleaner.switchProfile', async () => {
        const currentProfile = getConfig().profile;

        const selected = await vscode.window.showQuickPick(getProfileQuickPickItems(currentProfile), {
            placeHolder: `Select default CodeCleaner profile (current: ${currentProfile})`
        });

        if (selected) {
            await vscode.workspace.getConfiguration('codeCleaner').update('profile', selected.profile, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`CodeCleaner: Default profile switched to "${selected.profile}".`);
        }
    });

    let cleanFolderDisposable = vscode.commands.registerCommand('code-cleaner.cleanFolder', async (folderUri: vscode.Uri) => {
        if (!folderUri) {
            vscode.window.showErrorMessage('No folder selected.');
            return;
        }

        const options = getConfig();

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "CodeCleaner: Cleaning Folder",
            cancellable: true
        }, async (progress, token) => {
            try {
                const pattern = new vscode.RelativePattern(folderUri, '**/*');
                const excludePattern = new vscode.RelativePattern(
                    folderUri,
                    '**/{node_modules,.git,dist,build,out,.next,.svelte-kit,.nuxt,coverage,.vscode,.idea}/**'
                );
                const allFiles = await vscode.workspace.findFiles(pattern, excludePattern);
                const files = allFiles.filter(isCleanableFile);

                if (files.length === 0) {
                    vscode.window.showInformationMessage('CodeCleaner: No eligible text files to clean.');
                    return;
                }

                let processedCount = 0;
                let modifiedCount = 0;
                let errorCount = 0;
                let currentIndex = 0;
                const concurrencyLimit = 4;

                const processNext = async (): Promise<void> => {
                    while (currentIndex < files.length) {
                        if (token.isCancellationRequested) break;

                        const fileUri = files[currentIndex++];
                        try {
                            const document = await vscode.workspace.openTextDocument(fileUri);
                            const languageId = document.languageId;
                            const textToProcess = document.getText();

                            const finalText = await processTextPreservingWhitespace(textToProcess, languageId, options, false);

                            if (finalText !== textToProcess) {
                                const edit = new vscode.WorkspaceEdit();
                                const fullRange = new vscode.Range(
                                    document.lineAt(0).range.start,
                                    document.lineAt(document.lineCount - 1).range.end
                                );
                                edit.replace(fileUri, fullRange, finalText);
                                const success = await vscode.workspace.applyEdit(edit);
                                if (success) {
                                    await document.save();
                                    modifiedCount++;
                                }
                            }
                            processedCount++;
                        } catch (err) {
                            errorCount++;
                            console.warn(`CodeCleaner: Failed to clean ${fileUri.fsPath}`, err);
                        }

                        progress.report({
                            increment: (1 / files.length) * 100,
                            message: `Processed ${processedCount}/${files.length} (${modifiedCount} modified)`
                        });
                    }
                };

                const workers = Array.from({ length: Math.min(concurrencyLimit, files.length) }, () => processNext());
                await Promise.all(workers);

                if (!token.isCancellationRequested) {
                    vscode.window.showInformationMessage(
                        `CodeCleaner: Finished cleaning folder. Checked: ${processedCount}, Modified: ${modifiedCount}, Errors/Skipped: ${errorCount}`
                    );
                }
            } catch (err: any) {
                vscode.window.showErrorMessage('Failed to clean folder: ' + err.message);
            }
        });
    });

    context.subscriptions.push(cleanDisposable);
    context.subscriptions.push(cleanSelectionDisposable);
    context.subscriptions.push(cleanFileDisposable);
    context.subscriptions.push(cleanWithProfileDisposable);
    context.subscriptions.push(previewDisposable);
    context.subscriptions.push(cleanFileFromExplorerDisposable);
    context.subscriptions.push(switchProfileDisposable);
    context.subscriptions.push(cleanFolderDisposable);
}

