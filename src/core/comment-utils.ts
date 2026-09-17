import { CleanOptions } from '../config';

export function shouldPreserveComment(commentText: string, options: CleanOptions): boolean {
    if (!options.removeComments || options.profile === 'Format') {
        return true;
    }

    if (options.preserveLegalHeaders !== false) {
        if (/^\/\*!|^\/\/!|@license|@preserve/i.test(commentText)) {
            return true;
        }
        if (/copyright\s+(\(c\)|©|\d{4})|spdx-license-identifier:|all rights reserved/i.test(commentText)) {
            return true;
        }
    }

    if (options.preserveDocstrings) {
        if (commentText.startsWith('/**')) {
            return true;
        }
    }

    return false;
}
