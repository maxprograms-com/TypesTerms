/*******************************************************************************
 * Copyright (c) 2024 - 2026 Maxprograms.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License 1.0 which accompanies this distribution,
 * and is available at https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors: Maxprograms - initial API and implementation
 *******************************************************************************/

import type { XliffSource, XliffTarget } from 'typesxliff';
import { XliffMrk, XliffPc } from 'typesxliff';

type XliffWithContent = XliffSource | XliffTarget | XliffPc | XliffMrk;

export class TermUtils {

    private constructor() {
        // do not instantiate
    }

    static median(list: Array<number>): number {
        const sorted: Array<number> = [...list].sort((a: number, b: number) => a - b);
        const length: number = sorted.length;
        if (length % 2 === 0) {
            return (sorted[length / 2 - 1] + sorted[length / 2]) / 2;
        }
        return sorted[Math.floor(length / 2)];
    }

    static pureText(element: XliffWithContent): string {
        let result: string = '';
        for (const item of element.content) {
            if (typeof item === 'string') {
                result += item;
            } else if (item instanceof XliffPc || item instanceof XliffMrk) {
                result += TermUtils.pureText(item);
            }
        }
        return result;
    }
}
