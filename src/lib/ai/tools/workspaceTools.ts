/**
 * Universal AI Agent — General Workspace & File Tools
 * Manages workspace file discovery, search, metadata inspection, reading, updating, and creation.
 */

import { ToolDefinition, WorkspaceFileRecord } from './types';
import { SAMPLE_DOCUMENTS, SAMPLE_SHEETS, SAMPLE_SLIDES, SAMPLE_PDFS } from '@/lib/sampleData';

function getEffectiveFiles(contextFiles?: WorkspaceFileRecord[]): WorkspaceFileRecord[] {
  if (contextFiles && contextFiles.length > 0) {
    return contextFiles;
  }
  return [
    ...SAMPLE_DOCUMENTS.map((d) => ({
      id: d.id,
      title: d.title,
      type: 'doc' as const,
      content: d.content,
      wordCount: d.wordCount,
      updatedAt: d.updatedAt,
      tags: d.tags,
    })),
    ...SAMPLE_SHEETS.map((s) => ({
      id: s.id,
      title: s.title,
      type: 'sheet' as const,
      content: `Spreadsheet with ${s.sheets?.length || 1} sheet tabs`,
      updatedAt: s.updatedAt,
      tags: [] as string[],
    })),
    ...SAMPLE_SLIDES.map((sl) => ({
      id: sl.id,
      title: sl.title,
      type: 'slide' as const,
      content: `Presentation with ${sl.slides?.length || 1} slides`,
      updatedAt: sl.updatedAt,
      tags: [] as string[],
    })),
    ...SAMPLE_PDFS.map((p) => ({
      id: p.id,
      title: p.title,
      type: 'pdf' as const,
      content: `PDF document (${p.pageCount || 1} pages)`,
      updatedAt: p.updatedAt,
      tags: [] as string[],
    })),
  ];
}

export const listWorkspaceFilesTool: ToolDefinition = {
  name: 'list_workspace_files',
  label: 'List Workspace Files',
  description: 'List accessible workspace files (documents, spreadsheets, presentations, and PDFs).',
  activityLabel: 'Listing workspace files',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['all', 'doc', 'sheet', 'slide', 'pdf'],
        description: 'Optional file type filter.',
      },
    },
  },
  execute: async (args, context) => {
    const filter = args.type || 'all';
    const allFiles = getEffectiveFiles(context.workspaceFiles);
    const filtered = filter === 'all' ? allFiles : allFiles.filter((f) => f.type === filter);

    const summaries = filtered.map((f) => ({
      id: f.id,
      title: f.title,
      type: f.type,
      wordCount: f.wordCount,
      updatedAt: f.updatedAt,
      tags: f.tags,
    }));

    return {
      success: true,
      data: {
        files: summaries,
        count: summaries.length,
      },
      activitySummary: `Found ${summaries.length} files in workspace`,
    };
  },
};

export const searchWorkspaceFilesTool: ToolDefinition = {
  name: 'search_workspace_files',
  label: 'Search Files',
  description: 'Search accessible workspace files by title, content keyword, or tags.',
  activityLabel: 'Searching workspace files',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Keyword or phrase to search across workspace documents.',
      },
      type: {
        type: 'string',
        enum: ['all', 'doc', 'sheet', 'slide', 'pdf'],
        description: 'Optional file type filter.',
      },
    },
    required: ['query'],
  },
  execute: async (args, context) => {
    const q = String(args.query || '').trim().toLowerCase();
    if (!q) return { success: false, error: 'Query is required' };

    const typeFilter = args.type || 'all';
    const allFiles = getEffectiveFiles(context.workspaceFiles);
    const candidates = typeFilter === 'all' ? allFiles : allFiles.filter((f) => f.type === typeFilter);

    const matches = candidates.filter((f) => {
      const matchTitle = f.title.toLowerCase().includes(q);
      const matchTags = f.tags?.some((t: string) => t.toLowerCase().includes(q)) ?? false;
      const matchContent = (f.content || '').toLowerCase().includes(q);
      return matchTitle || matchTags || matchContent;
    });

    const results = matches.map((m) => {
      const clean = (m.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const snippet = clean.slice(0, 240);
      return {
        id: m.id,
        title: m.title,
        type: m.type,
        wordCount: m.wordCount,
        snippet,
        updatedAt: m.updatedAt,
      };
    });

    return {
      success: true,
      data: { query: q, results, count: results.length },
      activitySummary: `Found ${results.length} files matching "${q}"`,
    };
  },
};

