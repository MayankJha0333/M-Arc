import { nanoid } from 'nanoid';

/** Short, readable, unique ids like "tab_V1StGXR8". */
export function newId(prefix: string): string {
  return `${prefix}_${nanoid(10)}`;
}
