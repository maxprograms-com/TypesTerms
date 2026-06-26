/*******************************************************************************
 * Copyright (c) 2024 - 2026 Maxprograms.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License 1.0 which accompanies this distribution,
 * and is available at https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors: Maxprograms - initial API and implementation
 *******************************************************************************/

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { XliffGroup } from 'typesxliff';
import { XliffDocument, XliffFile, XliffParser, XliffSegment, XliffSource, XliffUnit } from 'typesxliff';
import { I18n } from './I18n.js';
import type { ITerm } from './ITerm.js';
import type { ITermPair } from './ITermPair.js';
import { TermExtractor } from './TermExtractor.js';
import { TermUtils } from './TermUtils.js';

export class TermPair implements ITermPair {

    readonly sourceTerm: ITerm;
    readonly targetTerm: ITerm;
    readonly sharedSegments: Set<number>;

    constructor(sourceTerm: ITerm, targetTerm: ITerm, sharedSegments: Set<number>) {
        this.sourceTerm = sourceTerm;
        this.targetTerm = targetTerm;
        this.sharedSegments = sharedSegments;
    }

    getCoOccurrenceCount(): number {
        return this.sharedSegments.size;
    }
}

export class BilingualExtraction {

    extract(xliffFile: string, outputFile: string, minFrequency: number, maxScore: number,
        maxTermLength: number, minCoOccurrence: number, maxPairs: number,
        minCoOccurrenceRatio: number, appLanguage?: string): void {

        const baseDir: string = dirname(fileURLToPath(import.meta.url));
        const lang: string = (appLanguage ?? Intl.DateTimeFormat().resolvedOptions().locale).split('-')[0].split('_')[0];
        const langFile: string = join(baseDir, 'terms_' + lang + '.json');
        const i18n: I18n = new I18n(existsSync(langFile) ? langFile : join(baseDir, 'terms_en.json'));

        const parser: XliffParser = new XliffParser();
        parser.parseFile(xliffFile);
        const doc: XliffDocument | undefined = parser.getXliffDocument();
        if (doc === undefined) {
            throw new Error(i18n.format(i18n.getString('bilingualExtraction', 'parseError'), [xliffFile]));
        }
        const srcLang: string = doc.srcLang;
        if (!srcLang) {
            throw new Error(i18n.format(i18n.getString('bilingualExtraction', 'noSrcLang'), [xliffFile]));
        }
        const trgLang: string | undefined = doc.trgLang;
        if (!trgLang) {
            throw new Error(i18n.format(i18n.getString('bilingualExtraction', 'noTrgLang'), [xliffFile]));
        }

        const tempDir: string = mkdtempSync(join(tmpdir(), 'bilingual-'));
        try {
            const srcPath: string = join(tempDir, 'source.xlf');
            const trgPath: string = join(tempDir, 'target.xlf');

            const segmentCount: number = this.createTempXliffFiles(doc, srcLang, trgLang, srcPath, trgPath);
            if (segmentCount === 0) {
                return;
            }

            const sourceExtractor: TermExtractor = new TermExtractor(srcPath, maxTermLength, minFrequency, maxScore, false, appLanguage);
            const sourceTerms: Array<ITerm> = sourceExtractor.getTerms();
            const sourceSentenceToSegment: Array<number> = sourceExtractor.getSentenceToSegmentMap();

            const targetExtractor: TermExtractor = new TermExtractor(trgPath, maxTermLength, minFrequency, maxScore, false, appLanguage);
            const targetTerms: Array<ITerm> = targetExtractor.getTerms();
            const targetSentenceToSegment: Array<number> = targetExtractor.getSentenceToSegmentMap();

            const sourceTermSegments: Map<string, Set<number>> = this.buildTermSegmentMap(sourceTerms, sourceSentenceToSegment);
            const targetTermSegments: Map<string, Set<number>> = this.buildTermSegmentMap(targetTerms, targetSentenceToSegment);

            let pairs: Array<TermPair> = this.generatePairs(sourceTerms, targetTerms, sourceTermSegments, targetTermSegments);
            pairs = this.filterPairs(pairs, minCoOccurrence, maxPairs, minCoOccurrenceRatio);
            pairs = this.filterMutualBestMatch(pairs);
            pairs = this.deduplicatePairs(pairs);

            this.writeCSV(outputFile, pairs);
        } finally {
            rmSync(tempDir, { recursive: true });
        }
    }

