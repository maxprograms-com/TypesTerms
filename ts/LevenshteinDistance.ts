/*******************************************************************************
 * Copyright (c) 2024 - 2026 Maxprograms.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License 1.0 which accompanies this distribution,
 * and is available at https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors: Maxprograms - initial API and implementation
 *******************************************************************************/

export class LevenshteinDistance {

    private constructor() {
        // do not instantiate
    }

    static distance(x: string, y: string): number {
        const matrix: Array<Array<number>> = [];
        for (let i: number = 0; i <= x.length; i++) {
            matrix[i] = [];
            for (let j: number = 0; j <= y.length; j++) {
                if (i === 0) {
                    matrix[i][j] = j;
                } else if (j === 0) {
                    matrix[i][j] = i;
                } else {
                    const substitution: number = matrix[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1);
                    matrix[i][j] = Math.min(substitution, matrix[i - 1][j] + 1, matrix[i][j - 1] + 1);
                }
            }
        }
        return matrix[x.length][y.length];
    }
}