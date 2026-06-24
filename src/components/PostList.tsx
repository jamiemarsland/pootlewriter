import React, { useState } from 'react';
import { Post } from '../types';
import { Pencil as Edit2, Trash2, SquarePen as PenSquare, Globe, FileText, Tag, Download, RefreshCw, AlertCircle } from 'lucide-react';
import { useConfirm } from './ConfirmDialog';

function downloadMarkdown(post: Post) {
  const slug = (post.title || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const blob = new Blob([post.content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function isOutOfSync(post: Post): boolean {
  return !!(post.wordpressId && post.wpModified && post.lastModified > post.wpModified);
}

interface PostListProps {
  posts: Post[];
  onSelect: (post: Post) => void;
  onDelete: (id: string) => void;
  onRefreshFromWordPress?: (post: Post) => Promise<void>;
}

export default function PostList({ posts, onSelect, onDelete, onRefreshFromWordPress }: PostListProps) {
  const { confirm } = useConfirm();
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, 'success' | 'error'>>({});
  const sorted = [...posts].sort((a, b) => b.lastModified - a.lastModified);

  const handleRefresh = async (post: Post) => {
    if (!onRefreshFromWordPress) return;
    setRefreshingId(post.id);
    try {
      await onRefreshFromWordPress(post);
      setRowState(s => ({ ...s, [post.id]: 'success' }));
    } catch {
      setRowState(s => ({ ...s, [post.id]: 'error' }));
    } finally {
      setRefreshingId(null);
      setTimeout(() => setRowState(s => { const next = { ...s }; delete next[post.id]; return next; }), 2000);
    }
  };

  const handleNew = () =>
    onSelect({
      id: crypto.randomUUID(),
      title: '',
      content: '',
      lastModified: Date.now(),
      categories: []
    });

  return (
    <div className="min-h-screen bg-white dark:bg-[#1a1a1a]">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-30 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center px-4 h-14">
          <div className="flex-1">
            <h1 className="text-base font-semibold text-gray-900 dark:text-white tracking-tight">
              Posts
            </h1>
          </div>
          <div className="flex-1 flex justify-end">
            <button
              onClick={handleNew}
              className="h-9 px-5 rounded-full bg-[#1d7dd4] hover:bg-[#1567b8] text-white text-sm font-medium transition-colors flex items-center gap-2"
            >
              <PenSquare size={14} />
              New Post
            </button>
          </div>
        </div>
      </header>

      {/* List */}
      <main className="pt-14 pb-16 max-w-2xl mx-auto px-6 sm:px-8">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-32 gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <PenSquare size={20} className="text-gray-400" />
            </div>
            <p className="text-gray-400 dark:text-gray-500 text-sm">No posts yet. Start writing!</p>
            <button
              onClick={handleNew}
              className="mt-2 h-9 px-5 rounded-full border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:border-gray-500 dark:hover:border-gray-400 transition-colors"
            >
              Create your first post
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {sorted.map((post) => (
              <div
                key={post.id}
                className={`group py-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4 rounded-lg transition-colors duration-500 ${
                  rowState[post.id] === 'success'
                    ? 'bg-green-50 dark:bg-green-900/20'
                    : rowState[post.id] === 'error'
                    ? 'bg-red-50 dark:bg-red-900/20'
                    : ''
                }`}
              >
                <button
                  onClick={() => onSelect(post)}
                  className="flex-1 text-left min-w-0"
                >
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-[17px] font-semibold text-gray-900 dark:text-white leading-snug truncate">
                      {post.title || 'Untitled'}
                    </span>
                    {post.wordpressId && (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full ${
                          post.publishedAsDraft
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            : 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        }`}
                      >
                        {post.publishedAsDraft ? (
                          <><FileText size={10} /> Draft</>
                        ) : (
                          <><Globe size={10} /> Published</>
                        )}
                      </span>
                    )}
                    {isOutOfSync(post) && (
                      <span
                        className="group/sync relative inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 cursor-default"
                      >
                        <AlertCircle size={10} />
                        Out of sync
                        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-[11px] leading-snug px-3 py-2 opacity-0 group-hover/sync:opacity-100 transition-opacity duration-150 shadow-lg z-10 text-center">
                          Local edits haven't been republished to WordPress yet.
                        </span>
                      </span>
                    )}
                  </div>

                  {post.categories && post.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5 mb-1">
                      {post.categories.map(cat => (
                        <span
                          key={cat}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                        >
                          <Tag size={9} />
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {new Date(post.lastModified).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </p>
                </button>

                {/* Actions — always visible on mobile, hover-reveal on desktop */}
                <div className="flex items-center gap-1 justify-end sm:opacity-0 sm:group-hover:opacity-100 transition-opacity sm:pt-0.5 shrink-0">
                  <button
                    onClick={() => onSelect(post)}
                    className="w-9 h-9 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                    title="Edit"
                  >
                    <Edit2 size={15} />
                  </button>
                  <button
                    onClick={() => downloadMarkdown(post)}
                    className="w-9 h-9 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                    title="Download Markdown"
                  >
                    <Download size={15} />
                  </button>
                  {post.wordpressId && onRefreshFromWordPress && (
                    <button
                      onClick={() => handleRefresh(post)}
                      disabled={refreshingId === post.id}
                      className="w-9 h-9 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors disabled:opacity-50"
                      title="Refresh from WordPress"
                    >
                      <RefreshCw size={15} className={refreshingId === post.id ? 'animate-spin' : ''} />
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      const ok = await confirm({ title: 'Delete post', message: `Delete "${post.title || 'Untitled'}"? This cannot be undone.`, confirmLabel: 'Delete', destructive: true });
                      if (ok) onDelete(post.id);
                    }}
                    className="w-9 h-9 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
