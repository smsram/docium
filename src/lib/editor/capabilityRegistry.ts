/**
 * DOCIUM Document Editor Capability Registry
 * 
 * Authoritative registry of all genuinely supported editor actions, commands,
 * formatting options, layout parameters, and ProseMirror extensions.
 * Exposes a structured capability catalog to the shared AI Agent.
 */

export interface DocumentCapability {
  id: string;
  category:
    | 'content_creation_editing'
    | 'text_formatting'
    | 'structured_content'
    | 'page_and_layout'
    | 'document_organization'
    | 'search_and_navigation';
  name: string;
  description: string;
  editorCommand: string;
  parameters?: Record<string, { type: string; description: string; required?: boolean; enum?: string[] }>;
}

export const SUPPORTED_FONT_FAMILIES = [
  'Inter, sans-serif',
  'Geist, sans-serif',
  'Georgia, serif',
  'Merriweather, Georgia, serif',
  '"Playfair Display", Georgia, serif',
  '"JetBrains Mono", monospace',
  'Arial, Helvetica, sans-serif',
  '"Times New Roman", Times, serif',
] as const;

export const SUPPORTED_FONT_SIZES = [
  '8pt', '9pt', '10pt', '11pt', '12pt', '13pt', '14pt', '16pt',
  '18pt', '20pt', '24pt', '28pt', '32pt', '36pt', '48pt', '72pt',
] as const;

export const SUPPORTED_PAGE_SIZES = ['A4', 'Letter', 'Legal'] as const;
export const SUPPORTED_ORIENTATIONS = ['portrait', 'landscape'] as const;
export const SUPPORTED_MARGIN_PRESETS = ['normal', 'narrow', 'wide', 'custom'] as const;
export const SUPPORTED_CALLOUT_TYPES = ['info', 'tip', 'warning', 'danger', 'note'] as const;
export const SUPPORTED_SHAPE_TYPES = [
  'rectangle', 'rounded-rectangle', 'circle', 'diamond', 'star', 'arrow-right', 'triangle'
] as const;

