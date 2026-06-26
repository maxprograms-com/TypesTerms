/*******************************************************************************
 * Copyright (c) 2024 - 2026 Maxprograms.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License 1.0 which accompanies this distribution,
 * and is available at https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors: Maxprograms - initial API and implementation
 *******************************************************************************/

import type { IToken } from './IToken.js';

export class Token implements IToken {

    static readonly NUMBER: string = 'd';
    static readonly UNPARSABLE: string = 'u';
    static readonly ACRONYM: string = 'a';
    static readonly UPPERCASE: string = 'U';
    static readonly PARSABLE: string = 'p';

    readonly text: string;
    readonly lower: string;
    readonly tag: string;
    readonly stopWord: boolean;

    constructor(token: string, stopWord: boolean, locale: string, beginsSentence: boolean) {
        this.text = token;
        this.lower = token.toLocaleLowerCase(locale);
        this.stopWord = stopWord;
        this.tag = this.getType(beginsSentence);
    }

    isRelatable(): boolean {
        return this.tag === Token.ACRONYM || this.tag === Token.PARSABLE || this.tag === Token.UPPERCASE;
    }

    private getType(beginsSentence: boolean): string {
        if (this.isNumber()) {
            return Token.NUMBER;
        }
        if (this.isAcronym()) {
            return Token.ACRONYM;
        }
        if (this.isUnparsable()) {
            return Token.UNPARSABLE;
        }
        if (!beginsSentence && /^\p{Lu}/u.test(this.text)) {
            return Token.UPPERCASE;
        }
        return Token.PARSABLE;
    }

    private isNumber(): boolean {
        return /^\p{Nd}+$/u.test(this.text);
    }

    private isAcronym(): boolean {
        return this.text.length >= 2 && /^\p{Lu}+$/u.test(this.text);
    }

    private isUnparsable(): boolean {
        let digits: number = 0;
        let letters: number = 0;
        for (const char of this.text) {
            const isDigit: boolean = /\p{Nd}/u.test(char);
            const isLetter: boolean = /\p{L}/u.test(char);
            if (!isDigit && !isLetter) {
                return true;
            }
            if (isDigit) {
                digits++;
            }
            if (isLetter) {
                letters++;
            }
            if (digits > 0 && letters > 0) {
                return true;
            }
        }
        return false;
    }
}
