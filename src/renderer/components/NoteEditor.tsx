import type { NoteItem } from '@shared/types';

export function NoteEditor({ note }: { note: NoteItem }) {
  return <div className="note" data-testid={`note-${note.id}`} />;
}
