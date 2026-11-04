import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { decideLinkClick, linkCatcherScript, parseLinkMessage, LINK_MARKER, type ClickInfo, type LinkPolicy } from '@shared/links';

const base: LinkPolicy = { pinnedHost: null, peekOnExternal: true, peekOnShift: true, isPeek: false, isMac: true };
const click = (href: string, o: Partial<ClickInfo> = {}): ClickInfo => ({ href, pageUrl: 'https://mail.example.com/inbox', shift: false, meta: false, ctrl: false, alt: false, button: 0, targetBlank: false, ...o });

describe('decideLinkClick', () => {
  it('normal tabs: plain clicks behave normally', () => {
    expect(decideLinkClick(base, click('https://other.com'))).toBe('default');
  });

  it('pinned tabs: links to other sites open in Peek, same site stays', () => {
    const p = { ...base, pinnedHost: 'mail.example.com' };
    expect(decideLinkClick(p, click('https://news.site/a'))).toBe('peek');
    expect(decideLinkClick(p, click('/thread/1'))).toBe('default');
    expect(decideLinkClick(p, click('https://docs.example.com/x'))).toBe('default'); // same site, other subdomain
    expect(decideLinkClick(p, click('https://www.mail.example.com/'))).toBe('default');
  });

  it('pinned Peek can be turned off', () => {
    expect(decideLinkClick({ ...base, pinnedHost: 'mail.example.com', peekOnExternal: false }, click('https://news.site'))).toBe('default');
  });

  it('shift-click peeks anywhere (if enabled)', () => {
    expect(decideLinkClick(base, click('https://x.com', { shift: true }))).toBe('peek');
    expect(decideLinkClick({ ...base, peekOnShift: false }, click('https://x.com', { shift: true }))).toBe('default');
  });

  it('⌥⌘-click opens a little window (⌥Ctrl on Windows/Linux)', () => {
    expect(decideLinkClick(base, click('https://x.com', { alt: true, meta: true }))).toBe('little');
    expect(decideLinkClick({ ...base, isMac: false }, click('https://x.com', { alt: true, ctrl: true }))).toBe('little');
    expect(decideLinkClick(base, click('https://x.com', { alt: true, ctrl: true }))).toBe('default');
  });

  it('⌘-click and middle-click are left to the browser (new tab)', () => {
    const p = { ...base, pinnedHost: 'mail.example.com' };
    expect(decideLinkClick(p, click('https://news.site', { meta: true }))).toBe('default');
    expect(decideLinkClick(p, click('https://news.site', { button: 1 }))).toBe('default');
  });

  it('inside Peek, links just navigate', () => {
    const p = { ...base, pinnedHost: 'mail.example.com', isPeek: true };
    expect(decideLinkClick(p, click('https://news.site'))).toBe('default');
    expect(decideLinkClick(p, click('https://news.site', { shift: true }))).toBe('default');
  });

  it('ignores javascript:, mailto: and broken links', () => {
    const p = { ...base, pinnedHost: 'mail.example.com' };
    expect(decideLinkClick(p, click('javascript:void(0)'))).toBe('default');
    expect(decideLinkClick(p, click('mailto:a@b.c'))).toBe('default');
    expect(decideLinkClick(p, click('http://[bad'))).toBe('default');
  });
});

describe('injected link catcher', () => {
  function page(policy: LinkPolicy) {
    const dom = new JSDOM(`<a id="ext" href="https://news.site/a">x</a><a id="in" href="/b">y</a>`, { url: 'https://mail.example.com/', runScripts: 'outside-only' });
    const msgs: string[] = [];
    dom.window.console.debug = (m: string) => msgs.push(m);
    dom.window.eval(linkCatcherScript(policy, 'n1'));
    return { dom, msgs };
  }

  it('reports a Peek for pinned external links and blocks the navigation', () => {
    const { dom, msgs } = page({ ...base, pinnedHost: 'mail.example.com' });
    const ev = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    dom.window.document.getElementById('ext')!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(parseLinkMessage(msgs[0], 'n1')).toEqual({ decision: 'peek', url: 'https://news.site/a' });
  });

  it('leaves same-site links alone', () => {
    const { dom, msgs } = page({ ...base, pinnedHost: 'mail.example.com' });
    const ev = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    dom.window.document.getElementById('in')!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(msgs).toEqual([]);
  });

  it('can be re-run to update the policy without adding a second listener', () => {
    const { dom, msgs } = page({ ...base, pinnedHost: 'mail.example.com' });
    dom.window.eval(linkCatcherScript({ ...base, pinnedHost: null }, 'n1'));
    const ev = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, shiftKey: true });
    dom.window.document.getElementById('ext')!.dispatchEvent(ev);
    expect(msgs).toHaveLength(1);
  });

  it('message parsing rejects junk', () => {
    expect(parseLinkMessage('hello', 'n1')).toBeNull();
    expect(parseLinkMessage(`${LINK_MARKER}n1{bad`, 'n1')).toBeNull();
    expect(parseLinkMessage(`${LINK_MARKER}n1{"decision":"evil","url":"https://x.com"}`, 'n1')).toBeNull();
  });

  it('a page cannot fake Kite’s messages without the secret token', () => {
    const fake = `${LINK_MARKER}{"decision":"little","url":"https://x.com"}`;
    expect(parseLinkMessage(fake, 'n1')).toBeNull();
    expect(parseLinkMessage(`${LINK_MARKER}guess{"decision":"little","url":"https://x.com"}`, 'n1')).toBeNull();
    expect(parseLinkMessage(fake, '')).toBeNull();
  });

  it('only web links are accepted, never file:, data: or javascript:', () => {
    for (const url of ['file:///etc/passwd', 'data:text/html,hi', 'javascript:alert(1)', 'kite://settings']) {
      expect(parseLinkMessage(`${LINK_MARKER}n1${JSON.stringify({ decision: 'little', url })}`, 'n1')).toBeNull();
    }
  });
});
