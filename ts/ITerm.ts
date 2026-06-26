/*******************************************************************************
 * Copyright (c) 2024 - 2026 Maxprograms.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License 1.0 which accompanies this distribution,
 * and is available at https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors: Maxprograms - initial API and implementation
 *******************************************************************************/

export interface ITerm {

    readonly text: string;

    increaseFrequency(): void;
    increaseAcronym(): void;
    increaseUpperCase(): void;

    getTermFrequency(): number;
    getAcronymFrequency(): number;
    getUpperCaseFrequency(): number;

    setSentence(index: number): void;
    getOffsetSentences(): Array<number>;

    addLeft(word: string): void;
    addRight(word: string): void;

    calcFrequency(meanFrequency: number, standardDeviation: number): void;
    calcDifferent(totalSentences: number): void;
    calcRelatedness(maxFrequency: number): void;
    calcTermScore(): void;

    getPosition(): number;
    getRelevance(): number;
    getScore(): number;
    setScore(score: number): void;

    getData(): string;
}
