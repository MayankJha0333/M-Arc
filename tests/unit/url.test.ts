import { describe, expect, it } from 'vitest';
import { displayUrl, hostMatches, hostOf, looksLikeUrl, normalizeInput, tidyTitle } from '@shared/url';

const DDG = 'https://duckduckgo.com/?q=%s';

describe('looksLikeUrl / normalizeInput', () => {
  it.each([
    ['example.com', 'https://example.com'],
    ['sub.example.co.uk/path?q=1', 'https://sub.example.co.uk/path?q=1'],
    ['https://a.io', 'https://a.io'],
    ['http://a.io', 'http://a.io'],
    ['localhost:3000', 'http://localhost:3000'],
    ['127.0.0.1:8080/x', 'http://127.0.0.1:8080/x'],
    ['192.168.1.4', 'http://192.168.1.4'],
    ['about:blank', 'about:blank'],
    ['kite://settings', 'kite://settings'],
  ])('treats %s as an address', (input, out) => {
    expect(looksLikeUrl(input)).toBe(true);
    expect(normalizeInput(input, DDG)).toBe(out);
  });

  it.each(['hello world', 'what is a kite', 'react', 'node.js tutorial', 'c++'])('treats "%s" as a search', (input) => {
    expect(normalizeInput(input, DDG)).toBe(`https://duckduckgo.com/?q=${encodeURIComponent(input)}`);
  });

  it('returns empty for blank input', () => {
    expect(normalizeInput('   ', DDG)).toBe('');
  });
});

describe('hosts', () => {
  it('drops www and lowercases', () => {
    expect(hostOf('https://WWW.Example.com/a')).toBe('example.com');
    expect(hostOf('not a url')).toBe('');
  });
  it('matches subdomains but not lookalikes', () => {
    expect(hostMatches('news.ycombinator.com', 'ycombinator.com')).toBe(true);
    expect(hostMatches('ycombinator.com', 'ycombinator.com')).toBe(true);
    expect(hostMatches('evilycombinator.com', 'ycombinator.com')).toBe(false);
    expect(hostMatches('www.github.com', '*.github.com')).toBe(true);
    expect(hostMatches('', 'a.com')).toBe(false);
  });
  it('displays short urls', () => {
    expect(displayUrl('https://www.github.com/')).toBe('github.com');
    expect(displayUrl('https://github.com/a/b?x=1')).toBe('github.com/a/b?x=1');
  });
});

describe('tidyTitle', () => {
  it.each([
    ['Inbox (3) - you@gmail.com - Gmail', 'https://mail.google.com', 'Inbox (3)'],
    ['torvalds/linux: Linux kernel source tree · GitHub', 'https://github.com/torvalds/linux', 'torvalds/linux: Linux kernel source tree'],
    ['Hacker News', 'https://news.ycombinator.com', 'Hacker News'],
    ['YouTube', 'https://youtube.com', 'YouTube'],
    ['Home | Notion', 'https://notion.so', 'Home'],
  ])('%s → %s', (title, url, out) => {
    expect(tidyTitle(title, url)).toBe(out);
  });
});
