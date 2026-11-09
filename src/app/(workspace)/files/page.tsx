'use client';

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useWorkspaceStore } from '@/lib/store';
import { AnyWorkspaceItem } from '@/lib/types';
import {
  normalizeWorkspaceItems,
  matchesSearchQuery,
  compareItemTitles,
  compareItemDates,
} from '@/lib/itemNormalization';
import {
  FileText,
  Table,
  Presentation,
  FileCheck,
  FolderOpen,
  LayoutGrid,
  List as ListIcon,
  Search,
  ArrowUpDown,
  Star,
  Trash2,
  ExternalLink,
  Plus,
  Layers,
} from 'lucide-react';

function FilesLibraryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get('type') || 'all';

  const {
    documents,
    sheets,
    slides,
    pdfs,
    deleteDocument,
    toggleStar,
  } = useWorkspaceStore();

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterType, setFilterType] = useState<string>(typeParam);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'size'>('date');

  useEffect(() => {
    if (typeParam) {
      setFilterType(typeParam);
    }
  }, [typeParam]);

  const handleFilterChange = (newType: string) => {
    setFilterType(newType);
    if (newType === 'all') {
      router.replace('/files', { scroll: false });
    } else {
      router.replace(`/files?type=${newType}`, { scroll: false });
    }
  };

  // Aggregate all active files safely with full data-boundary normalization
  const allFiles = useMemo(() => {
    const rawList = [
      ...normalizeWorkspaceItems(documents, 'doc').filter((d) => !d.trashed),
      ...normalizeWorkspaceItems(sheets, 'sheet').filter((s) => !s.trashed),
      ...normalizeWorkspaceItems(slides, 'slide').filter((sl) => !sl.trashed),
      ...normalizeWorkspaceItems(pdfs, 'pdf').filter((p) => !p.trashed),
    ];

    return rawList
      .filter((item) => {
        const matchesType = filterType === 'all' || item.type === filterType;
        const matchesSearch = matchesSearchQuery(item, search);
        return matchesType && matchesSearch;
      })
      .sort((a, b) => {
        if (sortBy === 'title') return compareItemTitles(a, b);
        if (sortBy === 'size') return (b.size || '').localeCompare(a.size || '');
        return compareItemDates(a, b);
      });
  }, [documents, sheets, slides, pdfs, filterType, search, sortBy]);

  const getItemLink = (item: AnyWorkspaceItem) => {
    return `/workspace/${item.id}`;
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'doc':
        return <FileText className="h-4 w-4 text-[var(--primary)]" />;
      case 'sheet':
        return <Table className="h-4 w-4 text-[var(--secondary)]" />;
      case 'slide':
        return <Presentation className="h-4 w-4 text-amber-600" />;
      case 'pdf':
        return <FileCheck className="h-4 w-4 text-red-600" />;
      default:
        return <FileText className="h-4 w-4 text-[var(--primary)]" />;
    }
  };

  const getFormatTitle = () => {
    switch (filterType) {
      case 'doc':
        return 'Documents';
      case 'sheet':
        return 'Spreadsheets';
      case 'slide':
        return 'Presentations';
      default:
        return 'All Files';
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border)]">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">
            {getFormatTitle()}
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Browse, filter, and access your documents, financial sheets, and presentation slides.
          </p>
        </div>

        {/* View Switcher & Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'grid'
                  ? 'bg-[var(--accent)] text-[var(--primary)] font-semibold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'list'
                  ? 'bg-[var(--accent)] text-[var(--primary)] font-semibold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
              title="List View"
            >
              <ListIcon className="h-4 w-4" />
            </button>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--primary-hover)] transition-all shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Creation</span>
          </Link>
        </div>
      </div>

      {/* Filter Tabs & Search Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Format Selector Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => handleFilterChange('all')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filterType === 'all'
                ? 'bg-[var(--primary)] text-white shadow-2xs'
                : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>All Files</span>
          </button>
          <button
            onClick={() => handleFilterChange('doc')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filterType === 'doc'
                ? 'bg-[var(--primary)] text-white shadow-2xs'
                : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Documents</span>
          </button>
          <button
            onClick={() => handleFilterChange('sheet')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filterType === 'sheet'
                ? 'bg-[var(--primary)] text-white shadow-2xs'
                : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
            }`}
          >
            <Table className="h-3.5 w-3.5" />
            <span>Spreadsheets</span>
          </button>
          <button
            onClick={() => handleFilterChange('slide')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filterType === 'slide'
                ? 'bg-[var(--primary)] text-white shadow-2xs'
                : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
            }`}
          >
            <Presentation className="h-3.5 w-3.5" />
            <span>Presentations</span>
          </button>
        </div>

        {/* Search & Sort */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search by title or tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-8 pr-3 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--primary)] transition-colors"
            />
          </div>

          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-2.5 pr-7 py-1.5 text-xs font-medium text-[var(--text)] outline-none cursor-pointer focus:border-[var(--primary)]"
            >
              <option value="date">Latest Modified</option>
              <option value="title">Alphabetical (A-Z)</option>
              <option value="size">File Size</option>
            </select>
            <ArrowUpDown className="pointer-events-none absolute right-2 top-2.5 h-3 w-3 text-[var(--text-muted)]" />
          </div>
        </div>
      </div>

      {/* Files Display */}
      {allFiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] p-12 text-center bg-[var(--surface)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)] text-[var(--text-muted)] mb-3">
            <FolderOpen className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-semibold text-[var(--text)]">No files found</h3>
          <p className="text-xs text-[var(--text-muted)] max-w-sm mt-1">
            {search
              ? `No files matching "${search}" were found. Try another search query.`
              : `Your ${getFormatTitle().toLowerCase()} library is empty. Create your first item with AI!`}
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] text-white px-3.5 py-1.5 text-xs font-semibold hover:bg-[var(--primary-hover)] transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create with AI</span>
          </Link>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {allFiles.map((file) => (
            <div
              key={file.id}
              className="group relative flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--primary)] hover:shadow-xs transition-all"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)]">
                    {getIcon(file.type)}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => toggleStar(file.id)}
                      className={`p-1 rounded hover:bg-[var(--accent)] transition-colors ${
                        file.starred ? 'text-amber-500 fill-amber-500' : 'text-[var(--text-muted)]'
                      }`}
                      title={file.starred ? 'Starred' : 'Star file'}
                    >
                      <Star className={`h-3.5 w-3.5 ${file.starred ? 'fill-amber-500' : ''}`} />
                    </button>
                    <button
                      onClick={() => deleteDocument(file.id)}
                      className="p-1 rounded text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
                      title="Move to Trash"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <Link href={getItemLink(file)} className="block">
                  <h3 className="text-xs font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors line-clamp-1">
                    {file.title}
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1 line-clamp-2">
                    {file.description || file.initialPrompt || 'No additional description.'}
                  </p>
                </Link>
              </div>

              <div className="flex items-center justify-between pt-3 mt-3 border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)]">
                <span className="font-mono uppercase">{file.type}</span>
                <span>{new Date(file.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[var(--border)] bg-[var(--accent)]/50 text-[var(--text-muted)] font-medium">
              <tr>
                <th className="py-2.5 px-4">Name</th>
                <th className="py-2.5 px-4 hidden sm:table-cell">Format</th>
                <th className="py-2.5 px-4 hidden md:table-cell">Size</th>
                <th className="py-2.5 px-4">Last Modified</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text)]">
              {allFiles.map((file) => (
                <tr key={file.id} className="hover:bg-[var(--accent)]/30 transition-colors group">
                  <td className="py-3 px-4">
                    <Link
                      href={getItemLink(file)}
                      className="flex items-center gap-2.5 font-medium group-hover:text-[var(--primary)] transition-colors"
                    >
                      {getIcon(file.type)}
                      <span className="truncate max-w-[200px] sm:max-w-xs">{file.title}</span>
                    </Link>
                  </td>
                  <td className="py-3 px-4 hidden sm:table-cell text-[var(--text-muted)] font-mono uppercase text-[10px]">
                    {file.type}
                  </td>
                  <td className="py-3 px-4 hidden md:table-cell text-[var(--text-muted)] font-mono text-[11px]">
                    {file.size || '12 KB'}
                  </td>
                  <td className="py-3 px-4 text-[var(--text-muted)] text-[11px]">
                    {new Date(file.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => toggleStar(file.id)}
                        className={`p-1 rounded hover:bg-[var(--accent)] transition-colors ${
                          file.starred ? 'text-amber-500 fill-amber-500' : 'text-[var(--text-muted)]'
                        }`}
                        title={file.starred ? 'Starred' : 'Star file'}
                      >
                        <Star className={`h-3.5 w-3.5 ${file.starred ? 'fill-amber-500' : ''}`} />
                      </button>
                      <button
                        onClick={() => deleteDocument(file.id)}
                        className="p-1 rounded text-[var(--text-muted)] hover:text-rose-500 transition-colors"
                        title="Move to Trash"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <Link
                        href={getItemLink(file)}
                        className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
                        title="Open file"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AllFilesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 max-w-7xl mx-auto space-y-6 animate-pulse">
          <div className="h-8 w-48 bg-[var(--accent)] rounded-lg" />
          <div className="h-10 w-full bg-[var(--accent)] rounded-xl" />
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="h-32 bg-[var(--accent)] rounded-xl" />
            <div className="h-32 bg-[var(--accent)] rounded-xl" />
            <div className="h-32 bg-[var(--accent)] rounded-xl" />
            <div className="h-32 bg-[var(--accent)] rounded-xl" />
          </div>
        </div>
      }
    >
      <FilesLibraryContent />
    </Suspense>
  );
}