    private createTempXliffFiles(doc: XliffDocument, srcLang: string, trgLang: string,
        srcPath: string, trgPath: string): number {

        const srcDoc: XliffDocument = new XliffDocument('2.1', srcLang);
        const srcFile: XliffFile = new XliffFile('f1');
        srcDoc.addFile(srcFile);

        const trgDoc: XliffDocument = new XliffDocument('2.1', trgLang);
        const trgFile: XliffFile = new XliffFile('f1');
        trgDoc.addFile(trgFile);

        for (const file of doc.files) {
            this.collectFinalSegmentPairs(file.entries, srcFile, trgFile);
        }

        const segmentCount: number = srcFile.entries.length;
        if (segmentCount > 0) {
            srcDoc.writeDocument(srcPath);
            trgDoc.writeDocument(trgPath);
        }
        return segmentCount;
    }

    private collectFinalSegmentPairs(entries: Array<XliffUnit | XliffGroup>,
        srcFile: XliffFile, trgFile: XliffFile): void {

        for (const entry of entries) {
            if ('entries' in entry) {
                this.collectFinalSegmentPairs(entry.entries, srcFile, trgFile);
            } else {
                for (const item of entry.items) {
                    if (item.elementName !== 'segment') {
                        continue;
                    }
                    const segment: XliffSegment = item as XliffSegment;
                    if (segment.state !== 'final') {
                        continue;
                    }
                    if (segment.source === undefined || segment.target === undefined) {
                        continue;
                    }
                    const sourceText: string = TermUtils.pureText(segment.source);
                    const targetText: string = TermUtils.pureText(segment.target);
                    if (sourceText.trim().length === 0 || targetText.trim().length === 0) {
                        continue;
                    }
                    const segId: string = String(srcFile.entries.length + 1);

                    const srcUnit: XliffUnit = new XliffUnit(segId);
                    const srcSeg: XliffSegment = new XliffSegment(segId);
                    const srcSource: XliffSource = new XliffSource();
                    srcSource.addText(sourceText);
                    srcSeg.source = srcSource;
                    srcUnit.addSegment(srcSeg);
                    srcFile.addUnit(srcUnit);

                    const trgUnit: XliffUnit = new XliffUnit(segId);
                    const trgSeg: XliffSegment = new XliffSegment(segId);
                    const trgSource: XliffSource = new XliffSource();
                    trgSource.addText(targetText);
                    trgSeg.source = trgSource;
                    trgUnit.addSegment(trgSeg);
                    trgFile.addUnit(trgUnit);
                }
            }
        }
    }

    private buildTermSegmentMap(terms: Array<ITerm>,
        sentenceToSegment: Array<number>): Map<string, Set<number>> {

        const termSegments: Map<string, Set<number>> = new Map<string, Set<number>>();
        for (const term of terms) {
            const segments: Set<number> = new Set<number>();
            for (const sentenceIndex of term.getOffsetSentences()) {
                if (sentenceIndex < sentenceToSegment.length) {
                    segments.add(sentenceToSegment[sentenceIndex]);
                }
            }
            termSegments.set(term.text, segments);
        }
        return termSegments;
    }

