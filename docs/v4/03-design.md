# MY LIBRARY AI — Technical design (V4)

Builds on the existing modules (`src/core/importers`, `src/core/audio`, `src/core/speech`, `src/core/storage`,
`src/core/search.ts`, `ios/App/App/NativeSpeechPlugin.swift`). Nothing is rewritten wholesale; each change lands behind
tests and an additive database migration.

## 1. Data model (IndexedDB v6, additive)

Existing stores stay. New/extended records:

```ts
// The original file stays in `files` untouched. Extraction output is versioned.
interface SourceRef {                // where a block came from
  kind: 'pdf-page' | 'epub-doc' | 'docx-para' | 'text-line';
  page?: number;                     // 1-based PDF page
  href?: string; anchor?: string;    // EPUB spine file and fragment
  index?: number;                    // DOCX paragraph / text line
}
interface Block {                    // a paragraph-level unit of extracted text
  id: string;                        // stable: hash(source position + normalised text), unique per book
  type: 'heading' | 'para' | 'footnote' | 'table' | 'caption' | 'ocr';
  level?: number;                    // heading level
  text: string;
  source: SourceRef;
  confidence?: number;               // OCR or layout confidence 0..1
}
interface Extraction {               // store: extractions, key bookId+version
  bookId: string; version: number; createdAt: number;
  blocks: Block[];                   // full book in reading order, notes kept but flagged
  sections: Array<{ id: string; title: string; level: number; firstBlock: string; source: SourceRef }>;
  report: ImportReport;
}
type StructureEdit =                 // store: structure (edit list over sections; original never changed)
  | { op: 'rename'; section: string; title: string }
  | { op: 'move'; section: string; before: string | null }
  | { op: 'split'; section: string; atBlock: string; title: string }
  | { op: 'merge'; section: string }          // with the next section
  | { op: 'exclude' | 'include'; section: string };
interface Segment { id: string; blockId: string; start: number; end: number } // sentences, per chapter version
interface Timing {                   // per audio part
  segmentTimes: Array<{ segment: string; t0: number; t1: number }>;
  wordTimes?: Array<{ segment: string; start: number; end: number; t0: number }>;  // only from a real source
  wordSource?: 'web-speech' | 'avspeech' | 'piper-durations';
}
```

