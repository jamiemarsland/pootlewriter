import React from 'react';
import { X, AlertTriangle, Info } from 'lucide-react';
import { WritingMetrics } from '../utils/writingInsights';

interface InsightsPanelProps {
  metrics: WritingMetrics;
  onClose: () => void;
}

const SCORE_CONFIG = {
  'Clean':              { strokeColor: '#10b981', text: 'text-emerald-600 dark:text-emerald-400', sub: 'Well structured, clear writing.' },
  'Good':               { strokeColor: '#3b82f6', text: 'text-blue-600 dark:text-blue-400',       sub: 'A few things to tighten up.' },
  'Needs Improvement':  { strokeColor: '#f59e0b', text: 'text-amber-600 dark:text-amber-400',     sub: 'Several issues worth addressing.' },
  'Hard to Read':       { strokeColor: '#ef4444', text: 'text-red-600 dark:text-red-400',         sub: 'Complex sentences and structure.' },
};

const HIGHLIGHT_LEGEND = [
  { type: 'very-long',          color: 'bg-red-400/80',    label: 'Very long sentence (35+ words)' },
  { type: 'long',               color: 'bg-orange-400/80', label: 'Long sentence (25–35 words)' },
  { type: 'passive',            color: 'bg-blue-400/80',   label: 'Passive voice' },
  { type: 'weak',               color: 'bg-purple-400/80', label: 'Weak / filler word' },
  { type: 'transition-overused',color: 'bg-amber-400/80',  label: 'Overused transition' },
  { type: 'caps',               color: 'bg-yellow-400/80', label: 'ALL CAPS word' },
  { type: 'excess-punct',       color: 'bg-red-400/80',    label: 'Excessive punctuation' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2.5">{title}</p>
      {children}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 tabular-nums">{value}</span>
    </div>
  );
}

function BarRow({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-[11px] text-gray-500 dark:text-gray-400 w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 tabular-nums w-4 text-right">{count}</span>
    </div>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1.5 px-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-700/30 mb-1.5">
      <AlertTriangle size={11} className="text-amber-500 mt-0.5 shrink-0" />
      <span className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">{children}</span>
    </div>
  );
}

