export type HighlightType =
  | 'long'
  | 'very-long'
  | 'passive'
  | 'weak'
  | 'transition-overused'
  | 'caps'
  | 'excess-punct';

export interface HighlightRange {
  from: number; // char offset in paragraph text, inclusive
  to: number;   // char offset in paragraph text, exclusive
  type: HighlightType;
  tooltip: string;
}

export interface SentenceDistribution {
  short: number;    // < 10 words
  medium: number;   // 10–20 words
  long: number;     // 20–30 words
  veryLong: number; // 30+ words
}

export interface OverusedWord {
  word: string;
  count: number;
}

export type ScoreLabel = 'Clean' | 'Good' | 'Needs Improvement' | 'Hard to Read';

export interface WritingMetrics {
  wordCount: number;
  sentenceCount: number;
  paragraphCount: number;
  avgWordsPerSentence: number;
  longestSentenceWords: number;
  readingLevel: string;
  estimatedReadTime: number; // minutes
  score: number;
  scoreLabel: ScoreLabel;
  overusedWords: OverusedWord[];
  sentenceDistribution: SentenceDistribution;
  lowVariety: boolean;
  denseParagraphs: number;
  veryDenseParagraphs: number;
  transitionCounts: Record<string, number>;
  fillerCount: number;
  passiveCount: number;
  longSentenceCount: number;
  veryLongSentenceCount: number;
  capsWordCount: number;
  excessPunctCount: number;
  ellipsisCount: number;
  paragraphHighlights: HighlightRange[][];
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by',
  'as','is','was','are','were','be','been','being','have','has','had','do',
  'does','did','will','would','could','should','may','might','shall','can',
  'it','its','this','that','these','those','he','she','they','we','you','i',
  'my','your','our','their','his','her','who','which','what','when','where',
  'how','if','then','so','not','no','from','up','out','about','into',
  'there','here','also','just','than','too','very','all','any','both',
]);

const WEAK_WORDS = [
  'very','really','just','quite','basically','actually','literally',
  'somewhat','probably','perhaps',
];

const TRANSITION_WORDS = [
  'however','therefore','moreover','furthermore','consequently','meanwhile',
  'nevertheless','nonetheless','thus','hence','additionally','subsequently',
];

// Passive voice: "was/were/is/are/been/being + (being +)? past participle"
const PASSIVE_RE = /\b(am|is|are|was|were|be|been|being)\s+(?:being\s+)?[a-z]+(?:ed|en)\b/i;