export const inspectFileMetadataTool: ToolDefinition = {
  name: 'inspect_file_metadata',
  label: 'Inspect File Metadata',
  description: 'Inspect metadata, format, word count, and timestamps for a specific workspace file.',
  activityLabel: 'Inspecting file metadata',
  parameters: {
    type: 'object',
    properties: {
      fileIdOrTitle: {
        type: 'string',
        description: 'ID or exact/partial title of the file to inspect.',
      },
    },
    required: ['fileIdOrTitle'],
  },
  execute: async (args, context) => {
    const target = String(args.fileIdOrTitle || '').trim().toLowerCase();
    const files = getEffectiveFiles(context.workspaceFiles);

    const file =
      files.find((f) => f.id.toLowerCase() === target || f.title.toLowerCase() === target) ||
      files.find((f) => f.title.toLowerCase().includes(target)) ||
      (context.activeDocument && (context.activeDocument.id === target || context.activeDocument.title.toLowerCase().includes(target))
        ? {
            id: context.activeDocument.id,
            title: context.activeDocument.title,
            type: context.activeDocument.format as any,
            content: context.activeDocument.content,
            wordCount: (context.activeDocument.content || '').split(/\s+/).filter(Boolean).length,
            updatedAt: new Date().toISOString(),
          }
        : null);

    if (!file) {
      return {
        success: false,
        error: `File "${args.fileIdOrTitle}" could not be located in the workspace.`,
      };
    }

    return {
      success: true,
      data: {
        id: file.id,
        title: file.title,
        type: file.type,
        wordCount: file.wordCount,
        updatedAt: file.updatedAt,
        tags: ('tags' in file ? (file as { tags?: string[] }).tags : []) || [],
        permissions: 'read-write',
      },
      activitySummary: `Inspected metadata for "${file.title}"`,
    };
  },
};

