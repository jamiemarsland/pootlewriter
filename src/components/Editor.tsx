import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent, Extension, Node, mergeAttributes } from '@tiptap/react';
import { NodeSelection, TextSelection, Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Suggestion } from '@tiptap/suggestion';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import {
  LayoutList, HelpCircle, Settings, Tag, Loader2, Sun, Moon,
  Quote, Code, Minus, List, ListOrdered, Undo2,
  Image as ImageIcon, Bold, Italic, Link as LinkIcon, Video, ChevronDown, MoreHorizontal,
  Trash2, Type, Check, BarChart2,
} from 'lucide-react';
import { analyzeDocument, WritingMetrics } from '../utils/writingInsights';
import InsightsPanel from './InsightsPanel';
import confetti from 'canvas-confetti';
import { Post, WordPressConfig } from '../types';
import WordPressConfigModal from './WordPressConfig';
import CategoryManager from './CategoryManager';
import { publishToWordPress, uploadMediaToWordPress } from '../utils/wordpress';
import { extractHashtags } from '../utils/wordpress';
import { processImageForUpload } from '../utils/imageProcessing';
import { Theme } from '../utils/theme';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';

// ─── Writing Insights PM plugin key ──────────────────────────────────────────

const insightsPluginKey = new PluginKey<DecorationSet>('writingInsights');

// ─── Types ────────────────────────────────────────────────────────────────────

type TipEditor = ReturnType<typeof useEditor>;

// ─── Markdown serialiser ──────────────────────────────────────────────────────

type PmNode = { type: string; attrs?: Record<string, unknown>; content?: PmNode[]; marks?: { type: string; attrs?: Record<string, unknown> }[]; text?: string };

function serializeInline(nodes: PmNode[] = []): string {
  return nodes.map(n => {
    if (n.type === 'text') {
      let t = n.text ?? '';
      for (const m of (n.marks ?? [])) {
        if (m.type === 'bold')   t = `**${t}**`;
        else if (m.type === 'italic') t = `*${t}*`;
        else if (m.type === 'code')   t = `\`${t}\``;
        else if (m.type === 'link')   t = `[${t}](${ (m.attrs as {href?:string})?.href ?? '' })`;
      }
      return t;
    }
    if (n.type === 'hardBreak') return '  \n';
    return '';
  }).join('');
}

function serializeNode(node: PmNode): string {
  const inline = () => serializeInline(node.content);
  switch (node.type) {
    case 'heading':      return '#'.repeat((node.attrs?.level as number) ?? 1) + ' ' + inline();
    case 'paragraph':    return inline();
    case 'blockquote':   return (node.content ?? []).map(n => '> ' + serializeNode(n)).join('\n');
    case 'codeBlock':    return '```\n' + serializeInline(node.content) + '\n```';
    case 'bulletList':   return (node.content ?? []).map(n => '- ' + serializeInline(n.content?.[0]?.content)).join('\n');
    case 'orderedList':  return (node.content ?? []).map((n, i) => `${i + 1}. ` + serializeInline(n.content?.[0]?.content)).join('\n');
    case 'horizontalRule': return '---';
    case 'videoEmbed': return `<div class="video-embed"><iframe src="${node.attrs?.src ?? ''}" frameborder="0" allowfullscreen></iframe></div>`;
    case 'image': {
      const a = node.attrs ?? {};
      return `![${a.alt ?? ''}](${a.src ?? ''})`;
    }
    case 'doc': return (node.content ?? []).map(serializeNode).filter(Boolean).join('\n\n');
    default: return inline();
  }
}

function editorToMarkdown(editor: TipEditor): string {
  if (!editor) return '';
  return serializeNode(editor.getJSON() as PmNode);
}

// ─── Markdown → HTML ──────────────────────────────────────────────────────────

function markdownToHtml(md: string): string {
  if (!md.trim()) return '<p></p>';
  const lines = md.split('\n');
  const out: string[] = [];
  let i = 0;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string): string => {
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => `<a href="${href}">${esc(text)}</a>`);
    s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${esc(c)}</code>`);
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return s;
  };
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }
    if (line.startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i++; }
      i++;
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    if (/^[-*_]{3,}$/.test(line.trim())) { out.push('<hr>'); i++; continue; }
    const imgM = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgM) { out.push(`<img src="${imgM[2]}" alt="${esc(imgM[1])}">`); i++; continue; }
    const hM = line.match(/^(#{1,6}) (.+)$/);
    if (hM) { out.push(`<h${hM[1].length}>${inline(hM[2])}</h${hM[1].length}>`); i++; continue; }
    if (line.startsWith('> ')) {
      const q = [line.slice(2)];
      while (i + 1 < lines.length && lines[i+1].startsWith('> ')) { i++; q.push(lines[i].slice(2)); }
      out.push(`<blockquote><p>${inline(q.join('<br>'))}</p></blockquote>`); i++; continue;
    }
    if (/^[-*+] /.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*+] /.test(lines[i])) { items.push(`<li><p>${inline(lines[i].slice(2))}</p></li>`); i++; }
      out.push(`<ul>${items.join('')}</ul>`); continue;
    }
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(`<li><p>${inline(lines[i].replace(/^\d+\. /, ''))}</p></li>`); i++; }
      out.push(`<ol>${items.join('')}</ol>`); continue;
    }
    const para = [line];
    while (i + 1 < lines.length && lines[i+1].trim() !== '' && !/^[#>]|^[-*+] |^\d+\. |^```/.test(lines[i+1]) && !/^[-*_]{3,}$/.test(lines[i+1].trim())) { i++; para.push(lines[i]); }
    out.push(`<p>${inline(para.join(' '))}</p>`);
    i++;
  }
  return out.join('') || '<p></p>';
}

// ─── Video URL normaliser ─────────────────────────────────────────────────────

function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    // YouTube
    const ytId = u.searchParams.get('v') || u.pathname.match(/\/(?:embed\/|shorts\/|v\/)?([A-Za-z0-9_-]{11})/)?.[1];
    if ((u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) && ytId) {
      return `https://www.youtube.com/embed/${ytId}`;
    }
    // Vimeo
    const vmId = u.pathname.match(/\/(\d+)/)?.[1];
    if (u.hostname.includes('vimeo.com') && vmId) {
      return `https://player.vimeo.com/video/${vmId}`;
    }
    // Already an embed or direct video URL
    if (url.includes('/embed/') || /\.(mp4|webm|ogg)$/i.test(u.pathname)) return url;
    return null;
  } catch { return null; }
}

const VideoEmbed = Node.create({
  name: 'videoEmbed',
  group: 'block',
  atom: true,
  addAttributes() {
    return { src: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'div.video-embed', getAttrs: el => ({ src: (el as HTMLElement).querySelector('iframe')?.getAttribute('src') }) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', { class: 'video-embed' }, ['iframe', mergeAttributes({ src: HTMLAttributes.src, frameborder: '0', allowfullscreen: 'true', allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture' })]];
  },
  addCommands() {
    return {
      insertVideoEmbed: (src: string) => ({ commands }: { commands: any }) => commands.insertContent({ type: this.name, attrs: { src } }),
    } as any;
  },
});

