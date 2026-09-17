import * as vscode from 'vscode';

export interface CleanOptions {
    profile: 'Format' | 'Clean' | 'Minify' | 'Obfuscate';
    removeComments: boolean;
    removeBlankLines: boolean;
    removeSpacesAroundOperators: boolean;
    removeIndentation: boolean;
    cleanOnSave: boolean;
    preserveLegalHeaders?: boolean;
    preserveDocstrings?: boolean;
}

export function getConfig(scope?: vscode.TextDocument | vscode.Uri): CleanOptions {
    const resource = scope && 'uri' in scope ? scope.uri : scope;
    const config = vscode.workspace.getConfiguration('codeCleaner', resource);
    return {
        profile: config.get<'Format' | 'Clean' | 'Minify' | 'Obfuscate'>('profile', 'Clean'),
        removeComments: config.get<boolean>('removeComments', true),
        removeBlankLines: config.get<boolean>('removeBlankLines', true),
        removeSpacesAroundOperators: config.get<boolean>('removeSpacesAroundOperators', true),
        removeIndentation: config.get<boolean>('removeIndentation', false),
        cleanOnSave: config.get<boolean>('cleanOnSave', false),
        preserveLegalHeaders: config.get<boolean>('preserveLegalHeaders', true),
        preserveDocstrings: config.get<boolean>('preserveDocstrings', false),
    };
}
