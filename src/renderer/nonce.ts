// A secret for this app run. Kite's in-page helper includes it in its messages,
// so a web page can't fake them.
import { makeNonce } from '@shared/links';

export const NONCE = makeNonce();
