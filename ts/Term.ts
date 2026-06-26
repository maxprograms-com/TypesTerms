/*******************************************************************************
 * Copyright (c) 2024 - 2026 Maxprograms.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License 1.0 which accompanies this distribution,
 * and is available at https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors: Maxprograms - initial API and implementation
 *******************************************************************************/

import type { ITerm } from './ITerm.js';
import { TermUtils } from './TermUtils.js';

export class Term implements ITerm {

    readonly text: string;
    private offsetSentences: Array<number>;
    private termFrequency: number;
    private acronymFrequency: number;
    private upperCaseFrequency: number;
    private normalizedFrequency: number;
    private leftWords: Map<string, number>;
    private rightWords: Map<string, number>;
    private different: number;
    private relatedness: number;
    private score: number;
    private casing: number;
    private position: number;

    constructor(text: string) {
        this.text = text;
        this.offsetSentences = [];
        this.termFrequency = 0;
        this.acronymFrequency = 0;
        this.upperCaseFrequency = 0;
        this.normalizedFrequency = 0;
        this.leftWords = new Map<string, number>();
        this.rightWords = new Map<string, number>();
        this.different = 0;
        this.relatedness = 0;
        this.score = 0;
        this.casing = 0;
        this.position = 0;
    }

    increaseFrequency(): void {
        this.termFrequency++;
    }

    increaseAcronym(): void {
        this.acronymFrequency++;
    }

    increaseUpperCase(): void {
        this.upperCaseFrequency++;
    }

    getTermFrequency(): number {
        return this.termFrequency;
    }

    getAcronymFrequency(): number {
        return this.acronymFrequency;
    }

    getUpperCaseFrequency(): number {
        return this.upperCaseFrequency;
    }

    setSentence(index: number): void {
        this.offsetSentences.push(index);
    }

    getOffsetSentences(): Array<number> {
        return this.offsetSentences;
    }

    addLeft(word: string): void {
        const count: number = this.leftWords.get(word) ?? 0;
        this.leftWords.set(word, count + 1);
    }

    addRight(word: string): void {
        const count: number = this.rightWords.get(word) ?? 0;
        this.rightWords.set(word, count + 1);
    }

    calcFrequency(meanFrequency: number, standardDeviation: number): void {
        this.normalizedFrequency = this.termFrequency / (meanFrequency + 1 * standardDeviation);
    }

    calcDifferent(totalSentences: number): void {
        const size: number = this.offsetSentences.length;
        this.different = size / totalSentences;
    }

    calcRelatedness(maxFrequency: number): void {
        const rightSum: number = this.sum(this.rightWords);
        const wr: number = rightSum !== 0 ? this.rightWords.size / rightSum : 0;
        const leftSum: number = this.sum(this.leftWords);
        const wl: number = leftSum !== 0 ? this.leftWords.size / leftSum : 0;
        this.relatedness = 1 + (wr + wl) * this.normalizedFrequency / maxFrequency;
    }

    calcTermScore(): void {
        this.casing = this.getCasing();
        this.position = this.getPosition();
        if (this.relatedness === 0) {
            this.score = 0;
        } else {
            const denominator: number = this.casing + (this.normalizedFrequency / this.relatedness) + (this.different / this.relatedness);
            if (denominator === 0) {
                this.score = 0;
            } else {
                this.score = (this.relatedness * this.position) / denominator;
            }
        }
    }

    getPosition(): number {
        const median: number = TermUtils.median(this.offsetSentences);
        return Math.log(Math.log(3 + median));
    }

    getRelevance(): number {
        return 1 / (1 + this.normalizedFrequency);
    }

    getScore(): number {
        return this.score;
    }

    setScore(score: number): void {
        this.score = score;
    }

    getData(): string {
        return this.text + ',' + this.score + ',' + this.casing + ',' + this.position + ',' + this.termFrequency + ',' + this.getRelevance() + ',' + this.relatedness + ',' + this.different;
    }

    compareTo(other: Term): number {
        if (this.score < other.getScore()) {
            return -1;
        }
        if (this.score > other.getScore()) {
            return 1;
        }
        if (this.termFrequency > other.getTermFrequency()) {
            return -1;
        }
        if (this.termFrequency < other.getTermFrequency()) {
            return 1;
        }
        if (this.text.length > other.text.length) {
            return -1;
        }
        if (this.text.length < other.text.length) {
            return 1;
        }
        return 0;
    }

    private getCasing(): number {
        return Math.max(this.upperCaseFrequency, this.acronymFrequency) / (1 + Math.log(this.termFrequency));
    }

    private sum(map: Map<string, number>): number {
        let result: number = 0;
        for (const value of map.values()) {
            result += value;
        }
        return result;
    }

}