    private generatePairs(sourceTerms: Array<ITerm>, targetTerms: Array<ITerm>,
        sourceTermSegments: Map<string, Set<number>>,
        targetTermSegments: Map<string, Set<number>>): Array<TermPair> {

        const pairs: Array<TermPair> = [];
        for (const sourceTerm of sourceTerms) {
            const sourceSegs: Set<number> | undefined = sourceTermSegments.get(sourceTerm.text);
            if (sourceSegs === undefined || sourceSegs.size === 0) {
                continue;
            }
            for (const targetTerm of targetTerms) {
                const targetSegs: Set<number> | undefined = targetTermSegments.get(targetTerm.text);
                if (targetSegs === undefined || targetSegs.size === 0) {
                    continue;
                }
                const sharedSegments: Set<number> = new Set<number>(
                    Array.from(sourceSegs).filter((s: number) => targetSegs.has(s))
                );
                if (sharedSegments.size > 0) {
                    pairs.push(new TermPair(sourceTerm, targetTerm, sharedSegments));
                }
            }
        }
        return pairs;
    }

    private filterMutualBestMatch(pairs: Array<TermPair>): Array<TermPair> {
        const bestTargetForSource: Map<string, TermPair> = new Map<string, TermPair>();
        const bestSourceForTarget: Map<string, TermPair> = new Map<string, TermPair>();

        for (const pair of pairs) {
            const existing: TermPair | undefined = bestTargetForSource.get(pair.sourceTerm.text);
            if (existing === undefined || pair.getCoOccurrenceCount() > existing.getCoOccurrenceCount()) {
                bestTargetForSource.set(pair.sourceTerm.text, pair);
            }
        }
        for (const pair of pairs) {
            const existing: TermPair | undefined = bestSourceForTarget.get(pair.targetTerm.text);
            if (existing === undefined || pair.getCoOccurrenceCount() > existing.getCoOccurrenceCount()) {
                bestSourceForTarget.set(pair.targetTerm.text, pair);
            }
        }

        const filtered: Array<TermPair> = [];
        for (const pair of pairs) {
            if (bestTargetForSource.get(pair.sourceTerm.text) === pair &&
                bestSourceForTarget.get(pair.targetTerm.text) === pair) {
                filtered.push(pair);
            }
        }
        return filtered;
    }

    private filterPairs(pairs: Array<TermPair>, minCoOccurrence: number, maxPairs: number,
        minCoOccurrenceRatio: number): Array<TermPair> {

        let filtered: Array<TermPair> = pairs.filter((pair: TermPair) => {
            if (pair.getCoOccurrenceCount() < minCoOccurrence) {
                return false;
            }
            const sourceRatio: number = pair.getCoOccurrenceCount() / pair.sourceTerm.getTermFrequency();
            const targetRatio: number = pair.getCoOccurrenceCount() / pair.targetTerm.getTermFrequency();
            return sourceRatio >= minCoOccurrenceRatio && targetRatio >= minCoOccurrenceRatio;
        });

        filtered.sort((a: TermPair, b: TermPair) => b.getCoOccurrenceCount() - a.getCoOccurrenceCount());

        if (maxPairs > 0) {
            const bySource: Map<string, Array<TermPair>> = new Map<string, Array<TermPair>>();
            for (const pair of filtered) {
                const key: string = pair.sourceTerm.text;
                if (!bySource.has(key)) {
                    bySource.set(key, []);
                }
                bySource.get(key)!.push(pair);
            }
            const limitedBySource: Array<TermPair> = [];
            for (const termPairs of bySource.values()) {
                limitedBySource.push(...termPairs.slice(0, maxPairs));
            }

            const byTarget: Map<string, Array<TermPair>> = new Map<string, Array<TermPair>>();
            for (const pair of limitedBySource) {
                const key: string = pair.targetTerm.text;
                if (!byTarget.has(key)) {
                    byTarget.set(key, []);
                }
                byTarget.get(key)!.push(pair);
            }
            const limitedByTarget: Array<TermPair> = [];
            for (const termPairs of byTarget.values()) {
                limitedByTarget.push(...termPairs.slice(0, maxPairs));
            }
            filtered = limitedByTarget;
        }
        return filtered;
    }

