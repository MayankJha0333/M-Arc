import { createRoot } from 'react-dom/client';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/500.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/700.css';
import '@fontsource/bricolage-grotesque/500.css';
import '@fontsource/bricolage-grotesque/700.css';
import './styles/app.css';
import { App } from './App';
import { LittleApp } from './LittleApp';
import { PipFrameApp } from './PipFrameApp';
import { mode } from './platform';

createRoot(document.getElementById('root')!).render(mode === 'little' ? <LittleApp /> : mode === 'pip' ? <PipFrameApp /> : <App />);