export const DOCUMENT_CAPABILITIES: DocumentCapability[] = [
  // 1. CONTENT CREATION AND EDITING
  {
    id: 'insert_structured_document',
    category: 'content_creation_editing',
    name: 'Insert Structured Document',
    description: 'Insert comprehensive Markdown/HTML with headings, paragraphs, lists, and tables into the document at cursor, start, end, or replacing selection.',
    editorCommand: 'editor.chain().insertContent(htmlContent)',
    parameters: {
      content: { type: 'string', description: 'Structured Markdown content to insert', required: true },
      position: { type: 'string', description: 'Where to insert: "cursor", "start", "end", or "replace_selection"', enum: ['cursor', 'start', 'end', 'replace_selection'] },
    },
  },
  {
    id: 'insert_text_at_cursor',
    category: 'content_creation_editing',
    name: 'Insert Text at Cursor',
    description: 'Insert text or inline markdown at the current cursor position.',
    editorCommand: 'editor.chain().insertContent(htmlContent)',
    parameters: {
      text: { type: 'string', description: 'Text to insert', required: true },
    },
  },
  {
    id: 'append_or_insert_paragraph',
    category: 'content_creation_editing',
    name: 'Append or Insert Paragraph',
    description: 'Append a paragraph to the end, start, cursor, or immediately after a specific heading.',
    editorCommand: 'editor.chain().insertContent(pText) or insertContentAt(pos, pText)',
    parameters: {
      text: { type: 'string', description: 'Paragraph text to insert', required: true },
      position: { type: 'string', description: 'Target position', enum: ['start', 'end', 'cursor'] },
      afterHeading: { type: 'string', description: 'Heading title after which the paragraph should be placed' },
    },
  },
  {
    id: 'prepend_to_document',
    category: 'content_creation_editing',
    name: 'Prepend to Document',
    description: 'Insert content at the very beginning of the document (before existing content).',
    editorCommand: 'editor.chain().focus("start").insertContent(content)',
    parameters: {
      content: { type: 'string', description: 'Content to prepend at the top', required: true },
    },
  },
  {
    id: 'replace_selected_text',
    category: 'content_creation_editing',
    name: 'Replace Selected Text',
    description: 'Replace currently selected text in the editor with new text or markdown.',
    editorCommand: 'editor.chain().deleteSelection().insertContent(text)',
    parameters: {
      text: { type: 'string', description: 'Replacement content', required: true },
    },
  },
  {
    id: 'delete_selected_content',
    category: 'content_creation_editing',
    name: 'Delete Selected Content',
    description: 'Delete whatever content is currently selected in the document.',
    editorCommand: 'editor.chain().deleteSelection()',
  },
  {
    id: 'duplicate_content',
    category: 'content_creation_editing',
    name: 'Duplicate Content',
    description: 'Duplicate the selected text or paragraph immediately below its current position.',
    editorCommand: 'editor.chain().insertContentAt(endPos, selectedContent)',
    parameters: {
      target: { type: 'string', description: '"selection" or heading title to duplicate', enum: ['selection', 'heading'] },
      headingTitle: { type: 'string', description: 'Heading title if duplicating a specific section' },
    },
  },
  {
    id: 'move_document_section',
    category: 'document_organization',
    name: 'Move Section',
    description: 'Relocate an entire section (heading and its body text) to before or after another heading, or to start/end.',
    editorCommand: 'ProseMirror slice and move transaction',
    parameters: {
      sourceHeading: { type: 'string', description: 'The title of the heading/section to move', required: true },
      destinationHeading: { type: 'string', description: 'The title of the reference destination heading' },
      position: { type: 'string', description: 'Position relative to destination: "before", "after", "start", or "end"', enum: ['before', 'after', 'start', 'end'], required: true },
    },
  },
  {
    id: 'create_document_list',
    category: 'content_creation_editing',
    name: 'Create Document List',
    description: 'Insert a formatted bulleted list, numbered list, or interactive task checklist.',
    editorCommand: 'editor.chain().insertContent(listHtml)',
    parameters: {
      items: { type: 'array', description: 'List items strings', required: true },
      listType: { type: 'string', description: 'List type: "bullet", "ordered", or "task"', enum: ['bullet', 'ordered', 'task'], required: true },
    },
  },

  // 2. TEXT FORMATTING
  {
    id: 'format_document_text',
    category: 'text_formatting',
    name: 'Format Text',
    description: 'Apply bold, italic, underline, strikethrough, subscript, superscript, inline code, font color, highlight, or clear formatting to selection or target text.',
    editorCommand: 'editor.chain().toggleBold() / toggleItalic() / setColor() / etc.',
    parameters: {
      formatting: { type: 'string', description: 'Formatting mark', enum: ['bold', 'italic', 'underline', 'strike', 'subscript', 'superscript', 'code', 'color', 'highlight', 'clear'], required: true },
      value: { type: 'string', description: 'Color hex code for color/highlight (e.g. "#2563eb", "#fef08a")' },
      targetText: { type: 'string', description: 'Optional: specific text in the document to format instead of current selection' },
    },
  },
  {
    id: 'set_font_style',
    category: 'text_formatting',
    name: 'Set Font Style',
    description: 'Set font family and/or font size for selected text or targeted content.',
    editorCommand: 'editor.chain().setFontFamily(font).setFontSize(size)',
    parameters: {
      fontFamily: { type: 'string', description: 'Font family: Inter, Geist, Georgia, Merriweather, Playfair Display, JetBrains Mono, Arial, Times New Roman' },
      fontSize: { type: 'string', description: 'Font size in pt (e.g. "12pt", "14pt", "18pt", "24pt")' },
      targetText: { type: 'string', description: 'Optional: specific text to apply font styling to' },
    },
  },
  {
    id: 'create_or_edit_heading',
    category: 'text_formatting',
    name: 'Create or Edit Heading',
    description: 'Set or update a heading level (H1, H2, H3, H4) or convert between paragraph and heading.',
    editorCommand: 'editor.chain().toggleHeading({ level })',
    parameters: {
      level: { type: 'number', description: 'Heading level (1, 2, 3, 4)', required: true },
      text: { type: 'string', description: 'Heading text' },
      existingHeading: { type: 'string', description: 'Title of existing heading to update' },
    },
  },
  {
    id: 'change_document_alignment',
    category: 'text_formatting',
    name: 'Change Alignment',
    description: 'Set text alignment for the current paragraph, heading, or selection.',
    editorCommand: 'editor.chain().setTextAlign(alignment)',
    parameters: {
      alignment: { type: 'string', description: 'Alignment', enum: ['left', 'center', 'right', 'justify'], required: true },
    },
  },
  {
    id: 'set_line_height',
    category: 'text_formatting',
    name: 'Set Line Spacing',
    description: 'Set line height (1.0, 1.15, 1.5, 2.0) or add space before/after paragraph.',
    editorCommand: 'editor.chain().setLineHeight(height)',
    parameters: {
      lineHeight: { type: 'string', description: 'Line height: "1.0", "1.15", "1.5", "2.0"', enum: ['1.0', '1.15', '1.5', '2.0'] },
      spaceBefore: { type: 'boolean', description: 'Add 14px space before paragraph' },
      spaceAfter: { type: 'boolean', description: 'Add 14px space after paragraph' },
    },
  },

  // 3. STRUCTURED CONTENT
  {
    id: 'insert_document_table',
    category: 'structured_content',
    name: 'Insert Table',
    description: 'Insert a new formatted table with specified rows, columns, headers, and initial cell data.',
    editorCommand: 'editor.chain().insertTable()',
    parameters: {
      rowCount: { type: 'number', description: 'Number of rows' },
      colCount: { type: 'number', description: 'Number of columns' },
      headers: { type: 'array', description: 'Header column titles' },
      rows: { type: 'array', description: '2D array of row cells data' },
    },
  },
  {
    id: 'modify_table_structure',
    category: 'structured_content',
    name: 'Modify Table Structure',
    description: 'Add or remove rows/columns, merge or split cells, or delete a table in the document.',
    editorCommand: 'editor.chain().addRowAfter() / deleteColumn() / mergeCells() / etc.',
    parameters: {
      operation: {
        type: 'string',
        description: 'Table operation to perform',
        enum: ['addRowBefore', 'addRowAfter', 'deleteRow', 'addColumnBefore', 'addColumnAfter', 'deleteColumn', 'mergeCells', 'splitCell', 'deleteTable'],
        required: true,
      },
    },
  },
  {
    id: 'insert_hyperlink',
    category: 'structured_content',
    name: 'Insert Hyperlink',
    description: 'Apply a link to selected text or insert a new linked text span.',
    editorCommand: 'editor.chain().setLink({ href: url })',
    parameters: {
      url: { type: 'string', description: 'Destination web URL', required: true },
      text: { type: 'string', description: 'Visible display text if no selection exists' },
    },
  },
  {
    id: 'insert_document_image',
    category: 'structured_content',
    name: 'Insert Image',
    description: 'Insert an image via URL or data URI with alt text and title.',
    editorCommand: 'editor.chain().setImage({ src, alt, title })',
    parameters: {
      url: { type: 'string', description: 'Image source URL or base64 data URI', required: true },
      alt: { type: 'string', description: 'Accessible alternative text' },
      title: { type: 'string', description: 'Image caption or tooltip' },
    },
  },
  {
    id: 'insert_callout_box',
    category: 'structured_content',
    name: 'Insert Callout Box',
    description: 'Insert a highlighted callout box (info, tip, warning, danger, note) with custom content.',
    editorCommand: 'editor.chain().setCallout({ type })',
    parameters: {
      type: { type: 'string', description: 'Callout type', enum: ['info', 'tip', 'warning', 'danger', 'note'], required: true },
      content: { type: 'string', description: 'Text or markdown inside the callout' },
    },
  },
  {
    id: 'insert_vector_shape',
    category: 'structured_content',
    name: 'Insert Vector Shape',
    description: 'Insert an inline SVG diagram shape (rectangle, rounded-rectangle, circle, diamond, star, arrow-right, triangle).',
    editorCommand: 'editor.chain().insertShape(attrs)',
    parameters: {
      shapeType: { type: 'string', description: 'Shape type', enum: ['rectangle', 'rounded-rectangle', 'circle', 'diamond', 'star', 'arrow-right', 'triangle'], required: true },
      fill: { type: 'string', description: 'Background fill color hex (default: "#E7EAE4")' },
      stroke: { type: 'string', description: 'Border stroke color hex (default: "#245C45")' },
      width: { type: 'number', description: 'Width in pixels (default: 180)' },
      height: { type: 'number', description: 'Height in pixels (default: 110)' },
    },
  },
  {
    id: 'insert_document_page_break',
    category: 'page_and_layout',
    name: 'Insert Page Break',
    description: 'Insert an explicit page break to push subsequent content to the next page.',
    editorCommand: 'editor.chain().setPageBreak()',
  },
  {
    id: 'insert_document_section_break',
    category: 'page_and_layout',
    name: 'Insert Section Break',
    description: 'Insert a section break starting a new page section with independent layout.',
    editorCommand: 'editor.chain().setSectionBreak()',
  },

  // 4. PAGE AND DOCUMENT LAYOUT
  {
    id: 'modify_page_layout',
    category: 'page_and_layout',
    name: 'Modify Page Layout',
    description: 'Update page size (A4, Letter, Legal), orientation (portrait, landscape), margins (preset or mm), columns (1, 2, 3), headers, footers, and page numbers.',
    editorCommand: 'updateDocument page layout settings',
    parameters: {
      pageSize: { type: 'string', description: 'Paper size', enum: ['A4', 'Letter', 'Legal'] },
      orientation: { type: 'string', description: 'Page orientation', enum: ['portrait', 'landscape'] },
      marginPreset: { type: 'string', description: 'Margin preset', enum: ['normal', 'narrow', 'wide', 'custom'] },
      margins: { type: 'object', description: 'Custom margins in mm { top, bottom, left, right }' },
      columns: { type: 'number', description: 'Number of columns (1, 2, 3)', enum: ['1', '2', '3'] },
      headerText: { type: 'string', description: 'Running header text' },
      footerText: { type: 'string', description: 'Running footer text' },
      showPageNumbers: { type: 'boolean', description: 'Show page numbers in footer' },
      differentFirstPage: { type: 'boolean', description: 'Use different header/footer on first page' },
    },
  },

  // 5. SEARCH & TARGETED EDITING
  {
    id: 'search_document_content',
    category: 'search_and_navigation',
    name: 'Search Document Content',
    description: 'Search exact text, keywords, or patterns in the active document. Returns exact positions, match count, surrounding context snippets, and containing section paths.',
    editorCommand: 'ProseMirror doc descendant walk with range mapping',
    parameters: {
      query: { type: 'string', description: 'Search term or phrase', required: true },
      caseSensitive: { type: 'boolean', description: 'Perform case-sensitive match' },
      matchWholeWord: { type: 'boolean', description: 'Match whole words only' },
    },
  },
  {
    id: 'locate_document_section',
    category: 'search_and_navigation',
    name: 'Locate Document Section',
    description: 'Locate a section by heading title. Returns the section range, heading level, word count, and text preview.',
    editorCommand: 'ProseMirror heading boundary identification',
    parameters: {
      headingQuery: { type: 'string', description: 'Heading title or keyword', required: true },
    },
  },
  {
    id: 'find_and_replace_text',
    category: 'search_and_navigation',
    name: 'Find and Replace Text',
    description: 'Find matching text and replace either a specific match index (0-based) or all occurrences with confirmation.',
    editorCommand: 'ProseMirror text range replacement transaction',
    parameters: {
      findText: { type: 'string', description: 'Text to search for', required: true },
      replaceText: { type: 'string', description: 'New replacement text', required: true },
      matchIndex: { type: 'number', description: 'Specific match index to replace (0 = first occurrence). Omit to replace all.' },
      caseSensitive: { type: 'boolean', description: 'Case-sensitive match' },
    },
  },
  {
    id: 'navigate_to_document_heading',
    category: 'search_and_navigation',
    name: 'Navigate to Heading',
    description: 'Scroll the editor view and move selection to a specific heading.',
    editorCommand: 'editor.chain().setTextSelection(pos).scrollIntoView()',
    parameters: {
      headingText: { type: 'string', description: 'Target heading title', required: true },
    },
  },

  // 6. UNDO / REDO & PERSISTENCE
  {
    id: 'editor_undo',
    category: 'content_creation_editing',
    name: 'Undo Editor Action',
    description: 'Undo the last editing transaction.',
    editorCommand: 'editor.chain().undo()',
  },
  {
    id: 'editor_redo',
    category: 'content_creation_editing',
    name: 'Redo Editor Action',
    description: 'Redo the previously undone transaction.',
    editorCommand: 'editor.chain().redo()',
  },
  {
    id: 'save_document_changes',
    category: 'content_creation_editing',
    name: 'Save Document Changes',
    description: 'Persist current editor state immediately to storage.',
    editorCommand: 'onPersist callback',
  },
];