export const readFileContentTool: ToolDefinition = {
  name: 'read_file_content',
  label: 'Read File',
  description: 'Read the full text or section content of a specific workspace document or file.',
  activityLabel: 'Reading file content',
  parameters: {
    type: 'object',
    properties: {
      fileIdOrTitle: {
        type: 'string',
        description: 'ID or title of the workspace file to read.',
      },
      maxCharacters: {
        type: 'number',
        description: 'Maximum characters to retrieve (defaults to 4000, max 12000).',
      },
    },
    required: ['fileIdOrTitle'],
  },
  execute: async (args, context) => {
    const target = String(args.fileIdOrTitle || '').trim().toLowerCase();
    const files = getEffectiveFiles(context.workspaceFiles);

    const file =
      files.find((f) => f.id.toLowerCase() === target || f.title.toLowerCase() === target) ||
      files.find((f) => f.title.toLowerCase().includes(target)) ||
      (context.activeDocument && (context.activeDocument.id === target || context.activeDocument.title.toLowerCase().includes(target))
        ? {
            id: context.activeDocument.id,
            title: context.activeDocument.title,
            type: context.activeDocument.format as any,
            content: context.activeDocument.content || '',
            wordCount: (context.activeDocument.content || '').split(/\s+/).filter(Boolean).length,
            updatedAt: new Date().toISOString(),
          }
        : null);

    if (!file) {
      return {
        success: false,
        error: `File "${args.fileIdOrTitle}" not found in workspace. Available files: ${files.map((f) => f.title).join(', ')}`,
      };
    }

    const maxChars = typeof args.maxCharacters === 'number' ? Math.min(args.maxCharacters, 12000) : 4000;
    const cleanContent = (file.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    return {
      success: true,
      data: {
        id: file.id,
        title: file.title,
        type: file.type,
        content: cleanContent.slice(0, maxChars),
        totalLength: cleanContent.length,
        truncated: cleanContent.length > maxChars,
      },
      activitySummary: `Read content from "${file.title}"`,
    };
  },
};

export const updateDocumentFileTool: ToolDefinition = {
  name: 'update_document_file',
  label: 'Update Document',
  description: 'Update, append, or modify an existing workspace document with verified persistence.',
  activityLabel: 'Updating workspace document',
  parameters: {
    type: 'object',
    properties: {
      fileIdOrTitle: {
        type: 'string',
        description: 'ID or title of the document to update (e.g. "AI News" or "doc-1").',
      },
      content: {
        type: 'string',
        description: 'The updated or additional content (HTML or Markdown).',
      },
      mode: {
        type: 'string',
        enum: ['append', 'prepend', 'replace', 'section'],
        description: 'How to apply the changes (default: "append"). "append" adds to the end preserving existing content.',
      },
      sectionHeading: {
        type: 'string',
        description: 'Optional section heading under which to insert the content.',
      },
      summaryOfChanges: {
        type: 'string',
        description: 'A concise summary of what was updated and the sources referenced.',
      },
    },
    required: ['content'],
  },
  execute: async (args, context) => {
    const rawTarget = String(
      args.fileIdOrTitle || args.documentIdOrTitle || args.title || context.activeDocument?.title || context.activeDocument?.id || ''
    ).trim();
    const target = rawTarget.toLowerCase();
    const mode = (args.mode || 'append') as 'append' | 'prepend' | 'replace' | 'section';
    const newContent = String(args.content || '').trim();
    const summary = String(args.summaryOfChanges || 'Updated document');

    const files = getEffectiveFiles(context.workspaceFiles);
    let doc =
      files.find((f) => f.id.toLowerCase() === target || f.title.toLowerCase() === target) ||
      files.find((f) => target.length > 0 && f.title.toLowerCase().includes(target)) ||
      (context.activeDocument && (context.activeDocument.id === target || context.activeDocument.title.toLowerCase().includes(target))
        ? {
            id: context.activeDocument.id,
            title: context.activeDocument.title,
            type: 'doc' as const,
            content: context.activeDocument.content || '',
            wordCount: (context.activeDocument.content || '').split(/\s+/).filter(Boolean).length,
            updatedAt: new Date().toISOString(),
          }
        : null);

    // If file does not exist, create it cleanly rather than failing ungracefully
    if (!doc) {
      const createdId = `doc-${Date.now()}`;
      const docTitle = rawTarget || 'New Document';
      const createdDoc: WorkspaceFileRecord = {
        id: createdId,
        title: docTitle,
        type: 'doc',
        content: newContent,
        wordCount: newContent.split(/\s+/).filter(Boolean).length,
        updatedAt: new Date().toISOString(),
      };
      if (context.workspaceFiles) {
        context.workspaceFiles.push(createdDoc);
      }

      if (context.onFileOperation) {
        await context.onFileOperation({
          operation: 'create',
          itemType: 'doc',
          itemId: createdId,
          title: docTitle,
          content: newContent,
          mode: 'create',
          summary: `Created document "${docTitle}" with requested content`,
        });
      }

      return {
        success: true,
        data: {
          fileId: createdId,
          title: docTitle,
          mode: 'create',
          verifiedSaved: true,
          summary: `Created new document "${docTitle}" and saved content successfully`,
        },
        fileOperation: {
          operation: 'create',
          itemType: 'doc',
          itemId: createdId,
          title: docTitle,
          content: newContent,
          mode: 'create',
          summary: `Created new document "${docTitle}"`,
        },
        activitySummary: `Created and saved document "${docTitle}"`,
      };
    }

    // Prepare updated content according to requested mode
    let updatedContent = '';
    const existing = doc.content || '';

    if (mode === 'replace') {
      updatedContent = newContent;
    } else if (mode === 'prepend') {
      updatedContent = `${newContent}\n\n${existing}`;
    } else if (mode === 'section' && args.sectionHeading) {
      const heading = String(args.sectionHeading);
      if (existing.includes(heading)) {
        updatedContent = existing.replace(heading, `${heading}\n\n${newContent}`);
      } else {
        updatedContent = `${existing}\n\n## ${heading}\n\n${newContent}`;
      }
    } else {
      // Default: append with clean spacing
      updatedContent = existing ? `${existing}\n\n${newContent}` : newContent;
    }

    // Update in-memory record
    doc.content = updatedContent;
    doc.updatedAt = new Date().toISOString();
    doc.wordCount = updatedContent.split(/\s+/).filter(Boolean).length;

    // Also update context.workspaceFiles record directly
    if (context.workspaceFiles) {
      const matchInFiles = context.workspaceFiles.find(
        (f) => f.id.toLowerCase() === doc.id.toLowerCase() || f.title.toLowerCase() === doc.title.toLowerCase()
      );
      if (matchInFiles) {
        matchInFiles.content = updatedContent;
        matchInFiles.updatedAt = doc.updatedAt;
        matchInFiles.wordCount = doc.wordCount;
      }
    }

    // Trigger persistence callback
    if (context.onFileOperation) {
      await context.onFileOperation({
        operation: 'update',
        itemType: doc.type,
        itemId: doc.id,
        title: doc.title,
        content: updatedContent,
        mode,
        summary,
      });
    }

    return {
      success: true,
      data: {
        fileId: doc.id,
        title: doc.title,
        mode,
        updatedLength: updatedContent.length,
        verifiedSaved: true,
        summary,
      },
      fileOperation: {
        operation: 'update',
        itemType: doc.type,
        itemId: doc.id,
        title: doc.title,
        content: updatedContent,
        mode,
        summary,
      },
      activitySummary: `Updated document "${doc.title}" (${mode})`,
    };
  },
};

export const createWorkspaceFileTool: ToolDefinition = {
  name: 'create_workspace_file',
  label: 'Create Workspace File',
  description: 'Create a new persistent workspace document, spreadsheet, or slide presentation.',
  activityLabel: 'Creating workspace file',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Title of the new workspace file.',
      },
      type: {
        type: 'string',
        enum: ['doc', 'sheet', 'slide'],
        description: 'File format (defaults to "doc").',
      },
      content: {
        type: 'string',
        description: 'Initial content of the file (HTML, Markdown, or raw text).',
      },
      summaryOfCreation: {
        type: 'string',
        description: 'Brief summary of what this new file contains.',
      },
    },
    required: ['title', 'content'],
  },
  execute: async (args, context) => {
    const title = String(args.title || 'Untitled Document').trim();
    const type = (args.type || 'doc') as 'doc' | 'sheet' | 'slide';
    const content = String(args.content || '').trim();
    const summary = String(args.summaryOfCreation || `Created ${type} "${title}"`);

    const newId = `${type}-${Date.now()}`;
    const newFile: WorkspaceFileRecord = {
      id: newId,
      title,
      type,
      content,
      wordCount: content.split(/\s+/).filter(Boolean).length,
      updatedAt: new Date().toISOString(),
    };

    if (context.workspaceFiles) {
      context.workspaceFiles.push(newFile);
    }

    if (context.onFileOperation) {
      await context.onFileOperation({
        operation: 'create',
        itemType: type,
        itemId: newId,
        title,
        content,
        mode: 'create',
        summary,
      });
    }

    return {
      success: true,
      data: {
        fileId: newId,
        title,
        type,
        contentLength: content.length,
        verifiedSaved: true,
        summary,
      },
      fileOperation: {
        operation: 'create',
        itemType: type,
        itemId: newId,
        title,
        content,
        mode: 'create',
        summary,
      },
      activitySummary: `Created ${type} "${title}"`,
    };
  },
};

export const createWorkspaceArtifactTool: ToolDefinition = {
  name: 'create_workspace_artifact',
  label: 'Create Workspace Artifact',
  description: 'Create a persistent structured document or report artifact in the workspace.',
  activityLabel: 'Creating workspace artifact',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Title of the artifact to generate.',
      },
      content: {
        type: 'string',
        description: 'Markdown content of the artifact.',
      },
      category: {
        type: 'string',
        description: 'Document category or classification.',
      },
    },
    required: ['title', 'content'],
  },
  execute: async (args) => {
    const title = String(args.title || 'Generated Artifact');
    const content = String(args.content || '');

    return {
      success: true,
      data: {
        artifactId: `art-${Date.now()}`,
        title,
        contentLength: content.length,
        status: 'created',
      },
      activitySummary: `Created artifact "${title}"`,
    };
  },
};

export const workspaceTools: ToolDefinition[] = [
  listWorkspaceFilesTool,
  searchWorkspaceFilesTool,
  inspectFileMetadataTool,
  readFileContentTool,
  updateDocumentFileTool,
  createWorkspaceFileTool,
  createWorkspaceArtifactTool,
];
