import type { Style } from '../draw';
import { challenge } from './challenge';
import { cinematic } from './cinematic';
import { classic } from './classic';
import { mushaf } from './mushaf';
import { question } from './question';
import { split } from './split';
import { waveform } from './waveform';
import { wordFocus } from './wordFocus';
import type { Template } from './types';

export type { FrameInfo, Template } from './types';

export const INTRO = 2.5; // seconds
export const OUTRO = 3;

export const TEMPLATES: Template[] = [classic, challenge, wordFocus, cinematic, waveform, mushaf, split, question];

export const getTemplate = (id: string) => TEMPLATES.find((t) => t.id === id) ?? classic;

/** Intro/outro card lengths for the current style. */
export function cardsFor(style: Style): { intro: number; outro: number } {
  return (
    getTemplate(style.template).cards?.(style) ?? {
      intro: style.intro ? INTRO : 0,
      outro: style.outro ? OUTRO : 0,
    }
  );
}
