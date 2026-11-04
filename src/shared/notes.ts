// Notes: rich-text pages that live in the sidebar like tabs.

import { newId } from './ids';
import type { AppState, ID, ListName } from './types';
import { attach, locate } from './tree';
import { select } from './ops';

export const UNTITLED = 'Untitled note';

export function createNote(s: AppState, o: { now: number; title?: string; html?: string; spaceId?: ID; list?: Exclude<ListName, 'favorites'>; parentId?: ID | null }): ID {
  const id = newId('note');
  s.items[id] = { id, kind: 'note', title: o.title?.trim() || UNTITLED, html: o.html ?? '', createdAt: o.now, updatedAt: o.now, lastActiveAt: o.now };
  const spaceId = o.spaceId ?? s.activeSpaceId;
  const list = o.list ?? 'today';
  attach(s, id, { list, spaceId, parentId: o.parentId ?? null, index: list === 'today' && !o.parentId ? 0 : Number.MAX_SAFE_INTEGER });
  s.activeSpaceId = spaceId;
  select(s, id, o.now);
  return id;
}

export function updateNote(s: AppState, id: ID, patch: { title?: string; html?: string }, now: number): void {
  const n = s.items[id];
  if (!n || n.kind !== 'note') return;
  if (patch.html !== undefined) n.html = patch.html;
  if (patch.title !== undefined) n.title = patch.title.trim() || UNTITLED;
  n.updatedAt = now;
  n.lastActiveAt = now;
}

/** Plain text of a note, for word counts and search. */
export function noteText(html: string): string {
  return html
    .replace(/<(br|\/p|\/h[1-6]|\/li|\/blockquote|\/pre)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function wordCount(html: string): number {
  const t = noteText(html);
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
}

function decode(s: string) {
  return s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

/** Inline HTML (bold, links…) → Markdown. */
function inline(html: string): string {
  return decode(
    html
      .replace(/<br\s*\/?>/gi, '  \n')
      .replace(/<(strong|b)>(.*?)<\/\1>/gi, '**$2**')
      .replace(/<(em|i)>(.*?)<\/\1>/gi, '*$2*')
      .replace(/<(s|del|strike)>(.*?)<\/\1>/gi, '~~$2~~')
      .replace(/<code>(.*?)<\/code>/gi, '`$1`')
      .replace(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
      .replace(/<[^>]+>/g, ''),
  );
}

/** Notes → Markdown file content (headings, lists, tasks, quotes, code). */
export function noteToMarkdown(title: string, html: string): string {
  const out: string[] = [`# ${title}`, ''];
  const doc = html.replace(/\n/g, '');
  const blockRe = /<(h[1-6]|p|blockquote|pre|ul|ol|hr)([^>]*)>([\s\S]*?)<\/\1>|<hr\s*\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(doc))) {
    if (!m[1] || m[1].toLowerCase() === 'hr') {
      out.push('---', '');
      continue;
    }
    const tag = m[1].toLowerCase();
    const attrs = m[2];
    const body = m[3];
    if (tag.startsWith('h')) out.push(`${'#'.repeat(Math.min(6, Number(tag[1]) + 1))} ${inline(body)}`, '');
    else if (tag === 'p') out.push(inline(body), '');
    else if (tag === 'blockquote') out.push(...inline(body.replace(/<\/p><p>/g, '\n')).split('\n').map((l) => `> ${l}`), '');
    else if (tag === 'pre') out.push('```', decode(body.replace(/<[^>]+>/g, '')), '```', '');
    else {
      const isTask = /data-type="taskList"/i.test(attrs);
      const items = body.match(/<li[^>]*>[\s\S]*?<\/li>/gi) ?? [];
      items.forEach((li, i) => {
        const text = inline(li.replace(/<label>[\s\S]*?<\/label>/i, '').replace(/<\/?(div|p)[^>]*>/gi, ''));
        if (isTask) out.push(`- [${/data-checked="true"/i.test(li) ? 'x' : ' '}] ${text.trim()}`);
        else out.push(`${tag === 'ol' ? `${i + 1}.` : '-'} ${text.trim()}`);
      });
      out.push('');
    }
  }
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

export function noteLocation(s: AppState, id: ID) {
  return locate(s, id);
}