    private deduplicatePairs(pairs: Array<TermPair>): Array<TermPair> {
        const bySource: Map<string, Array<TermPair>> = new Map<string, Array<TermPair>>();
        for (const pair of pairs) {
            const key: string = pair.sourceTerm.text + '|' + Array.from(pair.sharedSegments).join(',');
            if (!bySource.has(key)) {
                bySource.set(key, []);
            }
            bySource.get(key)!.push(pair);
        }
        const afterSourceDedup: Array<TermPair> = [];
        for (const group of bySource.values()) {
            afterSourceDedup.push(...this.deduplicateBySubstring(group, false));
        }

        const byTarget: Map<string, Array<TermPair>> = new Map<string, Array<TermPair>>();
        for (const pair of afterSourceDedup) {
            const key: string = pair.targetTerm.text + '|' + Array.from(pair.sharedSegments).join(',');
            if (!byTarget.has(key)) {
                byTarget.set(key, []);
            }
            byTarget.get(key)!.push(pair);
        }
        const deduplicated: Array<TermPair> = [];
        for (const group of byTarget.values()) {
            deduplicated.push(...this.deduplicateBySubstring(group, true));
        }
        return deduplicated;
    }

    private deduplicateBySubstring(group: Array<TermPair>, checkSource: boolean): Array<TermPair> {
        if (group.length === 1) {
            return group;
        }
        const kept: Array<boolean> = new Array<boolean>(group.length).fill(true);
        for (let i: number = 0; i < group.length; i++) {
            if (!kept[i]) {
                continue;
            }
            const term1: string = checkSource
                ? group[i].sourceTerm.text.toLowerCase()
                : group[i].targetTerm.text.toLowerCase();
            for (let j: number = 0; j < group.length; j++) {
                if (i === j || !kept[j]) {
                    continue;
                }
                const term2: string = checkSource
                    ? group[j].sourceTerm.text.toLowerCase()
                    : group[j].targetTerm.text.toLowerCase();
                if (term2.includes(term1) && term1 !== term2) {
                    kept[i] = false;
                    break;
                }
                if (term1.includes(term2) && term1 !== term2) {
                    kept[j] = false;
                }
            }
        }
        const remaining: Array<TermPair> = group.filter((_: TermPair, i: number) => kept[i]);
        if (remaining.length <= 1) {
            return remaining;
        }
        let best: TermPair = remaining[0];
        let bestScore: number = checkSource ? best.sourceTerm.getScore() : best.targetTerm.getScore();
        for (let i: number = 1; i < remaining.length; i++) {
            const candidate: TermPair = remaining[i];
            const candidateScore: number = checkSource
                ? candidate.sourceTerm.getScore()
                : candidate.targetTerm.getScore();
            if (candidateScore < bestScore) {
                best = candidate;
                bestScore = candidateScore;
            }
        }
        return [best];
    }

    private writeCSV(outputFile: string, pairs: Array<TermPair>): void {
        const header: string = 'SourceTerm,SourceScore,SourceFreq,TargetTerm,TargetScore,TargetFreq,SharedSegments,CoOccurrenceCount\n';
        let content: string = '\ufeff' + header;
        for (const pair of pairs) {
            const segmentList: string = Array.from(pair.sharedSegments).join('|');
            content += this.escapeCsv(pair.sourceTerm.text) + ','
                + pair.sourceTerm.getScore().toFixed(6) + ','
                + pair.sourceTerm.getTermFrequency() + ','
                + this.escapeCsv(pair.targetTerm.text) + ','
                + pair.targetTerm.getScore().toFixed(6) + ','
                + pair.targetTerm.getTermFrequency() + ','
                + '"' + segmentList + '",'
                + pair.getCoOccurrenceCount() + '\n';
        }
        writeFileSync(outputFile, content, { encoding: 'utf16le' });
    }

    private escapeCsv(value: string): string {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return '"' + value.replace(/"/g, '""') + '"';
        }
        return value;
    }
}
