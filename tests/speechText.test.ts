import { describe, expect, it } from 'vitest';
import { normalizeForSpeech } from '../src/core/audio/speechText';

const n = (s: string) => normalizeForSpeech(s);

describe('text normalisation for the natural voices', () => {
  it('reads money the way a narrator does', () => {
    expect(n('It cost $5.')).toBe('It cost 5 dollars.');
    expect(n('only $1 today')).toBe('only 1 dollar today');
    expect(n('a $2.50 coffee')).toBe('a 2 dollars and 50 cents coffee');
    expect(n('£20 and €3.01')).toBe('20 pounds and 3 euros and 1 cent');
    expect(n('$3 million')).toBe('3 million dollars');
    expect(n('$1,200')).toBe('1,200 dollars');
  });

  it('reads decades', () => {
    expect(n('in the 1990s')).toBe('in the nineteen nineties');
    expect(n('the 1900s and 2000s')).toBe('the nineteen hundreds and two thousands');
    expect(n("back in the '80s")).toBe('back in the eighties');
  });

  it('reads Roman numerals in headings and names', () => {
    expect(n('Chapter IV')).toBe('Chapter 4');
    expect(n('Part XII: The End')).toBe('Part 12: The End');
    expect(n('King Henry VIII married six times.')).toBe('King Henry the Eighth married six times.');
    expect(n('Louis XIV ruled')).toBe('Louis the Fourteenth ruled');
    expect(n('Elizabeth II')).toBe('Elizabeth the Second');
  });

  it('leaves ordinary words and capitals alone', () => {
    for (const s of ['Then I went home.', 'I did it.', 'He said MIX it.', 'DID YOU KNOW', 'In 1990 we left.', 'Dr. Smith, 3rd floor, 50% off, 1,000,000 people.'])
      expect(n(s)).toBe(s);
  });

  it('expands common abbreviations and units', () => {
    expect(n('fruit, e.g. apples')).toBe('fruit, for example, apples');
    expect(n('one thing, i.e. this')).toBe('one thing, that is, this');
    expect(n('Ali vs. Frazier')).toBe('Ali versus Frazier');
    expect(n('No. 5 and p. 12, pp. 3–4')).toBe('number 5 and page 12, pages 3–4');
    expect(n('10 km at 60 mph, 5 kg')).toBe('10 kilometers at 60 miles per hour, 5 kilograms');
    expect(n('It was 30°C')).toBe('It was 30 degrees Celsius');
  });

  it('changes nothing for other languages', () => {
    expect(normalizeForSpeech('Il a payé $5 en 1990s', 'fr')).toBe('Il a payé $5 en 1990s');
  });
});
