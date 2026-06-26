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

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BilingualExtraction } from './BilingualExtraction.js';
import { I18n } from './I18n.js';

class BilingualExtractionRunner {

    constructor() {
        let xliffFile: string = '';
        let outputFile: string = '';
        let minFrequency: number = 3;
        let maxScore: number = 10.0;
        let maxTermLength: number = 5;
        let minCoOccurrence: number = 1;
        let maxPairs: number = 0;
        let minCoOccurrenceRatio: number = 0.7;
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
            if (args[i] === '-minCoOccurrence' && i + 1 < args.length) {
                minCoOccurrence = parseInt(args[i + 1], 10);
            }
            if (args[i] === '-maxPairs' && i + 1 < args.length) {
                maxPairs = parseInt(args[i + 1], 10);
            }
            if (args[i] === '-minCoOccurrenceRatio' && i + 1 < args.length) {
                minCoOccurrenceRatio = parseFloat(args[i + 1]);
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
            console.log(i18n.getString('bilingualExtraction', 'usage'));
            process.exit(showHelp ? 0 : 1);
        }

        xliffFile = resolve(xliffFile);
        if (!existsSync(xliffFile)) {
            console.error(i18n.format(i18n.getString('bilingualExtraction', 'fileNotFound'), [xliffFile]));
            process.exit(1);
        }

        if (minFrequency < 1) {
            console.error(i18n.getString('bilingualExtraction', 'minFreqError'));
            process.exit(1);
        }
        if (maxScore <= 0) {
            console.error(i18n.getString('bilingualExtraction', 'maxScoreError'));
            process.exit(1);
        }
        if (maxTermLength < 1) {
            console.error(i18n.getString('bilingualExtraction', 'maxLengthError'));
            process.exit(1);
        }
        if (minCoOccurrence < 1) {
            console.error(i18n.getString('bilingualExtraction', 'minCoOccurrenceError'));
            process.exit(1);
        }
        if (maxPairs < 0) {
            console.error(i18n.getString('bilingualExtraction', 'maxPairsError'));
            process.exit(1);
        }
        if (minCoOccurrenceRatio < 0.0 || minCoOccurrenceRatio > 1.0) {
            console.error(i18n.getString('bilingualExtraction', 'minRatioError'));
            process.exit(1);
        }

        if (!outputFile) {
            const dot: number = xliffFile.lastIndexOf('.');
            outputFile = dot !== -1 ? xliffFile.substring(0, dot) + '_bilingual.csv' : xliffFile + '_bilingual.csv';
        }

        try {
            const extractor: BilingualExtraction = new BilingualExtraction();
            extractor.extract(xliffFile, outputFile, minFrequency, maxScore, maxTermLength,
                minCoOccurrence, maxPairs, minCoOccurrenceRatio, appLanguage);
            console.log(i18n.format(i18n.getString('bilingualExtraction', 'written'), [outputFile]));
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

new BilingualExtractionRunner();
