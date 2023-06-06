import { execSync } from 'node:child_process'
import { postfixTypes } from './parser'

export const declarations
= `
// CONVERSION_DEBRIS
// =============================================================
/* eslint-disable @typescript-eslint/consistent-type-imports */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/semi */
/* eslint-disable curly */
/* eslint-disable eqeqeq */
/* eslint-disable import/first */
/* eslint-disable no-multi-spaces */
/* eslint-disable no-var */
/* eslint-disable object-shorthand */
/* eslint-disable prefer-arrow-callback */
/* eslint-disable prefer-template */
/* eslint-disable vars-on-top */

${Object.values(postfixTypes).map(s => `declare function ${s}(n: number): number;`).join('\n')}
declare function __(s: string): any;
declare function isNull(o: any): boolean;
declare const recipes: Record<string, any>;
declare const mods: Record<string, any>;
declare const craft: Record<string, any>;
declare const scripts: Record<string, any>;
declare const furnace: Record<string, any>;
declare const utils: Record<string, any>;
declare const itemUtils: Record<string, any>;
declare const oreDict: Record<string, any>;
declare const game: Record<string, any>;
declare const crafttweaker: any;
declare const events: any;
declare type int = number;
declare type byte = number;
declare type float = number;
declare type double = number;
declare type short = number;
declare type long = number;
declare type bool = boolean;
// =============================================================
// CONVERSION_DEBRIS
`

export function lintFile(glob: string) {
  const command = `eslint --fix --quiet "${glob.replace(/\\/g, '/')}"`
  return execSync(command).toString().trim()
}
