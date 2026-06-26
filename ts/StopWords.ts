/*******************************************************************************
 * Copyright (c) 2024 - 2026 Maxprograms.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License 1.0 which accompanies this distribution,
 * and is available at https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors: Maxprograms - initial API and implementation
 *******************************************************************************/

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export class StopWords {

    private static wordsList: Record<string, Array<string>> | undefined;

    private constructor() {
        // do not instantiate
    }

    private static load(): void {
        const baseDir: string = dirname(fileURLToPath(import.meta.url));
        const content: string = readFileSync(join(baseDir, 'stopWords.json'), 'utf-8');
        StopWords.wordsList = JSON.parse(content) as Record<string, Array<string>>;
    }

    static getStopWords(language: string): Array<string> {
        if (StopWords.wordsList === undefined) {
            StopWords.load();
        }
        let lang: string = language;
        const hyphen: number = lang.indexOf('-');
        if (hyphen !== -1) {
            lang = lang.substring(0, hyphen);
        }
        const words: Array<string> | undefined = StopWords.wordsList![lang];
        return words !== undefined ? words : [];
    }

    static getLanguages(): Set<string> {
        if (StopWords.wordsList === undefined) {
            StopWords.load();
        }
        return new Set<string>(Object.keys(StopWords.wordsList!));
    }
}
