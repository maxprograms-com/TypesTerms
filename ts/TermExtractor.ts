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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { XliffDocument, XliffGroup, XliffSegment, XliffUnit } from 'typesxliff';
import { XliffParser } from 'typesxliff';
import { I18n } from './I18n.js';
import { LevenshteinDistance } from './LevenshteinDistance.js';
import { StopWords } from './StopWords.js';
import { Term } from './Term.js';
import { TermUtils } from './TermUtils.js';
import { Token } from './Token.js';

const NBSP: string = '\u00A0';

export class TermExtractor {

    private static readonly WINDOW: number = 2;

    private stopWords: Array<string> = [];
    private srcLang!: string;
    private sentences: Array<string> = [];
    private index: Map<string, number> = new Map<string, number>();
    private chunks: Array<Array<string>> = [];
    private terms: Array<Term> = [];
    private sentenceToSegmentNumber: Array<number> = [];
    private currentSegmentNumber: number = 0;
    private sentenceSegmenter!: Intl.Segmenter;
    private wordSegmenter!: Intl.Segmenter;
    private i18n!: I18n;

    constructor(xliffFile: string, maxTermLength: number, minFrequency: number, maxScore: number, relevant: boolean, appLanguage?: string) {
        const baseDir: string = dirname(fileURLToPath(import.meta.url));
        const resolved: string = (appLanguage ?? Intl.DateTimeFormat().resolvedOptions().locale).split('-')[0].split('_')[0];
        const lang: string = resolved === 'es' ? 'es' : 'en';
        const langFile: string = join(baseDir, 'terms_' + lang + '.json');
        this.i18n = new I18n(existsSync(langFile) ? langFile : join(baseDir, 'terms_en.json'));

        const parser: XliffParser = new XliffParser();
        parser.parseFile(xliffFile);
        const doc: XliffDocument | undefined = parser.getXliffDocument();
        if (doc === undefined) {
            throw new Error(this.i18n.format(this.i18n.getString('termExtractor', 'parseError'), [xliffFile]));
        }
        this.srcLang = doc.srcLang;
        if (!this.srcLang) {
            throw new Error(this.i18n.format(this.i18n.getString('termExtractor', 'noSrcLang'), [xliffFile]));
        }
        this.sentenceSegmenter = new Intl.Segmenter(this.srcLang, { granularity: 'sentence' });
        this.wordSegmenter = new Intl.Segmenter(this.srcLang, { granularity: 'word' });
        this.stopWords = StopWords.getStopWords(this.srcLang);

        this.buildSentences(doc);
        this.preProcess();
        this.termStatistics();
        this.featureComputation();
        this.generateCandidates(maxTermLength, minFrequency, maxScore, relevant);
        this.deduplicateTerms();
    }

    getTerms(): Array<Term> {
        return this.terms;
    }

    getSentenceToSegmentMap(): Array<number> {
        return this.sentenceToSegmentNumber;
    }

    static standardDeviation(frequencies: Array<number>): number {
        const length: number = frequencies.length;
        if (length === 0) {
            return 0;
        }
        let sum: number = 0;
        for (const num of frequencies) {
            sum += num;
        }
        const mean: number = sum / length;
        let deviations: number = 0;
        for (const num of frequencies) {
            deviations += Math.pow(num - mean, 2);
        }
        const variance: number = length > 1 ? deviations / (length - 1) : 0;
        return Math.sqrt(variance);
    }

    private buildSentences(doc: XliffDocument): void {
        for (const file of doc.files) {
            this.processEntries(file.entries);
        }
    }

    private processEntries(entries: Array<XliffUnit | XliffGroup>): void {
        for (const entry of entries) {
            if ('entries' in entry) {
                this.processEntries(entry.entries);
            } else {
                this.processUnit(entry as XliffUnit);
            }
        }
    }

    private processUnit(unit: XliffUnit): void {
        for (const item of unit.items) {
            if (item.elementName !== 'segment') {
                continue;
            }
            const segment: XliffSegment = item as XliffSegment;
            this.currentSegmentNumber++;
            if (segment.source === undefined) {
                throw new Error(this.i18n.format(this.i18n.getString('termExtractor', 'noSource'), [String(segment.id ?? ''), String(unit.id ?? '')]));
            }
            const sourceText: string = TermUtils.pureText(segment.source);
            if (sourceText.trim().length === 0) {
                continue;
            }
            for (const { segment: sentenceText } of this.sentenceSegmenter.segment(sourceText)) {
                const sentence: string = sentenceText.replace(new RegExp(NBSP, 'g'), ' ').trim();
                if (sentence.length > 0) {
                    this.sentences.push(sentence);
                    this.sentenceToSegmentNumber.push(this.currentSegmentNumber);
                }
            }
        }
    }

