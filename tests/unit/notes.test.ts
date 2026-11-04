import { describe, expect, it } from 'vitest';
import { createNote, noteText, noteToMarkdown, updateNote, wordCount, UNTITLED } from '@shared/notes';
import { activeItemId, closeItem, pinItem, reopenClosed } from '@shared/ops';
import { archiveItem, restoreArchived, findStale } from '@shared/archive';
import { createFolder } from '@shared/folders';
import { HOUR } from '@shared/defaults';
import { fresh, run, T0 } from './helpers';

describe('notes', () => {
  it('creates a note at the top of Today and opens it', () => {
    let s = fresh();
    let id: string;
    [s, id] = run(s, (d) => createNote(d, { now: T0 }));
    expect(s.spaces[0].today).toEqual([id]);
    expect(activeItemId(s)).toBe(id);
    expect(s.items[id]).toMatchObject({ kind: 'note', title: UNTITLED, html: '' });
  });

  it('can be created inside a folder', () => {
    let s = fresh();
    let f: string, id: string;
    [s, f] = run(s, (d) => createFolder(d, { now: T0 }));
    [s, id] = run(s, (d) => createNote(d, { now: T0, list: 'pinned', parentId: f }));
    expect(s.items[f]).toMatchObject({ children: [id] });
  });

  it('saves title and content, and a blank title falls back', () => {
    let s = fresh();
    let id: string;
    [s, id] = run(s, (d) => createNote(d, { now: T0 }));
    [s] = run(s, (d) => updateNote(d, id, { title: 'Plan', html: '<p>hi</p>' }, T0 + 5));
    expect(s.items[id]).toMatchObject({ title: 'Plan', html: '<p>hi</p>', updatedAt: T0 + 5 });
    [s] = run(s, (d) => updateNote(d, id, { title: '  ' }, T0 + 6));
    expect(s.items[id]).toMatchObject({ title: UNTITLED });
  });

  it('pins, closes with undo, and archives/restores with content', () => {
    let s = fresh();
    let id: string;
    [s, id] = run(s, (d) => createNote(d, { now: T0, html: '<p>keep me</p>', title: 'K' }));
    [s] = run(s, (d) => closeItem(d, id, T0));
    expect(s.items[id]).toBeUndefined();
    [s] = run(s, (d) => reopenClosed(d, T0));
    expect(s.items[id]).toMatchObject({ html: '<p>keep me</p>' });
    [s] = run(s, (d) => pinItem(d, id));
    expect(s.spaces[0].pinned).toEqual([id]);
    [s] = run(s, (d) => archiveItem(d, id, T0));
    let r: string | null;
    [s, r] = run(s, (d) => restoreArchived(d, d.archive[0].id, T0));
    expect(s.items[r!]).toMatchObject({ kind: 'note', title: 'K', html: '<p>keep me</p>' });
  });

  it('unused notes in Today are auto-archived like tabs', () => {
    let s = fresh();
    let id: string;
    [s, id] = run(s, (d) => createNote(d, { now: T0 }));
    [s] = run(s, (d) => void (d.activeBySpace[d.activeSpaceId] = null));
    expect(findStale(s, T0 + 13 * HOUR)).toEqual([id]);
  });

  it('plain text and word count', () => {
    expect(noteText('<h1>Hi &amp; bye</h1><p>one two<br>three</p>')).toBe('Hi & bye\none two\nthree');
    expect(wordCount('<p>one two</p><ul><li>three</li></ul>')).toBe(3);
    expect(wordCount('')).toBe(0);
  });

  it('exports Markdown', () => {
    const html =
      '<h1>Goals</h1><p>Be <strong>bold</strong>, <em>calm</em> and <a href="https://x.com">linked</a>. Use <code>npm</code>.</p>' +
      '<ul><li><p>one</p></li><li><p>two</p></li></ul><ol><li><p>first</p></li></ol>' +
      '<ul data-type="taskList"><li data-checked="true"><label><input type="checkbox" checked></label><div><p>done</p></div></li><li data-checked="false"><label><input type="checkbox"></label><div><p>todo</p></div></li></ul>' +
      '<blockquote><p>quoted</p></blockquote><pre><code>const a = 1 &lt; 2;</code></pre><hr>';
    expect(noteToMarkdown('Plan', html)).toBe(
      [
        '# Plan',
        '',
        '## Goals',
        '',
        'Be **bold**, *calm* and [linked](https://x.com). Use `npm`.',
        '',
        '- one',
        '- two',
        '',
        '1. first',
        '',
        '- [x] done',
        '- [ ] todo',
        '',
        '> quoted',
        '',
        '```',
        'const a = 1 < 2;',
        '```',
        '',
        '---',
        '',
      ].join('\n'),
    );
  });
});
