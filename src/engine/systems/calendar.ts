// Calendar — derives the in-game date from playtime. Time always advances (days tick at
// CALENDAR.daySeconds), but `unlocked` is false until the Calendar tech is researched, so
// the UI hides the day/season until then. Pure read model, no mutation, no DOM.

import { CALENDAR } from '../../content/config';
import type { GameState } from '../state';

export interface CalendarInfo {
  unlocked: boolean; // the Calendar tech is researched → the date may be shown
  totalDays: number; // whole days elapsed since the start
  day: number; // 1..daysPerSeason — day within the current season
  seasonIndex: number; // 0..3
  season: string; // 'Spring' | 'Summer' | 'Autumn' | 'Winter'
  year: number; // 1-based
}

/** Derive the current date from playtime + the Calendar-tech unlock flag. */
export function calendar(state: GameState): CalendarInfo {
  const { daySeconds, daysPerSeason, seasons } = CALENDAR;
  const yearLen = daysPerSeason * seasons.length;
  const totalDays = Math.floor(state.playtime / daySeconds);
  const seasonIndex = Math.floor(totalDays / daysPerSeason) % seasons.length;
  return {
    unlocked: (state.run.tech as string[]).includes('calendar'),
    totalDays,
    day: (totalDays % daysPerSeason) + 1,
    seasonIndex,
    season: seasons[seasonIndex],
    year: Math.floor(totalDays / yearLen) + 1,
  };
}