    private preProcess(): void {
        for (let i: number = 0; i < this.sentences.length; i++) {
            this.chunks.push(this.getChunks(this.sentences[i]));
        }
    }

    private termStatistics(): void {
        for (let i: number = 0; i < this.sentences.length; i++) {
            const chunkArray: Array<string> = this.chunks[i];
            for (let j: number = 0; j < chunkArray.length; j++) {
                const tokens: Array<Token> = this.getTokens(chunkArray[j], j === 0);
                for (let k: number = 0; k < tokens.length; k++) {
                    const token: Token = tokens[k];
                    const key: string = token.lower;
                    if (!this.index.has(key)) {
                        this.terms.push(new Term(token.text));
                        this.index.set(key, this.terms.length - 1);
                    }
                    const idx: number = this.index.get(key)!;
                    const term: Term = this.terms[idx];
                    term.increaseFrequency();
                    term.setSentence(i);
                    if (token.tag === Token.ACRONYM) {
                        term.increaseAcronym();
                    }
                    if (token.tag === Token.UPPERCASE) {
                        term.increaseUpperCase();
                    }
                    for (let m: number = 1; m <= TermExtractor.WINDOW; m++) {
                        if (k - m >= 0 && tokens[k - m].isRelatable()) {
                            term.addLeft(tokens[k - m].lower);
                        }
                        if (k + m < tokens.length && tokens[k + m].isRelatable()) {
                            term.addRight(tokens[k + m].lower);
                        }
                    }
                }
            }
        }
    }

    private featureComputation(): void {
        const frequencies: Array<number> = [];
        let maxFrequency: number = 0;
        let sumFrequency: number = 0;
        for (const term of this.terms) {
            const frequency: number = term.getTermFrequency();
            frequencies.push(frequency);
            sumFrequency += frequency;
            if (frequency > maxFrequency) {
                maxFrequency = frequency;
            }
        }
        const meanFrequency: number = this.terms.length > 0 ? sumFrequency / this.terms.length : 0;
        const sDeviation: number = TermExtractor.standardDeviation(frequencies);
        for (const term of this.terms) {
            term.calcFrequency(meanFrequency, sDeviation);
            term.calcDifferent(this.sentences.length);
            term.calcRelatedness(maxFrequency);
            term.calcTermScore();
        }
    }

    private generateCandidates(maxTermLength: number, minFrequency: number, maxScore: number, relevant: boolean): void {
        for (let i: number = 0; i < this.chunks.length; i++) {
            const chunkArray: Array<string> = this.chunks[i];
            for (let j: number = 0; j < chunkArray.length; j++) {
                const tokens: Array<Token> = this.getTokens(chunkArray[j], j === 0);
                for (let h: number = 0; h < tokens.length; h++) {
                    if (!tokens[h].isRelatable()) {
                        continue;
                    }
                    const candidate: Array<Token> = [];
                    for (let k: number = 0; k < maxTermLength && (h + k) < tokens.length; k++) {
                        candidate.push(tokens[h + k]);
                        const string: string = candidate.map((t: Token) => t.text).join(' ');
                        const first: Token = candidate[0];
                        const last: Token = candidate[candidate.length - 1];
                        if (!first.stopWord && !last.stopWord) {
                            const key: string = string.toLocaleLowerCase(this.srcLang);
                            if (!this.index.has(key)) {
                                this.terms.push(new Term(string));
                                this.index.set(key, this.terms.length - 1);
                            }
                            const idx: number = this.index.get(key)!;
                            const term: Term = this.terms[idx];
                            if (term.text.split(' ').length > 1) {
                                term.increaseFrequency();
                                term.setSentence(i);
                            }
                            term.setScore(this.calcCombinedScore(candidate, term.getTermFrequency()));
                        }
                    }
                }
            }
        }
        if (relevant) {
            this.terms = this.terms.filter((term: Term) => term.getRelevance() >= 1.0);
        }
        this.terms = this.terms.filter((term: Term) => term.getScore() <= maxScore);
        this.terms = this.terms.filter((term: Term) => !this.isStopWord(term.text));
        this.terms = this.terms.filter((term: Term) => term.getTermFrequency() >= minFrequency);
        this.terms = this.terms.filter((term: Term) => !this.isNumeric(term.text));
        this.terms = this.terms.filter((term: Term) => term.text.length >= 2);
    }