`contents.chapters` (today's `{title, text}`) becomes a **derived view**: sections after edits → chapter text built from
included blocks (footnotes/tables per settings). Existing books are migrated by wrapping each current chapter as one
section whose blocks are its paragraphs with `source.kind = 'text-line'` (no page info is invented); their progress
offsets, notes and audio keys stay valid because the derived text is byte-identical.

## 2. Import pipeline

```
file → detect format → hash (SHA-256) → duplicate check
     → extractor (per format) emits Blocks + Sections + raw signals, in steps saved to `importDrafts`
     → cleaners (headers/footers, hyphenation, footnotes, tables, language)
     → report builder → review screen → save (Extraction v1 + derived chapters)
```

- **Resumable drafts**: `importDrafts` store holds `{fileHash, format, step, blocks so far, signals}`; PDFs save every
  20 pages, EPUBs every spine file. On launch, unfinished drafts are offered (resume/discard).
- **EPUB**: spine order; TOC targets resolved to (file, anchor); a file is cut at each anchor element that the TOC
  targets. Footnotes: elements with `epub:type` footnote/endnote/rearnote/aside and links with `epub:type="noteref"`;
  notes files (`linear="no"` or referenced only by noterefs) → `footnote` blocks. Language from `dc:language`.
  Images: `alt` text kept as optional `caption` blocks.
- **PDF** (pdf.js text items with font size and position):
  - Columns: generalise `orderColumns` to k gutters (vertical whitespace bands spanning ≥ 60% of the text height);
    full-width lines above/below column regions kept in place.
  - Footnotes: bottom-of-page lines with font size < 0.85 × body median that start with a marker matching a
    superscript in the body → `footnote` blocks linked to the page.
  - Tables: ≥ 3 consecutive lines whose x-positions align into ≥ 2 stable columns → `table` block (rows joined with
    “ — ”), confidence attached.
  - Chapters from the outline with destination y-position, so a chapter can start mid-page; nested levels kept.
  - Signals for the report: chars per page, image-only pages, pages that are mostly numbers, font-size histogram.
- **DOCX**: headings (styles + outline levels, already supported) → sections; footnotes.xml/endnotes.xml → footnote
  blocks; tables → table blocks.
- **Report** (`ImportReport`): per section words, first/last paragraph ids, flags with reasons:
  `order` (chapter numbers out of sequence; TOC vs detected heading mismatch), `duplicate` (8-word shingles repeated
  across sections above a threshold), `gap` (PDF pages with no text and no image, or a jump in printed page numbers),
  `ocr` (image-only pages), `short` (section < 50 words that is not front matter), and an overall confidence.
- **Never invent text**: cleaners only remove (with the removed text kept in the report for headers/footers) or move
  blocks; OCR output is typed `ocr` and labelled.

## 3. Narration

- **Engines** (unchanged interface `NeuralEngine`): Piper (default, WebAssembly in a worker), Kokoro (desktop until it
  passes WebKit), device voice (Web Speech), and in the native app **Apple speech** (`AVSpeechSynthesizer`).
- **Native renderer** (`AVSpeechSynthesizer.write(_:toBufferCallback:)`, iOS 13+; the variant with a marker callback
  reports word positions on newer iOS versions — exact minimum to confirm in Xcode during Phase 2b): renders each chapter part to an audio file with word timings, using the user's installed Enhanced/Premium
  voices; plays through `AVAudioPlayer` with `MPNowPlayingInfoCenter` and remote commands. Background audio is already
  declared in `Info.plist`.
- **Speech text normaliser** (pure function, unit-tested): numbers, ordinals, dates, currency, Roman numerals in
  headings, common abbreviations, initials, URLs (skipped), applied before phonemisation; dictionary entries win.
- **Audio storage**: WebCodecs `AudioEncoder` (AAC-LC 48 kb/s mono or Opus) into MP4/WebM containers where supported;
  WAV fallback. Each part keeps its `Timing`.
- **Locked playback (web)**: keep the existing design (pre-made parts, silence bridge, generation two chapters ahead);
  measure on device. The native app is the reliable path.

## 4. Read & Listen Together

- Segments are computed once per chapter version (`chunkText` today) and stored with ids; the reader renders
  `data-seg` ids; the player maps audio time → segment via `Timing.segmentTimes` (binary search), and → word only
  when `wordTimes` exists.
- Auto-scroll pauses when the user scrolls; a floating “Back to narration” button resumes it.
- Positions are stored as `{chapterVersion, segmentId, offsetInSegment}` plus the legacy character offset.

## 5. Search and retrieval

- Keep BM25 passages; add library-wide index (incremental, per book, in a worker) and optional on-device embeddings
  (MiniLM-class ONNX model ~25 MB via the same ONNX Runtime) with hybrid ranking.
- Every passage carries `bookId, sectionId, blockIds, source (page/anchor)` for citations.

## 6. AI assistant options

| Option | Privacy | Cost | Quality / limits |
|---|---|---|---|
| A. Extractive only (quotes, outlines, key sentences, dictionary) | on device | free | no generated prose |
| B1. Apple Foundation Models (native app) | on device | free | iOS 26 + Apple Intelligence devices only; ~3B model, short contexts → retrieval required |
| B2. Small model in the browser (WebGPU) | on device | free | 1–2 GB download, memory pressure on iPhone; needs device evaluation |
| C. Claude API (opt-in) | selected passages sent to Anthropic | per use | strongest; needs a key and a way to keep it secret |

Claude API cost examples (Anthropic list prices, Nov 2026): Claude Haiku 5.5 $0.10 / $0.50 per million input/output
tokens; Claude Sonnet 5.5 $2 / $10; Claude Opus 5.5 $4 / $20.
- Chapter summary (≈12k input + 800 output tokens): Haiku 5.5 ≈ $0.0016; Sonnet 5.5 ≈ $0.032.
- Grounded question (≈4k tokens of retrieved passages + 400 output): Haiku 5.5 ≈ $0.0006; Sonnet 5.5 ≈ $0.012.
- A heavy month (30 chapter summaries + 300 questions): Haiku 5.5 ≈ $0.23; Sonnet 5.5 ≈ $4.60.
Prompt caching can lower repeated-context costs further. Not enabled without your approval (D3).

Grounding contract for B and C: the model receives only retrieved passages with ids; the answer must cite ids; the UI
rejects and labels answers whose citations are missing or don't contain the quoted words.

## 7. On-device vs server narration

| | On device (Piper / Apple voices) | Server TTS (optional, not planned) |
|---|---|---|
| Privacy | text never leaves the phone | book text sent to a provider |
| Speed | Piper 4.7× real time in WebKit CI; Apple voices faster | fast, but needs network |
| Battery | CPU while generating (measure in Phase 2b) | radio only |
| Cost | free | per character, recurring |
| Offline | yes | no (unless pre-downloaded audio) |

## 8. iOS native app

Capacitor shell over the same web code; native plugins: speech/renderer (exists, extend), Vision OCR, file import
(Files app / Share Sheet), Now Playing. Built and tested in CI on macOS runners with the iOS Simulator; signed builds
only after D1.
