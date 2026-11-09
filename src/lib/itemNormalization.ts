/**
 * DOCIUM Workspace Item Normalization & Safe Data Boundary Utilities
 * 
 * Guarantees that all workspace items (documents, spreadsheets, presentations, PDFs)
 * from local storage, database records, imported files, or AI generation have:
 * 1. Valid, non-empty stable IDs.
 * 2. Safe string titles with graceful fallbacks (e.g. filename, type name, or "Untitled").
 * 3. Validated string arrays for tags.
 * 4. Safe item types and date representations.
 * 5. Crash-proof case-insensitive search and sorting.
 */

import { AnyWorkspaceItem, DocumentType } from './types';

export interface NormalizedItemFields {
  id: string;
  title: string;
  type: DocumentType;
  tags: string[];
  starred: boolean;
  trashed: boolean;
  createdAt: string;
  updatedAt: string;
  size: string;
  description?: string;
  initialPrompt?: string;
}

/**
 * Normalizes any raw workspace record into a safe, guaranteed structure.
 * Never mutates the original object.
 */
export function normalizeWorkspaceItem<T extends object>(
  raw: T,
  fallbackType: DocumentType = 'doc'
): T & NormalizedItemFields {
  if (!raw || typeof raw !== 'object') {
    const now = new Date().toISOString();
    return {
      id: `${fallbackType}-${Date.now()}`,
      title: `Untitled ${fallbackType.toUpperCase()}`,
      type: fallbackType,
      tags: [],
      starred: false,
      trashed: false,
      createdAt: now,
      updatedAt: now,
      size: '12 KB',
    } as unknown as T & NormalizedItemFields;
  }

  const rawRecord = raw as Record<string, unknown>;

  // Determine type safely
  const rawType = typeof rawRecord.type === 'string' ? rawRecord.type.toLowerCase() : '';
  const validTypes: DocumentType[] = ['doc', 'sheet', 'slide', 'pdf', 'project'];
  const type: DocumentType = validTypes.includes(rawType as DocumentType)
    ? (rawType as DocumentType)
    : fallbackType;

  // Resolve title safely with robust fallback chain
  let title = '';
  if (typeof rawRecord.title === 'string' && rawRecord.title.trim().length > 0) {
    title = rawRecord.title.trim();
  } else if (typeof rawRecord.name === 'string' && rawRecord.name.trim().length > 0) {
    title = rawRecord.name.trim();
  } else if (typeof rawRecord.filename === 'string' && rawRecord.filename.trim().length > 0) {
    title = rawRecord.filename.trim();
  } else if (typeof rawRecord.originalName === 'string' && rawRecord.originalName.trim().length > 0) {
    title = rawRecord.originalName.trim();
  } else {
    const typeLabel =
      type === 'doc'
        ? 'Document'
        : type === 'sheet'
        ? 'Spreadsheet'
        : type === 'slide'
        ? 'Presentation'
        : type === 'pdf'
        ? 'PDF'
        : 'Project';
    title = `Untitled ${typeLabel}`;
  }

  // Normalize ID safely
  const id = typeof rawRecord.id === 'string' && rawRecord.id.trim().length > 0
    ? rawRecord.id.trim()
    : `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Normalize tags to an array of non-empty strings
  let tags: string[] = [];
  if (Array.isArray(rawRecord.tags)) {
    tags = (rawRecord.tags as unknown[])
      .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      .map((t) => t.trim());
  }

  // Safe dates
  const now = new Date().toISOString();
  let createdAt = now;
  if (typeof rawRecord.createdAt === 'string' && !isNaN(new Date(rawRecord.createdAt).getTime())) {
    createdAt = rawRecord.createdAt;
  }

  let updatedAt = createdAt;
  if (typeof rawRecord.updatedAt === 'string' && !isNaN(new Date(rawRecord.updatedAt).getTime())) {
    updatedAt = rawRecord.updatedAt;
  }

  // Safe boolean flags
  const starred = Boolean(rawRecord.starred);
  const trashed = Boolean(rawRecord.trashed);

  // Safe size string
  const size = typeof rawRecord.size === 'string' && rawRecord.size.trim().length > 0
    ? rawRecord.size.trim()
    : '12 KB';

  return {
    ...raw,
    id,
    title,
    type,
    tags,
    starred,
    trashed,
    createdAt,
    updatedAt,
    size,
  };
}

/**
 * Normalizes an array of workspace items, filtering out null/undefined entries safely.
 */
export function normalizeWorkspaceItems<T extends object>(
  items: T[] | null | undefined,
  fallbackType: DocumentType = 'doc'
): Array<T & NormalizedItemFields> {
  if (!Array.isArray(items)) return [];
  return items.map((item) => normalizeWorkspaceItem(item, fallbackType));
}

/**
 * Case-insensitive, null-safe search matcher for workspace items.
 * Checks both title and tags.
 */
export function matchesSearchQuery(
  item: { title?: string; tags?: string[] | null },
  searchQuery: string
): boolean {
  if (!searchQuery || !searchQuery.trim()) return true;
  const q = searchQuery.toLowerCase().trim();

  // Check title
  const title = (item?.title || '').toLowerCase();
  if (title.includes(q)) return true;

  // Check tags
  if (Array.isArray(item?.tags)) {
    for (const tag of item.tags) {
      if (typeof tag === 'string' && tag.toLowerCase().includes(q)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Safe alphabetical title sorting comparator.
 */
export function compareItemTitles(
  a: { title?: string },
  b: { title?: string }
): number {
  const titleA = a?.title || '';
  const titleB = b?.title || '';
  return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Safe date sorting comparator (most recent first).
 */
export function compareItemDates(
  a: { updatedAt?: string },
  b: { updatedAt?: string }
): number {
  const timeA = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
  const timeB = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
  return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
}