    private deduplicateTerms(): void {
        const normalized: Map<string, Term> = new Map<string, Term>();
        for (const term of this.terms) {
            const key: string = term.text.toLocaleLowerCase(this.srcLang);
            const existing: Term | undefined = normalized.get(key);
            if (existing !== undefined) {
                if (term.getScore() < existing.getScore() ||
                    (term.getScore() === existing.getScore() && term.getTermFrequency() > existing.getTermFrequency())) {
                    normalized.set(key, term);
                }
            } else {
                normalized.set(key, term);
            }
        }
        const uniqueTerms: Array<Term> = Array.from(normalized.values());
        const merged: Array<boolean> = new Array<boolean>(uniqueTerms.length).fill(false);
        const deduplicated: Array<Term> = [];
        for (let i: number = 0; i < uniqueTerms.length; i++) {
            if (merged[i]) {
                continue;
            }
            const term1: Term = uniqueTerms[i];
            const text1: string = term1.text.toLocaleLowerCase(this.srcLang);
            let bestTerm: Term = term1;
            for (let j: number = i + 1; j < uniqueTerms.length; j++) {
                if (merged[j]) {
                    continue;
                }
                const term2: Term = uniqueTerms[j];
                const text2: string = term2.text.toLocaleLowerCase(this.srcLang);
                if (this.areSimilar(text1, text2)) {
                    merged[j] = true;
                    if (term2.getScore() < bestTerm.getScore() ||
                        (term2.getScore() === bestTerm.getScore() && term2.getTermFrequency() > bestTerm.getTermFrequency())) {
                        bestTerm = term2;
                    }
                }
            }
            deduplicated.push(bestTerm);
        }
        this.terms = deduplicated;
        this.index.clear();
        for (let i: number = 0; i < this.terms.length; i++) {
            this.index.set(this.terms[i].text.toLocaleLowerCase(this.srcLang), i);
        }
    }

    private areSimilar(text1: string, text2: string): boolean {
        if (text1 === text2) {
            return false;
        }
        if (Math.abs(text1.length - text2.length) > 2) {
            return false;
        }
        const distance: number = LevenshteinDistance.distance(text1, text2);
        const maxLength: number = Math.max(text1.length, text2.length);
        const similarity: number = 1.0 - (distance / maxLength);
        return similarity > 0.90 && distance <= 2;
    }

    private calcCombinedScore(candidateTokens: Array<Token>, termFrequency: number): number {
        let prod: number = 1;
        let sum: number = 0;
        const freq: number = termFrequency === 0 ? 1 : termFrequency;
        for (let i: number = 0; i < candidateTokens.length; i++) {
            const token: Token = candidateTokens[i];
            const idx: number | undefined = this.index.get(token.lower);
            if (idx === undefined) {
                continue;
            }
            const term: Term = this.terms[idx];
            if (!token.stopWord) {
                prod *= term.getScore();
                sum += term.getScore();
            } else {
                let probBefore: number = 0;
                let probAfter: number = 0;
                if (i > 0) {
                    const idxBefore: number | undefined = this.index.get(candidateTokens[i - 1].lower);
                    if (idxBefore !== undefined) {
                        probBefore = this.terms[idxBefore].getScore();
                    }
                }
                if (i < candidateTokens.length - 1) {
                    const idxAfter: number | undefined = this.index.get(candidateTokens[i + 1].lower);
                    if (idxAfter !== undefined) {
                        probAfter = this.terms[idxAfter].getScore();
                    }
                }
                const bigramProbability: number = probBefore * probAfter;
                prod *= 1 + (1 - bigramProbability);
                sum += (1 - bigramProbability);
            }
        }
        return prod / (freq * (sum + 1));
    }

    private getChunks(sentence: string): Array<string> {
        const chars: Array<string> = [...sentence];
        const list: Array<string> = [];
        let current: string = '';
        for (let i: number = 0; i < chars.length; i++) {
            const c: string = chars[i];
            if (i > 0 && i < chars.length - 1 && c === '.') {
                if (/\p{Nd}/u.test(chars[i - 1]) && /\p{Nd}/u.test(chars[i + 1])) {
                    current += c;
                    continue;
                }
            }
            if (this.isPunctuation(c)) {
                list.push(current);
                current = '';
            } else {
                current += c;
            }
        }
        if (current.length > 0) {
            list.push(current);
        }
        return list;
    }

    private isPunctuation(c: string): boolean {
        return /[\p{Pc}\p{Pd}\p{Pe}\p{Pf}\p{Pi}\p{Po}\p{Ps}]/u.test(c);
    }

    private getTokens(chunk: string, firstChunk: boolean): Array<Token> {
        const words: Array<string> = [];
        if (chunk.trim().length > 0) {
            for (const { segment, isWordLike } of this.wordSegmenter.segment(chunk)) {
                if (isWordLike) {
                    words.push(segment);
                }
            }
        }
        const tokens: Array<Token> = [];
        for (let i: number = 0; i < words.length; i++) {
            const word: string = words[i];
            tokens.push(new Token(word, this.isStopWord(word), this.srcLang, i === 0 && firstChunk));
        }
        return tokens;
    }

    private isStopWord(token: string): boolean {
        return this.stopWords.includes(token.toLocaleLowerCase(this.srcLang));
    }

    private isNumeric(value: string): boolean {
        return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(value.trim());
    }
}