/**
 * Returns a concise capability summary for system prompts.
 */
export function getDocumentCapabilitiesPromptSummary(): string {
  return `SUPPORTED DOCUMENT EDITOR CAPABILITIES:
1. Content Creation & Editing:
   - insert_structured_document: Insert rich multi-paragraph content, full reports, introductions, or structured content with headings, lists, and tables (position: cursor, start, end, replace_selection).
   - insert_text_at_cursor: Insert text/markdown at current cursor.
   - append_or_insert_paragraph: Append at end, start, or after a specific heading.
   - prepend_to_document: Insert content at the very top of document.
   - replace_selected_text: Replace currently selected text.
   - delete_selected_content: Delete selected text/nodes.
   - duplicate_content: Duplicate selection or section.
   - move_document_section: Relocate a section (heading + body) before/after another heading or to start/end.
   - create_document_list: Create bulleted, numbered, or task checklists (supports nested items).

2. Text Formatting:
   - format_document_text: Bold, italic, underline, strikethrough, subscript, superscript, inline code, text color, highlight color, clear formatting.
   - set_font_style: Font family (Inter, Geist, Georgia, Merriweather, Playfair Display, JetBrains Mono, Arial, Times New Roman) & font size (8pt-72pt).
   - create_or_edit_heading: Set/change heading levels (H1-H4) or convert between text and headings.
   - change_document_alignment: Left, center, right, justify.
   - set_line_height: Line spacing (1.0, 1.15, 1.5, 2.0) and space before/after paragraph.

3. Structured Content:
   - insert_document_table: Insert table with custom rows, cols, headers, and initial data.
   - modify_table_structure: Add row before/after, add col before/after, delete row/col, merge cells, split cell, delete table.
   - insert_hyperlink: Create/edit links with URL and display text.
   - insert_document_image: Insert image via URL with alt and title.
   - insert_callout_box: Insert callout (info, tip, warning, danger, note).
   - insert_vector_shape: Insert shape (rectangle, rounded-rectangle, circle, diamond, star, arrow-right, triangle).
   - insert_document_page_break: Page break.
   - insert_document_section_break: Section break.

4. Page & Document Layout:
   - modify_page_layout: Page size (A4, Letter, Legal), orientation (portrait, landscape), margins (normal, narrow, wide, custom mm), columns (1, 2, 3), running header/footer text, page numbering, different first page.

5. Search & Targeted Editing:
   - search_document_content: Search exact text/patterns; returns match positions, count, surrounding context snippets, and containing section paths.
   - locate_document_section: Locate section by heading title with range and content preview.
   - find_and_replace_text: Replace a specific match occurrence (0-based index) or all matches with confirmation.
   - navigate_to_document_heading: Scroll to heading.
   - editor_undo / editor_redo: Undo/redo previous AI or user operations.
   - save_document_changes: Trigger immediate persistent save.`;
}