export default function InsightsPanel({ metrics, onClose }: InsightsPanelProps) {
  const scoreConf = SCORE_CONFIG[metrics.scoreLabel];
  const totalSentences = metrics.sentenceCount || 1;
  const { sentenceDistribution: dist } = metrics;

  const hasAlerts =
    metrics.denseParagraphs > 0 ||
    metrics.veryDenseParagraphs > 0 ||
    metrics.capsWordCount > 0 ||
    metrics.excessPunctCount > 0 ||
    metrics.ellipsisCount > 2;

  const overusedTransitions = Object.entries(metrics.transitionCounts).filter(([, c]) => c >= 5);

  return (
    <aside className="fixed top-0 right-0 bottom-0 w-[300px] bg-white dark:bg-[#1e1e1e] border-l border-gray-100 dark:border-gray-800 z-[29] flex flex-col shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <span className="text-sm font-semibold text-gray-900 dark:text-white tracking-tight">Writing Insights</span>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-8">

        {/* Score */}
        <Section title="Writing Score">
          <div className="flex items-center gap-3 mb-2">
            <div className="relative w-14 h-14 shrink-0">
              <svg viewBox="0 0 56 56" className="w-full h-full -rotate-90">
                <circle cx="28" cy="28" r="22" fill="none" stroke="currentColor" strokeWidth="5" className="text-gray-100 dark:text-gray-800" />
                <circle
                  cx="28" cy="28" r="22" fill="none"
                  strokeWidth="5"
                  strokeDasharray={`${2 * Math.PI * 22}`}
                  strokeDashoffset={`${2 * Math.PI * 22 * (1 - metrics.score / 100)}`}
                  stroke={scoreConf.strokeColor}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-base font-bold text-gray-900 dark:text-white">{metrics.score}</span>
              </div>
            </div>
            <div>
              <p className={`text-sm font-bold ${scoreConf.text}`}>{metrics.scoreLabel}</p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-snug mt-0.5">{scoreConf.sub}</p>
            </div>
          </div>
        </Section>

        {/* Readability */}
        <Section title="Readability">
          <StatRow label="Words" value={metrics.wordCount.toLocaleString()} />
          <StatRow label="Sentences" value={metrics.sentenceCount} />
          <StatRow label="Paragraphs" value={metrics.paragraphCount} />
          <StatRow label="Avg words / sentence" value={metrics.avgWordsPerSentence} />
          <StatRow label="Longest sentence" value={`${metrics.longestSentenceWords} words`} />
          <StatRow label="Reading level" value={metrics.readingLevel} />
          <StatRow label="Est. read time" value={`${metrics.estimatedReadTime} min`} />
        </Section>

        {/* Sentence variety */}
        <Section title="Sentence Variety">
          <div className="space-y-1 mb-2">
            <BarRow label="Short <10" count={dist.short}    total={totalSentences} color="bg-emerald-400" />
            <BarRow label="Medium 10–20" count={dist.medium}   total={totalSentences} color="bg-blue-400" />
            <BarRow label="Long 20–30" count={dist.long}     total={totalSentences} color="bg-amber-400" />
            <BarRow label="Very long 30+" count={dist.veryLong} total={totalSentences} color="bg-red-400" />
          </div>
          {metrics.lowVariety && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 mt-1">
              <Info size={11} />
              Low sentence variety — try mixing lengths.
            </div>
          )}
        </Section>

        {/* Highlight legend */}
        <Section title="Active Highlights">
          <div className="space-y-1.5">
            {HIGHLIGHT_LEGEND.map(item => {
              let count = 0;
              if (item.type === 'very-long') count = metrics.veryLongSentenceCount;
              else if (item.type === 'long') count = metrics.longSentenceCount;
              else if (item.type === 'passive') count = metrics.passiveCount;
              else if (item.type === 'weak') count = metrics.fillerCount;
              else if (item.type === 'transition-overused') count = overusedTransitions.reduce((s,[,c])=>s+c,0);
              else if (item.type === 'caps') count = metrics.capsWordCount;
              else if (item.type === 'excess-punct') count = metrics.excessPunctCount;
              return (
                <div key={item.type} className={`flex items-center gap-2 ${count === 0 ? 'opacity-30' : ''}`}>
                  <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${item.color}`} />
                  <span className="text-[11px] text-gray-600 dark:text-gray-400 flex-1 leading-tight">{item.label}</span>
                  {count > 0 && (
                    <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 tabular-nums">{count}</span>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {/* Overused words */}
        {metrics.overusedWords.length > 0 && (
          <Section title="Overused Words">
            <div className="flex flex-wrap gap-1.5">
              {metrics.overusedWords.map(({ word, count }) => (
                <span
                  key={word}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800/40"
                >
                  {word}
                  <span className="opacity-60">{count}×</span>
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Transition words */}
        {Object.keys(metrics.transitionCounts).length > 0 && (
          <Section title="Transition Words">
            <div className="space-y-1">
              {Object.entries(metrics.transitionCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([word, count]) => (
                  <div key={word} className="flex items-center justify-between">
                    <span className={`text-[11px] ${count >= 5 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>
                      {word}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 tabular-nums">{count}×</span>
                      {count >= 5 && <AlertTriangle size={10} className="text-amber-500" />}
                    </div>
                  </div>
                ))}
            </div>
          </Section>
        )}

        {/* Alerts */}
        {hasAlerts && (
          <Section title="Alerts">
            {metrics.veryDenseParagraphs > 0 && (
              <Alert>
                {metrics.veryDenseParagraphs} very dense paragraph{metrics.veryDenseParagraphs > 1 ? 's' : ''} (180+ words). Split into smaller sections.
              </Alert>
            )}
            {metrics.denseParagraphs > 0 && (
              <Alert>
                {metrics.denseParagraphs} dense paragraph{metrics.denseParagraphs > 1 ? 's' : ''} (120–180 words). Consider splitting.
              </Alert>
            )}
            {metrics.capsWordCount > 0 && (
              <Alert>
                {metrics.capsWordCount} ALL CAPS word{metrics.capsWordCount > 1 ? 's' : ''} detected.
              </Alert>
            )}
            {metrics.excessPunctCount > 0 && (
              <Alert>
                {metrics.excessPunctCount} instance{metrics.excessPunctCount > 1 ? 's' : ''} of excessive punctuation (!! or ??).
              </Alert>
            )}
            {metrics.ellipsisCount > 2 && (
              <Alert>
                Ellipsis (…) used {metrics.ellipsisCount} times. Use sparingly.
              </Alert>
            )}
          </Section>
        )}
      </div>
    </aside>
  );
}