function getYtThumbnail(url: string): string | null {
  try {
    const u = new URL(url);
    const id = u.searchParams.get('v') || u.pathname.match(/\/(?:embed\/|shorts\/|v\/)?([A-Za-z0-9_-]{11})/)?.[1];
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
  } catch { return null; }
}

function VideoPreview({ url, embedUrl }: { url: string; embedUrl: string }) {
  const [playing, setPlaying] = useState(false);
  const ytThumb = getYtThumbnail(url);
  const isYt = url.includes('youtube.com') || url.includes('youtu.be');

  if (playing || !isYt || !ytThumb) {
    return (
      <div className="relative w-full mb-5" style={{ paddingBottom: '56.25%' }}>
        <iframe src={embedUrl + '?autoplay=1'} className="absolute inset-0 w-full h-full rounded-xl" frameBorder="0" allowFullScreen allow="autoplay; encrypted-media" />
      </div>
    );
  }

  return (
    <div className="relative w-full mb-5 rounded-xl overflow-hidden cursor-pointer group" style={{ paddingBottom: '56.25%' }} onClick={() => setPlaying(true)}>
      <img src={ytThumb} alt="Video thumbnail" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
        <div className="w-14 h-14 bg-red-600 rounded-full flex items-center justify-center shadow-lg">
          <svg viewBox="0 0 24 24" fill="white" className="w-6 h-6 ml-1"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
    </div>
  );
}

// ─── Slash menu items ─────────────────────────────────────────────────────────

interface SlashItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  action: (editor: TipEditor) => void;
}

function makeSlashItems(onImage: () => void, onVideo: () => void): SlashItem[] {
  return [
    { title: 'Heading',       description: 'Medium section heading',    icon: <span className="font-bold text-base leading-none">H</span>, action: e => e?.chain().focus().toggleHeading({ level: 2 }).run() },
    { title: 'Image',         description: 'Upload or embed an image',  icon: <ImageIcon size={20} />,   action: () => onImage() },
    { title: 'Video',         description: 'Embed a YouTube or Vimeo video', icon: <Video size={20} />, action: () => onVideo() },
    { title: 'Quote',         description: 'Highlight a quote',         icon: <Quote size={20} />,       action: e => e?.chain().focus().toggleBlockquote().run() },
    { title: 'List',          description: 'Bullet or numbered list',   icon: <List size={20} />,        action: e => e?.chain().focus().toggleBulletList().run() },
    { title: 'Divider',       description: 'A horizontal separator',    icon: <Minus size={20} />,       action: e => e?.chain().focus().setHorizontalRule().run() },
  ];
}

// ─── SlashMenu component ──────────────────────────────────────────────────────

interface SlashMenuProps {
  items: SlashItem[];
  pos: { top: number; left: number };
  onSelect: (item: SlashItem) => void;
  onClose: () => void;
}