// ─── Text helpers ──────────────────────────────────────────────────────────────

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function getWords(text: string): string[] {
  return text.toLowerCase().match(/\b[a-z']{2,}\b/g) ?? [];
}

interface SentenceSpan {
  text: string;
  from: number;
  to: number;
}

function findSentences(text: string): SentenceSpan[] {
  const result: SentenceSpan[] = [];
  // Split on . ! ? followed by whitespace+uppercase or end of string
  // Handles "..." by consuming multiple punctuation chars
  const re = /([^.!?]*[.!?]+)(?:\s+(?=[A-Z])|(?=\s*$))/g;
  let match: RegExpExecArray | null;
  let lastEnd = 0;

  while ((match = re.exec(text)) !== null) {
    const raw = match[0];
    const from = match.index;
    const to = from + match[1].length;
    const sentText = match[1].trim();
    if (sentText.length > 0) {
      result.push({ text: sentText, from, to });
    }
    lastEnd = from + raw.length;
  }

  // Capture any trailing text not ending in punctuation
  const tail = text.slice(lastEnd).trim();
  if (tail.length > 0) {
    result.push({ text: tail, from: lastEnd, to: text.length });
  }

  // Fallback: treat entire text as one sentence
  if (!result.length && text.trim().length > 0) {
    result.push({ text: text.trim(), from: 0, to: text.length });
  }

  return result;
}

function findWordOccurrences(
  text: string,
  word: string,
): Array<{ from: number; to: number }> {
  const results: Array<{ from: number; to: number }> = [];
  const re = new RegExp(`\\b${word}\\b`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    results.push({ from: m.index, to: m.index + m[0].length });
  }
  return results;
}

// ─── Paragraph highlighter ────────────────────────────────────────────────────

interface ParagraphResult {
  highlights: HighlightRange[];
  sentences: SentenceSpan[];
  wordCount: number;
  passiveCount: number;
  fillerOccurrences: number;
}

function analyzeParagraph(
  text: string,
  overusedTransitions: Set<string>,
): ParagraphResult {
  const highlights: HighlightRange[] = [];
  const sentences = findSentences(text);

  let passiveCount = 0;

  for (const sent of sentences) {
    const wc = countWords(sent.text);

    if (wc > 35) {
      highlights.push({
        from: sent.from,
        to: sent.to,
        type: 'very-long',
        tooltip: `Very long sentence (${wc} words). Consider splitting.`,
      });
    } else if (wc > 25) {
      highlights.push({
        from: sent.from,
        to: sent.to,
        type: 'long',
        tooltip: `Long sentence (${wc} words). Consider splitting.`,
      });
    }

    if (PASSIVE_RE.test(sent.text)) {
      passiveCount++;
      const match = PASSIVE_RE.exec(sent.text);
      if (match) {
        const absFrom = sent.from + match.index;
        highlights.push({
          from: absFrom,
          to: absFrom + match[0].length,
          type: 'passive',
          tooltip: 'Possible passive voice. Consider using active voice.',
        });
      }
    }
  }

  // Weak/filler word highlights
  let fillerOccurrences = 0;
  for (const word of WEAK_WORDS) {
    const occurrences = findWordOccurrences(text, word);
    for (const occ of occurrences) {
      fillerOccurrences++;
      highlights.push({
        from: occ.from,
        to: occ.to,
        type: 'weak',
        tooltip: `Weak word: "${word}". Consider removing or replacing.`,
      });
    }
  }

  // Transition word overuse highlights
  for (const word of TRANSITION_WORDS) {
    if (overusedTransitions.has(word)) {
      const occurrences = findWordOccurrences(text, word);
      for (const occ of occurrences) {
        highlights.push({
          from: occ.from,
          to: occ.to,
          type: 'transition-overused',
          tooltip: `Overused transition: "${word}". Vary your connectives.`,
        });
      }
    }
  }

  // ALL CAPS words (not at sentence start, not acronyms < 3 chars)
  const capsRe = /\b[A-Z]{3,}\b/g;
  let capsMatch: RegExpExecArray | null;
  while ((capsMatch = capsRe.exec(text)) !== null) {
    highlights.push({
      from: capsMatch.index,
      to: capsMatch.index + capsMatch[0].length,
      type: 'caps',
      tooltip: 'ALL CAPS detected. Use sparingly for emphasis.',
    });
  }

  // Excessive punctuation: !! ?? !? (2+ of same)
  const excessRe = /[!?]{2,}|\.{4,}/g;
  let exMatch: RegExpExecArray | null;
  while ((exMatch = excessRe.exec(text)) !== null) {
    highlights.push({
      from: exMatch.index,
      to: exMatch.index + exMatch[0].length,
      type: 'excess-punct',
      tooltip: 'Excessive punctuation. Use sparingly.',
    });
  }

  return {
    highlights,
    sentences,
    wordCount: countWords(text),
    passiveCount,
    fillerOccurrences,
  };
}

// ─── Document analyser ────────────────────────────────────────────────────────

export function analyzeDocument(paragraphTexts: string[]): WritingMetrics {
  const nonEmpty = paragraphTexts.filter(p => p.trim().length > 0);
  if (nonEmpty.length === 0) {
    return emptyMetrics();
  }

  // Word frequency (for overused words)
  const allWords = nonEmpty.flatMap(p => getWords(p));
  const freq = new Map<string, number>();
  for (const w of allWords) {
    if (!STOP_WORDS.has(w) && w.length > 3) {
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }
  const totalWords = allWords.length;

  // Overused: > 6 times in the document (skip very short docs)
  const overusedThreshold = Math.max(6, Math.floor(totalWords * 0.015));
  const overusedWords: OverusedWord[] = [...freq.entries()]
    .filter(([, c]) => c >= overusedThreshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word, count]) => ({ word, count }));

  // Transition word counts
  const transitionCounts: Record<string, number> = {};
  for (const word of TRANSITION_WORDS) {
    const re = new RegExp(`\\b${word}\\b`, 'gi');
    let count = 0;
    for (const p of nonEmpty) {
      const matches = p.match(re);
      if (matches) count += matches.length;
    }
    if (count > 0) transitionCounts[word] = count;
  }
  const overusedTransitions = new Set(
    Object.entries(transitionCounts)
      .filter(([, c]) => c >= 5)
      .map(([w]) => w),
  );

  // Per-paragraph analysis
  const paraResults: ParagraphResult[] = nonEmpty.map(p =>
    analyzeParagraph(p, overusedTransitions),
  );

  // Aggregate sentence data
  const allSentences = paraResults.flatMap(r => r.sentences);
  const sentenceCounts = allSentences.map(s => countWords(s.text));
  const sentenceCount = sentenceCounts.length;
  const wordCount = nonEmpty.reduce((s, p) => s + countWords(p), 0);
  const avgWordsPerSentence = sentenceCount > 0 ? wordCount / sentenceCount : 0;
  const longestSentenceWords = sentenceCounts.length > 0 ? Math.max(...sentenceCounts) : 0;

  const dist: SentenceDistribution = { short: 0, medium: 0, long: 0, veryLong: 0 };
  let longSentenceCount = 0;
  let veryLongSentenceCount = 0;
  for (const wc of sentenceCounts) {
    if (wc < 10) dist.short++;
    else if (wc <= 20) dist.medium++;
    else if (wc <= 30) dist.long++;
    else dist.veryLong++;
    if (wc > 35) veryLongSentenceCount++;
    else if (wc > 25) longSentenceCount++;
  }

  // Sentence variety: check if > 70% of sentences are in one bucket
  const maxBucket = Math.max(dist.short, dist.medium, dist.long, dist.veryLong);
  const lowVariety = sentenceCount >= 4 && maxBucket / sentenceCount > 0.7;

  // Dense paragraphs
  let denseParagraphs = 0;
  let veryDenseParagraphs = 0;
  for (const r of paraResults) {
    if (r.wordCount > 180) veryDenseParagraphs++;
    else if (r.wordCount > 120) denseParagraphs++;
  }

  // Distractions
  const capsWordCount = paraResults.reduce((s, r) =>
    s + (r.highlights.filter(h => h.type === 'caps').length), 0);
  const excessPunctCount = paraResults.reduce((s, r) =>
    s + (r.highlights.filter(h => h.type === 'excess-punct').length), 0);
  const ellipsisCount = nonEmpty.reduce((s, p) => {
    const m = p.match(/\.{3}/g);
    return s + (m?.length ?? 0);
  }, 0);

  const passiveCount = paraResults.reduce((s, r) => s + r.passiveCount, 0);
  const fillerCount = paraResults.reduce((s, r) => s + r.fillerOccurrences, 0);

  // Reading level heuristic (average words per sentence)
  let readingLevel = 'College (Advanced)';
  if (avgWordsPerSentence < 8) readingLevel = 'Grade 5 (Easy)';
  else if (avgWordsPerSentence < 14) readingLevel = 'Grade 8 (Standard)';
  else if (avgWordsPerSentence < 18) readingLevel = 'Grade 10 (Moderate)';
  else if (avgWordsPerSentence < 23) readingLevel = 'Grade 12 (Challenging)';

  const estimatedReadTime = Math.max(1, Math.round(wordCount / 238));

  // Score
  let penalty = 0;
  penalty += Math.min(veryLongSentenceCount * 4, 20);
  penalty += Math.min(longSentenceCount * 2, 10);
  if (sentenceCount > 0) penalty += Math.min((passiveCount / sentenceCount) * 30, 20);
  penalty += Math.min(fillerCount * 1.5, 15);
  penalty += Math.min(denseParagraphs * 4 + veryDenseParagraphs * 8, 15);
  penalty += Math.min(overusedWords.length * 3, 12);
  const score = Math.max(0, Math.round(100 - penalty));

  let scoreLabel: ScoreLabel = 'Hard to Read';
  if (score >= 80) scoreLabel = 'Clean';
  else if (score >= 60) scoreLabel = 'Good';
  else if (score >= 40) scoreLabel = 'Needs Improvement';

  // Dense paragraph highlights (add to first paragraph's highlight list as an aside — not inline text)
  // These are surfaced in the panel, not as inline decorations.

  return {
    wordCount,
    sentenceCount,
    paragraphCount: nonEmpty.length,
    avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
    longestSentenceWords,
    readingLevel,
    estimatedReadTime,
    score,
    scoreLabel,
    overusedWords,
    sentenceDistribution: dist,
    lowVariety,
    denseParagraphs,
    veryDenseParagraphs,
    transitionCounts,
    fillerCount,
    passiveCount,
    longSentenceCount,
    veryLongSentenceCount,
    capsWordCount,
    excessPunctCount,
    ellipsisCount,
    paragraphHighlights: paraResults.map(r => r.highlights),
  };
}

function emptyMetrics(): WritingMetrics {
  return {
    wordCount: 0,
    sentenceCount: 0,
    paragraphCount: 0,
    avgWordsPerSentence: 0,
    longestSentenceWords: 0,
    readingLevel: '—',
    estimatedReadTime: 0,
    score: 100,
    scoreLabel: 'Clean',
    overusedWords: [],
    sentenceDistribution: { short: 0, medium: 0, long: 0, veryLong: 0 },
    lowVariety: false,
    denseParagraphs: 0,
    veryDenseParagraphs: 0,
    transitionCounts: {},
    fillerCount: 0,
    passiveCount: 0,
    longSentenceCount: 0,
    veryLongSentenceCount: 0,
    capsWordCount: 0,
    excessPunctCount: 0,
    ellipsisCount: 0,
    paragraphHighlights: [],
  };
}
