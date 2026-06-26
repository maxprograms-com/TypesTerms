#!/usr/bin/env node
/*******************************************************************************
 * Copyright (c) 2024 - 2026 Maxprograms.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License 1.0 which accompanies this distribution,
 * and is available at https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors: Maxprograms - initial API and implementation
 *******************************************************************************/

import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { I18n } from './I18n.js';
import { Term } from './Term.js';
import { TermExtractor } from './TermExtractor.js';

class TermExtractorRunner {

    constructor() {
        let xliffFile: string = '';
        let outputFile: string = '';
        let minFrequency: number = 3;
        let maxScore: number = 10.0;
        let maxTermLength: number = 3;
        let relevant: boolean = false;
        let showHelp: boolean = false;
        let appLanguage: string = Intl.DateTimeFormat().resolvedOptions().locale;

        const args: Array<string> = process.argv;
        for (let i: number = 0; i < args.length; i++) {
            if (args[i] === '-xliff' && i + 1 < args.length) {
                xliffFile = args[i + 1];
            }
            if (args[i] === '-output' && i + 1 < args.length) {
                outputFile = args[i + 1];
            }
            if (args[i] === '-minFreq' && i + 1 < args.length) {
                minFrequency = parseInt(args[i + 1], 10);
            }
            if (args[i] === '-maxScore' && i + 1 < args.length) {
                maxScore = parseFloat(args[i + 1]);
            }
            if (args[i] === '-maxLength' && i + 1 < args.length) {
                maxTermLength = parseInt(args[i + 1], 10);
            }
            if (args[i] === '-relevant') {
                relevant = true;
            }
            if (args[i] === '-lang' && i + 1 < args.length) {
                appLanguage = args[i + 1];
            }
            if (args[i] === '-help') {
                showHelp = true;
            }
        }

        const baseDir: string = dirname(fileURLToPath(import.meta.url));
        const lang: string = appLanguage.split('-')[0].split('_')[0];
        const langFile: string = join(baseDir, 'terms_' + lang + '.json');
        const i18n: I18n = new I18n(existsSync(langFile) ? langFile : join(baseDir, 'terms_en.json'));

        if (showHelp || !xliffFile) {
            console.log(i18n.getString('termExtractor', 'usage'));
            process.exit(showHelp ? 0 : 1);
        }

        xliffFile = resolve(xliffFile);
        if (!existsSync(xliffFile)) {
            console.error(i18n.format(i18n.getString('termExtractor', 'fileNotFound'), [xliffFile]));
            process.exit(1);
        }

        if (minFrequency < 1) {
            console.error(i18n.getString('termExtractor', 'minFreqError'));
            process.exit(1);
        }
        if (maxScore <= 0) {
            console.error(i18n.getString('termExtractor', 'maxScoreError'));
            process.exit(1);
        }
        if (maxTermLength < 1) {
            console.error(i18n.getString('termExtractor', 'maxLengthError'));
            process.exit(1);
        }

        if (!outputFile) {
            const dot: number = xliffFile.lastIndexOf('.');
            outputFile = dot !== -1 ? xliffFile.substring(0, dot) + '.csv' : xliffFile + '.csv';
        }

        try {
            const extractor: TermExtractor = new TermExtractor(xliffFile, maxTermLength, minFrequency, maxScore, relevant, appLanguage);
            const terms: Array<Term> = extractor.getTerms();
            terms.sort((a: Term, b: Term) => a.compareTo(b));
            const csvHeader: string = i18n.getString('termExtractor', 'csvHeader');
            let content: string = '﻿' + csvHeader;
            for (let i: number = 0; i < terms.length; i++) {
                content += (i + 1) + ',' + terms[i].getData() + '\n';
            }
            writeFileSync(outputFile, content, { encoding: 'utf16le' });
            console.log(i18n.format(i18n.getString('termExtractor', 'written'), [outputFile, String(terms.length)]));
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(error.message);
            } else {
                console.error(error);
            }
            process.exit(1);
        }
    }
}

new TermExtractorRunner();