function SlashMenu({ items, pos, onSelect, onClose }: SlashMenuProps) {
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setIdx(0); }, [items.length]);

  useEffect(() => {
    const el = ref.current?.querySelectorAll('button')[idx] as HTMLElement;
    el?.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => (i + 1) % items.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => (i - 1 + items.length) % items.length); }
      else if (e.key === 'Enter') { e.preventDefault(); onSelect(items[idx]); }
      else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', fn, true);
    return () => window.removeEventListener('keydown', fn, true);
  }, [items, idx, onSelect, onClose]);

  if (!items.length) return null;

  const top = Math.min(pos.top, window.innerHeight - 440);
  const left = Math.min(pos.left, window.innerWidth - 336);

  return (
    <div ref={ref} className="fixed z-[9999] bg-white dark:bg-gray-900 rounded-2xl overflow-hidden w-80 py-2"
      style={{ top, left, boxShadow: '0 8px 40px rgba(0,0,0,0.14)' }}>
      {items.map((item, i) => (
        <button key={item.title}
          onMouseEnter={() => setIdx(i)}
          onMouseDown={e => { e.preventDefault(); onSelect(item); }}
          className={`w-[calc(100%-8px)] mx-1 flex items-center gap-3.5 px-3 py-3 rounded-xl text-left transition-colors ${i === idx ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'}`}>
          <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${i === idx ? 'bg-[#1d7dd4] text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>{item.icon}</span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-gray-900 dark:text-white leading-tight">{item.title}</span>
            <span className="block text-[13px] text-gray-400 dark:text-gray-500 mt-0.5">{item.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Selection toolbar ────────────────────────────────────────────────────────

interface SelToolbarProps {
  editor: TipEditor;
  pos: { top: number; left: number };
  onLink: () => void;
  onImage: () => void;
}

function SelectionToolbar({ editor, pos, onLink, onImage }: SelToolbarProps) {
  const [showHeadings, setShowHeadings] = useState(false);
  const [showLists, setShowLists] = useState(false);
  if (!editor) return null;
  const top = Math.max(8, pos.top - 52);
  const left = Math.max(8, Math.min(pos.left - 100, window.innerWidth - 280));
  const activeHeading = ([1,2,3,4,5,6] as const).find(l => editor.isActive('heading', { level: l }));
  return (
    <div className="fixed z-50 flex items-center gap-px bg-gray-900 dark:bg-gray-950 rounded-xl shadow-2xl px-1.5 py-1.5 select-none"
      style={{ top, left }}
      onMouseDown={e => e.preventDefault()}>
      {/* Heading dropdown */}
      <div className="relative">
        <button
          title="Heading"
          onMouseDown={e => { e.preventDefault(); setShowHeadings(v => !v); }}
          className={`h-8 px-2 rounded-lg flex items-center gap-1 transition-colors text-xs font-semibold ${activeHeading ? 'bg-white/20 text-white' : 'text-white hover:bg-white/15'}`}>
          {activeHeading ? `H${activeHeading}` : 'H'}
          <ChevronDown size={11} />
        </button>
        {showHeadings && (
          <div className="absolute top-full left-0 mt-1 bg-gray-900 dark:bg-gray-950 rounded-xl shadow-2xl py-1 min-w-[80px]">
            {([1,2,3,4,5,6] as const).map(level => (
              <button key={level}
                onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHeading({ level }).run(); setShowHeadings(false); }}
                className={`w-full px-3 py-1.5 text-left text-xs font-semibold transition-colors ${editor.isActive('heading', { level }) ? 'text-white bg-white/20' : 'text-white/80 hover:bg-white/15'}`}>
                H{level}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="w-px h-5 bg-white/20 mx-0.5" />
      <button title="Bold" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}
        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${editor.isActive('bold') ? 'bg-white/20 text-white' : 'text-white hover:bg-white/15'}`}><Bold size={13} /></button>
      <button title="Italic" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}
        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${editor.isActive('italic') ? 'bg-white/20 text-white' : 'text-white hover:bg-white/15'}`}><Italic size={13} /></button>
      <button title="Code" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleCode().run(); }}
        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${editor.isActive('code') ? 'bg-white/20 text-white' : 'text-white hover:bg-white/15'}`}><Code size={13} /></button>
      {/* List dropdown */}
      <div className="relative">
        <button
          title="List"
          onMouseDown={e => { e.preventDefault(); setShowLists(v => !v); }}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${editor.isActive('bulletList') || editor.isActive('orderedList') ? 'bg-white/20 text-white' : 'text-white hover:bg-white/15'}`}>
          {editor.isActive('orderedList') ? <ListOrdered size={13} /> : <List size={13} />}
        </button>
        {showLists && (
          <div className="absolute top-full left-0 mt-1 bg-gray-900 dark:bg-gray-950 rounded-xl shadow-2xl py-1 min-w-[130px]">
            <button
              onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBulletList().run(); setShowLists(false); }}
              className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 transition-colors ${editor.isActive('bulletList') ? 'text-white bg-white/20' : 'text-white/80 hover:bg-white/15'}`}>
              <List size={13} /> Bullet List
            </button>
            <button
              onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run(); setShowLists(false); }}
              className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 transition-colors ${editor.isActive('orderedList') ? 'text-white bg-white/20' : 'text-white/80 hover:bg-white/15'}`}>
              <ListOrdered size={13} /> Numbered List
            </button>
          </div>
        )}
      </div>
      <div className="w-px h-5 bg-white/20 mx-0.5" />
      <button title="Link" onMouseDown={e => { e.preventDefault(); onLink(); }}
        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${editor.isActive('link') ? 'bg-white/20 text-white' : 'text-white hover:bg-white/15'}`}><LinkIcon size={13} /></button>
      <button title="Image" onMouseDown={e => { e.preventDefault(); onImage(); }}
        className="w-8 h-8 rounded-lg text-white hover:bg-white/15 transition-colors flex items-center justify-center"><ImageIcon size={13} /></button>
    </div>
  );
}

// ─── Image hover overlay ──────────────────────────────────────────────────────

interface ImgOverlayProps {
  pos: { top: number; left: number; width: number; height: number };
  currentAlt: string;
  onAltSave: (alt: string) => void;
  onDelete: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function ImageHoverOverlay({ pos, currentAlt, onAltSave, onDelete, onMouseEnter, onMouseLeave }: ImgOverlayProps) {
  const [editingAlt, setEditingAlt] = useState(false);
  const [altDraft, setAltDraft] = useState(currentAlt);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingAlt) {
      setAltDraft(currentAlt);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editingAlt, currentAlt]);

  const commit = () => {
    onAltSave(altDraft);
    setEditingAlt(false);
  };

  return (
    <div
      className="fixed z-40 pointer-events-none"
      style={{ top: pos.top, left: pos.left, width: pos.width, height: pos.height, background: 'transparent' }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDown={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
    >
      {/* action pill — bottom-right corner */}
      <div
        className="absolute bottom-2.5 right-2.5 pointer-events-auto"
        onMouseDown={e => e.preventDefault()}
      >
        {editingAlt ? (
          <div className="flex items-center gap-1 bg-gray-900/90 dark:bg-gray-950/95 backdrop-blur-sm rounded-xl px-2 py-1.5 shadow-xl">
            <input
              ref={inputRef}
              value={altDraft}
              onChange={e => setAltDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } else if (e.key === 'Escape') setEditingAlt(false); }}
              onDoubleClick={e => (e.target as HTMLInputElement).select()}
              placeholder="Alt text…"
              className="bg-transparent text-white text-xs outline-none w-44 placeholder-white/40"
            />
            <button
              onMouseDown={e => { e.preventDefault(); commit(); }}
              className="w-6 h-6 rounded-lg flex items-center justify-center text-green-400 hover:bg-white/15 transition-colors shrink-0"
            >
              <Check size={12} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-px bg-gray-900/90 dark:bg-gray-950/95 backdrop-blur-sm rounded-xl px-1.5 py-1.5 shadow-xl">
            <button
              title={currentAlt ? `Alt: "${currentAlt}"` : 'Add alt text'}
              onMouseDown={e => { e.preventDefault(); setEditingAlt(true); }}
              className="h-7 px-2 rounded-lg flex items-center gap-1.5 text-white hover:bg-white/15 transition-colors"
            >
              <Type size={12} />
              <span className="text-[11px] font-medium leading-none">ALT</span>
            </button>
            <div className="w-px h-4 bg-white/20 mx-0.5" />
            <button
              title="Delete image"
              onMouseDown={e => { e.preventDefault(); onDelete(); }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-white/15 transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Slash extension (ProseMirror Suggestion) ─────────────────────────────────

function buildSlashExtension(
  onOpen: (items: SlashItem[], pos: {top:number;left:number}, selectFn: (item: SlashItem) => void) => void,
  onUpdate: (items: SlashItem[], query: string) => void,
  onClose: () => void,
  getItems: (query: string) => SlashItem[],
) {
  return Extension.create({
    name: 'slash',
    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          char: '/',
          startOfLine: false,
          allowSpaces: false,
          command: ({ editor, range, props }) => {
            editor.chain().focus().deleteRange(range).run();
            (props as { item: SlashItem }).item.action(editor);
          },
          items: ({ query }: { query: string }) => getItems(query),
          render: () => {
            let selectFn: ((item: SlashItem) => void) | null = null;
            return {
              onStart: (props: unknown) => {
                const p = props as { clientRect?: () => DOMRect | null; items: SlashItem[]; command: (props: unknown) => void };
                selectFn = (item: SlashItem) => p.command({ item });
                const rect = p.clientRect?.() ?? new DOMRect();
                onOpen(p.items, { top: rect.bottom + window.scrollY, left: rect.left }, selectFn);
              },
              onUpdate: (props: unknown) => {
                const p = props as { items: SlashItem[]; query: string; command: (props: unknown) => void; clientRect?: () => DOMRect | null };
                selectFn = (item: SlashItem) => p.command({ item });
                onUpdate(p.items, p.query);
              },
              onKeyDown: (props: unknown) => {
                const p = props as { event: KeyboardEvent };
                return ['ArrowDown','ArrowUp','Enter','Escape'].includes(p.event.key);
              },
              onExit: () => {
                onClose();
              },
            };
          },
        }),
      ];
    },
  });
}

// ─── Editor component ─────────────────────────────────────────────────────────

interface EditorProps {
  post: Post | null;
  onSave: (post: Post) => void;
  onNew: () => void;
  theme: Theme;
  onThemeToggle: () => void;
  wpConfig: WordPressConfig | null;
  onWpConfigUpdate: (config: WordPressConfig | null) => void;
}

export default function Editor({ post, onSave, onNew, theme, onThemeToggle, wpConfig, onWpConfigUpdate }: EditorProps) {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [title, setTitle] = useState(post?.title || '');
  const [categories, setCategories] = useState<string[]>(post?.categories || []);
  const [tags, setTags] = useState<string[]>(post?.tags || []);
  const [featuredMediaId, setFeaturedMediaId] = useState<number | undefined>(post?.featuredMediaId);

  const [showConfig, setShowConfig] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [savedIndicator, setSavedIndicator] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [insightsMode, setInsightsMode] = useState(false);
  const [insightsMetrics, setInsightsMetrics] = useState<WritingMetrics | null>(null);
  const [wipTooltip, setWipTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const lastScrollY = useRef(0);

  // Slash menu
  const [slashItems, setSlashItems] = useState<SlashItem[]>([]);
  const [slashPos, setSlashPos] = useState({ top: 0, left: 0 });
  const [slashOpen, setSlashOpen] = useState(false);
  const slashSelectRef = useRef<((item: SlashItem) => void) | null>(null);

  // Selection toolbar
  const [selPos, setSelPos] = useState<{ top: number; left: number } | null>(null);
  const selDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Image overlay (hover)
  const [imgOverlayPos, setImgOverlayPos] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [imgOverlayAlt, setImgOverlayAlt] = useState('');
  const editingImgNodePos = useRef<number | null>(null);
  const overlayLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Image modal
  const [showImageModal, setShowImageModal] = useState(false);
  const [imgUrl, setImgUrl] = useState('');
  const [imgAlt, setImgAlt] = useState('');
  const [imgDragging, setImgDragging] = useState(false);
  const [imgFeatured, setImgFeatured] = useState(false);
  const [imgMediaId, setImgMediaId] = useState<number | null>(null);
  const [imgEditMode, setImgEditMode] = useState(false);
  const imgInput = useRef<HTMLInputElement>(null);

  // Video modal
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoEmbedUrl, setVideoEmbedUrl] = useState<string | null>(null);

  // Link dialog
  const [showLink, setShowLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');

  const titleRef = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const MAX_W = 750, QUALITY = 0.8;

  const openImageModal = useCallback(() => {
    setImgUrl(''); setImgAlt(''); setImgFeatured(false); setImgMediaId(null); setImgEditMode(false); setShowImageModal(true);
  }, []);

  const openVideoModal = useCallback(() => {
    setVideoUrl(''); setVideoEmbedUrl(null); setShowVideoModal(true);
  }, []);

  // Build slash items (stable — openImageModal and openVideoModal are stable)
  const allSlashItems = useRef(makeSlashItems(openImageModal, openVideoModal));

  const getSlashItems = useCallback((query: string) => {
    if (!query) return allSlashItems.current;
    const q = query.toLowerCase();
    return allSlashItems.current.filter(i => i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
  }, []);

  const insightsExt = useRef(
    Extension.create({
      name: 'writingInsights',
      addProseMirrorPlugins() {
        return [
          new Plugin({
            key: insightsPluginKey,
            state: {
              init: () => DecorationSet.empty,
              apply(tr, decos) {
                const meta = tr.getMeta(insightsPluginKey);
                if (meta !== undefined) return meta as DecorationSet;
                if (tr.docChanged) return decos.map(tr.mapping, tr.doc);
                return decos;
              },
            },
            props: {
              decorations(state) {
                return insightsPluginKey.getState(state) ?? DecorationSet.empty;
              },
            },
          }),
        ];
      },
    })
  );

  const slashExt = useRef(
    buildSlashExtension(
      (items, pos, selectFn) => {
        slashSelectRef.current = selectFn;
        setSlashItems(items);
        setSlashPos(pos);
        setSlashOpen(true);
      },
      (items) => {
        setSlashItems(items);
      },
      () => setSlashOpen(false),
      getSlashItems,
    )
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Image.configure({ inline: false }),
      VideoEmbed,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') return `Heading ${(node.attrs as { level: number }).level}`;
          return 'Start writing… type / for commands';
        },
        showOnlyCurrent: true,
      }),
      insightsExt.current,
      slashExt.current,
    ],
    content: markdownToHtml(post?.content || ''),
    onUpdate: ({ editor: e }) => {
      setHasUnsavedChanges(true);
      setTags(extractHashtags(editorToMarkdown(e)));
    },
    onBlur: () => setTimeout(() => {
      if (!wrapRef.current?.contains(document.activeElement)) {
        setSelPos(null);
        setImgOverlayPos(null);
      }
    }, 80),
    onSelectionUpdate: ({ editor: e }) => {
      const sel = e.state.selection;
      // Suppress text toolbar when an image NodeSelection is active
      if (sel instanceof NodeSelection && (sel as any).node?.type?.name === 'image') {
        if (selDebounce.current) clearTimeout(selDebounce.current);
        setSelPos(null);
        return;
      }

      const { from, to } = sel;
      if (from === to) {
        if (selDebounce.current) clearTimeout(selDebounce.current);
        setSelPos(null);
        return;
      }

      // Debounce the native-selection read: on double-click the browser updates
      // window.getSelection() slightly after ProseMirror's onSelectionUpdate fires,
      // so we wait a tick to avoid reading a still-collapsed native selection.
      if (selDebounce.current) clearTimeout(selDebounce.current);
      selDebounce.current = setTimeout(() => {
        const winSel = window.getSelection();
        if (!winSel || winSel.isCollapsed || winSel.rangeCount === 0) { setSelPos(null); return; }
        const rect = winSel.getRangeAt(0).getBoundingClientRect();
        if (!rect.width) { setSelPos(null); return; }
        setSelPos({ top: rect.top, left: rect.left + rect.width / 2 });
      }, 16);
    },
    editorProps: {
      attributes: { class: 'outline-none min-h-[calc(100vh-14rem)] prose-editor' },
      handleClick(view, _pos, event) {
        const target = event.target as HTMLElement;
        if (target.nodeName !== 'IMG') return false;
        const pos = view.posAtDOM(target, 0);
        const sel = NodeSelection.create(view.state.doc, pos);
        view.dispatch(view.state.tr.setSelection(sel));
        return true;
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    setTitle(post?.title || '');
    setCategories(post?.categories || []);
    setTags(post?.tags || []);
    setFeaturedMediaId(post?.featuredMediaId);
    editor.commands.setContent(markdownToHtml(post?.content || ''), false);
    setHasUnsavedChanges(false);
  }, [post, editor]);

  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.style.height = 'auto';
      titleRef.current.style.height = titleRef.current.scrollHeight + 'px';
    }
  }, [title]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSave(); } };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  });

  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => { if (hasUnsavedChanges) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastScrollY.current;
      if (y < 60) {
        setHeaderVisible(true);
      } else if (delta > 8) {
        setHeaderVisible(false);
      } else if (delta < -8) {
        setHeaderVisible(true);
      }
      lastScrollY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ── Writing Insights ──────────────────────────────────────────────────────

  const insightsModeRef = useRef(insightsMode);
  insightsModeRef.current = insightsMode;

  const recomputeInsights = useCallback(() => {
    if (!editor) return;
    const paragraphTexts: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'paragraph') {
        paragraphTexts.push(node.textContent);
        return false;
      }
      return true;
    });
    const metrics = analyzeDocument(paragraphTexts);
    setInsightsMetrics(metrics);

    // Build ProseMirror-position decorations from per-paragraph char-offset highlights
    const pmDecos: Decoration[] = [];
    let paraIdx = 0;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph') {
        const highlights = metrics.paragraphHighlights[paraIdx++] ?? [];
        // Map each text child to absolute PM positions
        const charToPm: number[] = [];
        node.forEach((child, offset) => {
          if (child.isText && child.text) {
            for (let i = 0; i < child.text.length; i++) {
              charToPm.push(pos + 1 + offset + i);
            }
          }
        });
        for (const h of highlights) {
          const pmFrom = charToPm[h.from];
          const lastIdx = Math.min(h.to - 1, charToPm.length - 1);
          const pmTo = lastIdx >= 0 && charToPm[lastIdx] !== undefined
            ? charToPm[lastIdx] + 1
            : pmFrom;
          if (pmFrom !== undefined && pmTo > pmFrom) {
            pmDecos.push(
              Decoration.inline(pmFrom, pmTo, {
                class: `wi-hl wi-hl-${h.type}`,
                'data-wi-tip': h.tooltip,
              })
            );
          }
        }
        return false;
      }
      return true;
    });

    const decoSet = pmDecos.length > 0
      ? DecorationSet.create(editor.state.doc, pmDecos)
      : DecorationSet.empty;
    editor.view.dispatch(editor.state.tr.setMeta(insightsPluginKey, decoSet));
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    if (insightsMode) {
      recomputeInsights();
      const handler = () => { if (insightsModeRef.current) recomputeInsights(); };
      editor.on('update', handler);
      return () => { editor.off('update', handler); };
    } else {
      setInsightsMetrics(null);
      setWipTooltip(null);
      if (editor.state) {
        editor.view.dispatch(editor.state.tr.setMeta(insightsPluginKey, DecorationSet.empty));
      }
    }
  }, [editor, insightsMode, recomputeInsights]);

  // Tooltip on highlight hover
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    const onOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.wi-hl');
      if (target instanceof HTMLElement) {
        const tip = target.getAttribute('data-wi-tip');
        if (tip) {
          const rect = target.getBoundingClientRect();
          setWipTooltip({ text: tip, x: rect.left + rect.width / 2, y: rect.top });
        }
      }
    };
    const onOut = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.wi-hl')) setWipTooltip(null);
    };
    dom.addEventListener('mouseover', onOver);
    dom.addEventListener('mouseout', onOut);
    return () => {
      dom.removeEventListener('mouseover', onOver);
      dom.removeEventListener('mouseout', onOut);
    };
  }, [editor]);

  // ── Image hover overlay ───────────────────────────────────────────────────

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;

    const showOverlay = (img: HTMLImageElement) => {
      if (overlayLeaveTimer.current) { clearTimeout(overlayLeaveTimer.current); overlayLeaveTimer.current = null; }
      const pos = editor.view.posAtDOM(img, 0);
      editingImgNodePos.current = pos;
      const node = editor.state.doc.nodeAt(pos);
      setImgOverlayAlt(node?.attrs.alt || '');
      const rect = img.getBoundingClientRect();
      setImgOverlayPos({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    };

    const hideOverlay = () => {
      overlayLeaveTimer.current = setTimeout(() => {
        setImgOverlayPos(null);
        editingImgNodePos.current = null;
      }, 120);
    };

    const onEnter = (e: MouseEvent) => { if ((e.target as HTMLElement).nodeName === 'IMG') showOverlay(e.target as HTMLImageElement); };
    const onLeave = (e: MouseEvent) => { if ((e.target as HTMLElement).nodeName === 'IMG') hideOverlay(); };
    const onScroll = () => {
      if (editingImgNodePos.current === null) return;
      const view = editor.view;
      const imgDom = view.nodeDOM(editingImgNodePos.current) as HTMLElement | null;
      if (imgDom) {
        const rect = imgDom.getBoundingClientRect();
        setImgOverlayPos(p => p ? { ...p, top: rect.top, left: rect.left } : null);
      }
    };

    dom.addEventListener('mouseover', onEnter);
    dom.addEventListener('mouseout', onLeave);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      dom.removeEventListener('mouseover', onEnter);
      dom.removeEventListener('mouseout', onLeave);
      window.removeEventListener('scroll', onScroll);
    };
  }, [editor]);

  // ── Save ──────────────────────────────────────────────────────────────────

  const openImageEditModal = useCallback(() => {
    if (!editor || editingImgNodePos.current === null) return;
    const node = editor.state.doc.nodeAt(editingImgNodePos.current);
    setImgUrl(node?.attrs.src || '');
    setImgAlt(node?.attrs.alt || '');
    setImgFeatured(false);
    setImgMediaId(null);
    setImgEditMode(true);
    setShowImageModal(true);
    setImgOverlayPos(null);
  }, [editor]);

  const saveImgAlt = useCallback((alt: string) => {
    if (!editor || editingImgNodePos.current === null) return;
    const pos = editingImgNodePos.current;
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;
    editor.chain().focus().command(({ tr }) => {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, alt });
      return true;
    }).run();
    setImgOverlayAlt(alt);
    setHasUnsavedChanges(true);
  }, [editor]);

  const handleSave = useCallback(() => {
    if (!editor) return;
    const markdown = editorToMarkdown(editor);
    const newPost: Post = {
      id: post?.id || crypto.randomUUID(),
      title: title || 'Untitled',
      content: markdown,
      categories: [...categories],
      tags: extractHashtags(markdown),
      lastModified: Date.now(),
      wordpressId: post?.wordpressId,
      publishedAsDraft: post?.publishedAsDraft,
      featuredMediaId,
    };
    onSave(newPost);
    setHasUnsavedChanges(false);
    setSavedIndicator(true);
    setTimeout(() => setSavedIndicator(false), 2000);
    confetti({ particleCount: 80, spread: 60, origin: { y: 0.5, x: 0.85 }, colors: ['#1d7dd4', '#60a5fa', '#bfdbfe'], ticks: 150, scalar: 0.8 });
  }, [editor, post, title, categories, featuredMediaId, onSave]);

  const handlePublish = async () => {
    if (!editor) return;
    if (!wpConfig) { setShowConfig(true); return; }
    if (!post) { showToast('Please save your post first', 'info'); return; }
    try {
      setPublishing(true);
      const markdown = editorToMarkdown(editor);
      const result = await publishToWordPress(
        { ...post, content: markdown, tags: extractHashtags(markdown) },
        wpConfig
      );
      onSave({ ...post, wordpressId: result.id, lastModified: Date.now(), wpModified: Date.now() });
      setHasUnsavedChanges(false);
      showToast(`Successfully ${post.wordpressId ? 'republished' : 'published'} to WordPress!`, 'success', result.link);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to publish to WordPress', 'error');
    } finally { setPublishing(false); }
  };

  const handleNew = async () => {
    if (hasUnsavedChanges) {
      const ok = await confirm({ message: 'You have unsaved changes. Leave without saving?', confirmLabel: 'Leave', cancelLabel: 'Stay' });
      if (!ok) return;
    }
    onNew();
  };

  // ── Image upload ───────────────────────────────────────────────────────────

  const handleImgFile = async (file: File) => {
    if (!wpConfig) {
      setImgUrl(URL.createObjectURL(file));
      setImgAlt(file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9\s]/g, ' ').trim());
      return;
    }
    setIsUploadingImage(true); setUploadProgress('Uploading image…');
    try {
      const processed = await processImageForUpload(file, MAX_W, QUALITY);
      const result = await uploadMediaToWordPress(processed, wpConfig);
      setImgUrl(result.url);
      setImgMediaId(result.id);
      setImgAlt(file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9\s]/g, ' ').trim());
    } finally { setIsUploadingImage(false); setUploadProgress(''); }
  };

  const insertImage = () => {
    if (!imgUrl || !editor) return;
    if (imgEditMode && editingImgNodePos.current !== null) {
      const pos = editingImgNodePos.current;
      editor.chain().focus().command(({ tr }) => {
        tr.setNodeMarkup(pos, undefined, { src: imgUrl, alt: imgAlt });
        return true;
      }).run();
    } else {
      editor.chain().focus().setImage({ src: imgUrl, alt: imgAlt }).run();
    }
    if (imgFeatured && imgMediaId) {
      setFeaturedMediaId(imgMediaId);
    }
    editingImgNodePos.current = null;
    setImgEditMode(false);
    setShowImageModal(false);
    setHasUnsavedChanges(true);
  };

  const insertVideo = () => {
    if (!videoEmbedUrl || !editor) return;
    (editor.chain().focus() as any).insertVideoEmbed(videoEmbedUrl).run();
    setShowVideoModal(false);
    setHasUnsavedChanges(true);
  };

  const handleDropUpload = async (files: FileList) => {
    if (!wpConfig) { showToast('Please configure WordPress connection first.', 'info'); setShowConfig(true); return; }
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!imgs.length) { showToast('Please drop image files only.', 'info'); return; }
    setIsUploadingImage(true);
    try {
      for (let i = 0; i < imgs.length; i++) {
        setUploadProgress(`Uploading image ${i + 1} of ${imgs.length}…`);
        try {
          const p = await processImageForUpload(imgs[i], MAX_W, QUALITY);
          const result = await uploadMediaToWordPress(p, wpConfig);
          const alt = imgs[i].name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
          editor?.chain().focus().setImage({ src: result.url, alt }).run();
        } catch (err) { showToast(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error'); }
      }
    } finally { setIsUploadingImage(false); setUploadProgress(''); }
  };

  // ── Link dialog ────────────────────────────────────────────────────────────

  const openLink = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from !== to) setLinkText(editor.state.doc.textBetween(from, to, ''));
    setLinkUrl(''); setShowLink(true); setSelPos(null);
  }, [editor]);

  const submitLink = () => {
    if (!linkUrl || !editor) return;
    if (linkText && editor.state.selection.empty) {
      editor.chain().focus().insertContent(`<a href="${linkUrl}">${linkText}</a>`).unsetMark('link').run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).command(({ tr }) => {
        tr.setSelection(TextSelection.near(tr.doc.resolve(tr.selection.to)));
        return true;
      }).unsetMark('link').run();
    }
    setShowLink(false); setLinkUrl(''); setLinkText('');
    setHasUnsavedChanges(true);
  };

  // ── Slash menu select ──────────────────────────────────────────────────────

  const handleSlashSelect = useCallback((item: SlashItem) => {
    setSlashOpen(false);
    slashSelectRef.current?.(item);
  }, []);

  // ── Drag ──────────────────────────────────────────────────────────────────

  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); if (e.dataTransfer.types.includes('Files')) setIsDragging(true); };
  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); if (e.dataTransfer.types.includes('Files')) setIsDragging(true); };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    const r = wrapRef.current?.getBoundingClientRect();
    if (r && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) setIsDragging(false);
  };
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files.length) handleDropUpload(e.dataTransfer.files); };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div ref={wrapRef} className="min-h-screen bg-white dark:bg-[#1a1a1a]"
      onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>

      <style>{`
        .prose-editor { font-family: 'Inter', system-ui, sans-serif; }
        .prose-editor p { font-size: 1.0625rem; line-height: 1.85; color: #1f2937; margin-top: 0; margin-bottom: 1.25em; }
        .prose-editor p:last-child { margin-bottom: 0; }
        .dark .prose-editor p { color: #f3f4f6; }
        .prose-editor h1 { font-size: 2rem; font-weight: 700; line-height: 1.2; letter-spacing: -0.02em; color: #111827; margin-top: 2rem; margin-bottom: 0.25rem; }
        .prose-editor h2 { font-size: 1.5rem; font-weight: 700; line-height: 1.3; letter-spacing: -0.02em; color: #111827; margin-top: 1.5rem; margin-bottom: 0.25rem; }
        .prose-editor h3 { font-size: 1.2rem; font-weight: 600; line-height: 1.3; color: #111827; margin-top: 1rem; margin-bottom: 0.125rem; }
        .dark .prose-editor h1, .dark .prose-editor h2, .dark .prose-editor h3 { color: #ffffff; }
        .prose-editor blockquote { border-left: 4px solid #d1d5db; padding-left: 1.25rem; margin: 0.5rem 0; }
        .dark .prose-editor blockquote { border-left-color: #4b5563; }
        .prose-editor blockquote p { color: #6b7280; }
        .dark .prose-editor blockquote p { color: #d1d5db; }
        .prose-editor pre { background: #f9fafb; border-radius: 0.75rem; padding: 0.75rem 1rem; margin: 0.5rem 0; }
        .dark .prose-editor pre { background: rgba(31,41,55,0.8); }
        .prose-editor pre code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 0.875rem; color: #047857; background: none; padding: 0; border-radius: 0; }
        .dark .prose-editor pre code { color: #34d399; }
        .prose-editor code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 0.875em; background: #f3f4f6; color: #047857; padding: 0.1em 0.3em; border-radius: 0.25rem; }
        .dark .prose-editor code { background: #374151; color: #34d399; }
        .prose-editor ul { list-style: none; padding-left: 1rem; margin: 0.25rem 0; }
        .prose-editor ul li { position: relative; padding-left: 0.5rem; font-size: 1.0625rem; line-height: 1.85; color: #1f2937; }
        .dark .prose-editor ul li { color: #f3f4f6; }
        .prose-editor ul li::before { content: '•'; position: absolute; left: -0.75rem; color: #9ca3af; }
        .prose-editor ol { list-style-type: decimal; padding-left: 1.5rem; margin: 0.25rem 0; }
        .prose-editor ol li { font-size: 1.0625rem; line-height: 1.85; color: #1f2937; }
        .dark .prose-editor ol li { color: #f3f4f6; }
        .prose-editor li p { margin: 0; }
        .prose-editor hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0; }
        .dark .prose-editor hr { border-top-color: #374151; }
        .prose-editor img { border-radius: 0.75rem; max-width: 100%; max-height: 480px; width: 100%; object-fit: cover; margin: 1rem 0; display: block; }
        .prose-editor .video-embed { position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 0.75rem; margin: 1rem 0; background: #000; }
        .prose-editor .video-embed iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 0.75rem; }
        .prose-editor a { color: #1d7dd4; text-decoration: underline; }
        .prose-editor strong { font-weight: 700; }
        .prose-editor em { font-style: italic; }
        .prose-editor .is-empty::before {
          content: attr(data-placeholder);
          color: #d1d5db;
          pointer-events: none;
          float: left;
          height: 0;
        }
        .dark .prose-editor .is-empty::before { color: #4b5563; }
        /* Writing Insights highlights */
        .wi-hl { border-radius: 3px; transition: filter 0.1s; }
        .wi-hl:hover { filter: brightness(0.92); }
        .wi-hl-very-long { background: rgba(239,68,68,0.18); border-bottom: 2px solid rgba(239,68,68,0.5); }
        .wi-hl-long { background: rgba(251,146,60,0.18); border-bottom: 2px solid rgba(251,146,60,0.5); }
        .wi-hl-passive { background: rgba(59,130,246,0.15); border-bottom: 2px dotted rgba(59,130,246,0.6); }
        .wi-hl-weak { background: rgba(168,85,247,0.15); text-decoration: underline dotted rgba(168,85,247,0.7); }
        .wi-hl-transition-overused { background: rgba(245,158,11,0.18); border-bottom: 2px dotted rgba(245,158,11,0.6); }
        .wi-hl-caps { background: rgba(234,179,8,0.2); border-bottom: 2px solid rgba(234,179,8,0.5); }
        .wi-hl-excess-punct { background: rgba(239,68,68,0.2); border-bottom: 2px solid rgba(239,68,68,0.5); }
      `}</style>

      {isUploadingImage && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl px-8 py-6 flex items-center gap-4 shadow-2xl">
            <Loader2 size={22} className="animate-spin text-blue-600" />
            <span className="text-gray-800 dark:text-white text-sm font-medium">{uploadProgress}</span>
          </div>
        </div>
      )}

      {isDragging && <div className="fixed inset-0 bg-blue-500/10 border-2 border-blue-400 border-dashed pointer-events-none z-40 rounded-lg m-4" />}

      {/* Slash command menu */}
      {slashOpen && slashItems.length > 0 && (
        <SlashMenu items={slashItems} pos={slashPos} onSelect={handleSlashSelect} onClose={() => setSlashOpen(false)} />
      )}

      {/* Selection toolbar */}
      {selPos && editor && (
        <SelectionToolbar editor={editor} pos={selPos} onLink={openLink} onImage={openImageModal} />
      )}

      {/* Image hover overlay */}
      {imgOverlayPos && editor && (
        <ImageHoverOverlay
          pos={imgOverlayPos}
          currentAlt={imgOverlayAlt}
          onAltSave={saveImgAlt}
          onMouseEnter={() => { if (overlayLeaveTimer.current) { clearTimeout(overlayLeaveTimer.current); overlayLeaveTimer.current = null; } }}
          onMouseLeave={() => { overlayLeaveTimer.current = setTimeout(() => { setImgOverlayPos(null); editingImgNodePos.current = null; }, 120); }}
          onDelete={() => {
            if (editingImgNodePos.current === null) return;
            const pos = editingImgNodePos.current;
            const sel = NodeSelection.create(editor.state.doc, pos);
            editor.view.dispatch(editor.state.tr.setSelection(sel));
            editor.chain().focus().deleteSelection().run();
            setImgOverlayPos(null);
            editingImgNodePos.current = null;
            setHasUnsavedChanges(true);
          }}
        />
      )}

      {/* Top bar */}
      <header className={`fixed top-0 left-0 right-0 z-30 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 transition-[opacity,transform] duration-300 ease-in-out ${headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 pointer-events-none -translate-y-full'}`}>
        <div className="flex items-center justify-between px-4 h-14 gap-2">
          {/* Left: back */}
          <button onClick={handleNew} className="flex items-center gap-2 pl-1 pr-3 h-9 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm font-medium shrink-0">
            <LayoutList size={16} /><span className="hidden sm:inline">All Posts</span>
          </button>

          {/* Middle: utility icons — desktop only */}
          <div className="hidden sm:flex items-center gap-0.5">
            <button onClick={() => editor?.chain().focus().undo().run()} disabled={!editor?.can().undo()}
              className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <Undo2 size={16} />
            </button>
            <button onClick={() => { if (!wpConfig) { showToast('Configure WordPress first.', 'info'); setShowConfig(true); return; } setShowCategoryManager(true); }}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${categories.length > 0 ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
              <Tag size={16} />
            </button>
            <button onClick={onThemeToggle} className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              {theme === 'dark' ? <Sun size={16} className="text-yellow-400" /> : <Moon size={16} />}
            </button>
            <button onClick={() => setShowConfig(true)} className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Settings size={16} /></button>
            <button onClick={() => setShowHelpModal(true)} className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><HelpCircle size={16} /></button>
            <button
              onClick={() => setInsightsMode(v => !v)}
              title="Writing Insights"
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${insightsMode ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
              <BarChart2 size={16} />
            </button>
          </div>

          {/* Right: save + publish + mobile more */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Mobile overflow menu */}
            <div className="relative sm:hidden">
              <button onClick={() => setShowMobileMenu(v => !v)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <MoreHorizontal size={18} />
              </button>
              {showMobileMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMobileMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 py-2 min-w-[180px] z-50">
                    <button onClick={() => { editor?.chain().focus().undo().run(); setShowMobileMenu(false); }} disabled={!editor?.can().undo()}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors">
                      <Undo2 size={15} /> Undo
                    </button>
                    <button onClick={() => { if (!wpConfig) { showToast('Configure WordPress first.', 'info'); setShowConfig(true); } else setShowCategoryManager(true); setShowMobileMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <Tag size={15} /> Categories
                    </button>
                    <button onClick={() => { onThemeToggle(); setShowMobileMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      {theme === 'dark' ? <Sun size={15} className="text-yellow-400" /> : <Moon size={15} />}
                      {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                    </button>
                    <button onClick={() => { setShowConfig(true); setShowMobileMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <Settings size={15} /> Settings
                    </button>
                    <button onClick={() => { setShowHelpModal(true); setShowMobileMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <HelpCircle size={15} /> Help
                    </button>
                    <button onClick={() => { setInsightsMode(v => !v); setShowMobileMenu(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${insightsMode ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
                      <BarChart2 size={15} /> Writing Insights
                    </button>
                  </div>
                </>
              )}
            </div>

            <button onClick={handleSave} className={`h-9 px-3 sm:px-4 rounded-full border text-sm font-medium transition-all duration-200 ${savedIndicator ? 'border-green-400 text-green-600 dark:text-green-400 dark:border-green-600' : hasUnsavedChanges ? 'border-gray-400 dark:border-gray-500 text-gray-700 dark:text-gray-300 hover:border-gray-700 dark:hover:border-gray-200' : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-400 dark:hover:border-gray-500'}`}>
              {savedIndicator ? 'Saved' : <><span className="sm:hidden">Save</span><span className="hidden sm:inline">Save draft</span></>}
            </button>
            <button onClick={handlePublish} disabled={publishing} className="h-9 px-3 sm:px-5 rounded-full bg-[#1d7dd4] hover:bg-[#1567b8] active:bg-[#1057a0] text-white text-sm font-medium transition-colors disabled:opacity-60 flex items-center gap-2">
              {publishing && <Loader2 size={13} className="animate-spin" />}
              {publishing ? 'Publishing…' : post?.wordpressId ? 'Republish' : 'Publish'}
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="pt-14 pb-32">
        <div className="max-w-2xl mx-auto px-6 sm:px-8">
          {(categories.length > 0 || tags.length > 0) && (
            <div className="flex flex-wrap gap-2 pt-8 pb-2">
              {categories.map(cat => (
                <span key={cat} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                  <Tag size={10} />{cat}
                </span>
              ))}
              {tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <textarea ref={titleRef} value={title}
            onChange={e => { setTitle(e.target.value); setHasUnsavedChanges(true); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); editor?.commands.focus('start'); } }}
            placeholder="Title" rows={1}
            className="w-full text-[2.1rem] sm:text-[2.5rem] font-bold leading-tight mt-10 mb-2 border-none focus:outline-none focus:ring-0 bg-transparent text-gray-900 dark:text-white resize-none overflow-hidden tracking-tight placeholder-gray-200 dark:placeholder-gray-700"
            style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", minHeight: '1.2em' }} />

          <div className="w-8 h-px bg-gray-200 dark:bg-gray-700 mb-8" />

          <EditorContent editor={editor} />
        </div>
      </main>

      {showConfig && <WordPressConfigModal onClose={() => setShowConfig(false)} onSave={onWpConfigUpdate} />}
      {showCategoryManager && <CategoryManager selectedCategories={categories} onCategoriesChange={cats => setCategories([...cats])} onClose={() => setShowCategoryManager(false)} />}

      {/* Image modal */}
      {showImageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) setShowImageModal(false); }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg p-7">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Add an image</h3>
            <div className={`border-2 border-dashed rounded-xl h-44 flex flex-col items-center justify-center cursor-pointer transition-colors mb-5 ${imgDragging ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
              onClick={() => imgInput.current?.click()}
              onDragOver={e => { e.preventDefault(); setImgDragging(true); }}
              onDragLeave={() => setImgDragging(false)}
              onDrop={e => { e.preventDefault(); setImgDragging(false); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) handleImgFile(f); }}>
              {imgUrl ? <img src={imgUrl} alt="preview" className="max-h-36 max-w-full rounded-lg object-contain" /> : <span className="text-gray-400 dark:text-gray-500 text-sm select-none">Drop a file or click to upload</span>}
            </div>
            <input ref={imgInput} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImgFile(f); }} />
            <div className="flex items-center gap-3 mb-5"><div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" /><span className="text-xs text-gray-400">or</span><div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" /></div>
            <input type="url" value={imgUrl} onChange={e => setImgUrl(e.target.value)} placeholder="Paste an image URL..." className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm mb-3 placeholder-gray-400" />
            <input type="text" value={imgAlt} onChange={e => setImgAlt(e.target.value)} placeholder="Alt text (describe the image)..." className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm mb-5 placeholder-gray-400" />
            <label className="flex items-center gap-3 mb-6 cursor-pointer select-none">
              <div onClick={() => setImgFeatured(v => !v)} className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${imgFeatured ? 'bg-[#1d7dd4] border-[#1d7dd4]' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'}`}>
                {imgFeatured && <svg viewBox="0 0 10 8" fill="none" className="w-3 h-3"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
              <span className="text-sm text-gray-700 dark:text-gray-300" onClick={() => setImgFeatured(v => !v)}>Set as featured image</span>
            </label>
            <button onClick={insertImage} disabled={!imgUrl} className="w-full py-3.5 bg-[#1d7dd4] hover:bg-[#1567b8] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors text-sm">Insert image</button>
          </div>
        </div>
      )}

      {/* Video modal */}
      {showVideoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) setShowVideoModal(false); }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg p-7">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Embed a video</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Paste a YouTube or Vimeo URL</p>
            <input
              type="url"
              autoFocus
              value={videoUrl}
              onChange={e => { setVideoUrl(e.target.value); setVideoEmbedUrl(toEmbedUrl(e.target.value)); }}
              onKeyDown={e => { if (e.key === 'Enter') insertVideo(); else if (e.key === 'Escape') setShowVideoModal(false); }}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm mb-4 placeholder-gray-400"
            />
            {videoUrl && !videoEmbedUrl && (
              <p className="text-xs text-red-500 mb-4">Unrecognised URL — please use a YouTube or Vimeo link.</p>
            )}
            {videoEmbedUrl && (
              <VideoPreview url={videoUrl} embedUrl={videoEmbedUrl} />
            )}
            <div className="flex gap-3">
              <button onClick={() => setShowVideoModal(false)} className="flex-1 py-3 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
              <button onClick={insertVideo} disabled={!videoEmbedUrl} className="flex-1 py-3 bg-[#1d7dd4] hover:bg-[#1567b8] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors text-sm">Insert video</button>
            </div>
          </div>
        </div>
      )}

      {/* Link dialog */}
      {showLink && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-5 text-gray-900 dark:text-white">Insert Link</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Link Text</label>
                <input type="text" value={linkText} onChange={e => setLinkText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitLink(); } else if (e.key === 'Escape') setShowLink(false); }}
                  placeholder="Link text" autoFocus className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">URL</label>
                <input type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitLink(); } else if (e.key === 'Escape') setShowLink(false); }}
                  placeholder="https://example.com" className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowLink(false); setLinkUrl(''); setLinkText(''); }} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">Cancel</button>
              <button onClick={submitLink} disabled={!linkUrl} className="px-5 py-2 text-sm bg-[#1d7dd4] hover:bg-[#1567b8] text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Insert</button>
            </div>
          </div>
        </div>
      )}

      {/* Help modal */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) setShowHelpModal(false); }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-7 pt-7 pb-5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">Keyboard shortcuts & tips</h3>
              <button onClick={() => setShowHelpModal(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <svg viewBox="0 0 14 14" fill="none" className="w-3.5 h-3.5"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/></svg>
              </button>
            </div>
            {[
              { section: 'Writing', rows: [{ keys: ['/'], label: 'Open block type menu' }, { keys: ['↑ ↓'], label: 'Navigate menu' }, { keys: ['Enter'], label: 'Confirm selection' }, { keys: ['Esc'], label: 'Close menu' }, { keys: ['#tag'], label: 'Add a tag (on its own line)' }] },
              { section: 'Formatting', rows: [{ keys: ['# '], label: 'Heading 1' }, { keys: ['## '], label: 'Heading 2' }, { keys: ['> '], label: 'Blockquote' }, { keys: ['- '], label: 'Bullet list' }, { keys: ['``` '], label: 'Code block' }, { keys: ['⌘B'], label: 'Bold' }, { keys: ['⌘I'], label: 'Italic' }] },
              { section: 'File', rows: [{ keys: ['⌘S', 'Ctrl S'], label: 'Save draft' }, { keys: ['Drag & drop'], label: 'Upload image' }] },
            ].map(({ section, rows }) => (
              <div key={section} className="px-7 pb-5">
                <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">{section}</p>
                <div className="space-y-2.5">
                  {rows.map(({ keys, label }) => (
                    <div key={label} className="flex items-center justify-between gap-4">
                      <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {keys.map(k => <kbd key={k} className="inline-flex items-center justify-center px-2.5 py-1 min-w-[2rem] text-[12px] font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg leading-none">{k}</kbd>)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="px-7 pb-7" />
          </div>
        </div>
      )}

      {/* Writing Insights panel */}
      {insightsMode && insightsMetrics && (
        <InsightsPanel metrics={insightsMetrics} onClose={() => setInsightsMode(false)} />
      )}

      {/* Highlight tooltip */}
      {wipTooltip && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ top: wipTooltip.y - 6, left: wipTooltip.x, transform: 'translateX(-50%) translateY(-100%)' }}
        >
          <div className="bg-gray-900 text-white text-[11px] px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-xl">
            {wipTooltip.text}
          </div>
        </div>
      )}
    </div>
  );
}
