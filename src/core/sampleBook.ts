import type { ImportedBook } from './types';

/** A short built-in book so new users (and App Review) can try narration instantly. */
export const SAMPLE_BOOK: ImportedBook = {
  title: 'Welcome to My Library',
  author: 'A short guide',
  format: 'txt',
  cover: null,
  chapters: [
    {
      title: 'Welcome',
      text: [
        'Welcome',
        'Welcome to My Library, your private audiobook shelf. Any book you bring here can be read aloud to you, from the first page to the last.',
        'You are listening to this guide right now. Tap the pause button at any time, and tap play again to continue exactly where you stopped. Your place is saved automatically, so you can close the app and come back tomorrow.',
        'To add your own book, go back to your library and tap Add. You can choose a PDF, an EPUB, a Word document or a plain text file from Files, iCloud Drive or Downloads.',
      ].join('\n\n'),
    },
    {
      title: 'Listening',
      text: [
        'Listening',
        'The large button plays and pauses. The double arrows move back or forward one sentence, and the outer buttons jump between chapters. Drag the slider to move through the chapter.',
        'Tap Voice to change the narration speed and choose a different voice. For the most natural sound, download a free Enhanced or Premium voice in the iPhone Settings app, under Accessibility, Spoken Content, Voices.',
        'Tap any sentence on the page to start reading from there. The sentence being read is highlighted, so you can follow along with your eyes.',
        'Going to sleep? Tap Sleep to stop after a few minutes, or at the end of the chapter.',
      ].join('\n\n'),
    },
    {
      title: 'Notes and highlights',
      text: [
        'Notes and highlights',
        'Tap a sentence and choose Highlight to mark it, Note to write down a thought, or Bookmark to save the spot. You can also select any words with your finger to highlight exactly what you want.',
        'Everything you mark appears under Notes, where you can jump straight back to it, edit it, or export all your notes for a book.',
      ].join('\n\n'),
    },
    {
      title: 'Your library and your privacy',
      text: [
        'Your library and your privacy',
        'Books are organised on your shelf with covers and categories. Tap the three dots on a cover to change its title, author, category or cover picture.',
        'Everything stays on this device. There is no account, no tracking and nothing is uploaded. To move your library to another device, or to keep it safe, use Export backup in Settings.',
        'That is the end of this guide. Enjoy your books.',
      ].join('\n\n'),
    },
  ],
};
