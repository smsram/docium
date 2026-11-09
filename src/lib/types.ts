export type DocumentType = 'doc' | 'sheet' | 'slide' | 'pdf' | 'project';

export type OutputFormat = 'auto' | 'doc' | 'sheet' | 'slide';

export type AnyWorkspaceItem = DocumentItem | SpreadsheetItem | PresentationItem | PdfItem;

export type IntegrationCategory = 'ai' | 'search' | 'image';

export type ProviderId =
  // AI Reasoning Providers
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'groq'
  | 'openrouter'
  | 'cloudflare'
  | 'huggingface'
  | 'ollama'
  | 'custom'
  // Internet Search Providers
  | 'brave'
  | 'tavily'
  | 'serper'
  | 'serpapi'
  | 'searxng'
  // Image Generation Providers
  | 'google-imagen'
  | 'cloudflare-flux'
  | 'stability'
  | 'fal'
  | 'replicate'
  | 'together';

export interface ModelCapability {
  contextWindow: string;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStreaming: boolean;
  reasoning: boolean;
  supportsText?: boolean;
  supportsEmbeddings?: boolean;
  supportsStructuredOutput?: boolean;
  supportsImageGen?: boolean;
}

export interface ModelOption {
  id: string;
  name: string;
  capabilities: ModelCapability;
  description?: string;
  isCustom?: boolean;
}

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  category: IntegrationCategory;
  enabled: boolean;
  apiKey: string;
  baseUrl?: string;
  selectedModel: string;
  customModels?: ModelOption[];
  discoveredModels?: ModelOption[];
  status?: 'unconfigured' | 'testing' | 'connected' | 'error';
  lastTested?: string;
  errorMessage?: string;
  isAdded?: boolean;
  accountId?: string;
}

export interface ComposerAttachment {
  id: string;
  name: string;
  size: string;
  type: string;
  previewUrl?: string;
}

export interface ComposerDraft {
  prompt: string;
  format: OutputFormat;
  attachments: ComposerAttachment[];
  urls: string[];
  enabledTools: {
    internetSearch: boolean;
    imageSearch: boolean;
    imageGeneration: boolean;
    diagramsAndGraphs: boolean;
  };
}

export interface BaseItem {
  id: string;
  title: string;
  type: DocumentType;
  updatedAt: string;
  createdAt: string;
  starred?: boolean;
  trashed?: boolean;
  shared?: boolean;
  owner: {
    name: string;
    email: string;
    avatar: string;
  };
  collaborators?: {
    name: string;
    email: string;
    avatar: string;
    role: 'owner' | 'editor' | 'viewer';
  }[];
  tags?: string[];
  size?: string;
  thumbnail?: string;
  description?: string;
  initialPrompt?: string;
  attachedSources?: ResearchSource[];
}

export type DocumentPageSize = 'A4' | 'Letter' | 'Legal' | 'A3' | 'A5' | 'Tabloid' | 'custom';
export type DocumentOrientation = 'portrait' | 'landscape';
export type MarginPreset = 'normal' | 'narrow' | 'moderate' | 'wide' | 'custom';

export interface DocumentMargins {
  top: number; // in mm
  bottom: number;
  left: number;
  right: number;
}

export interface DocumentCommentReply {
  id: string;
  author: string;
  authorAvatar?: string;
  createdAt: string;
  text: string;
}

export interface DocumentComment {
  id: string;
  author: string;
  authorAvatar?: string;
  createdAt: string;
  text: string;
  selectionText?: string;
  from?: number;
  to?: number;
  resolved: boolean;
  replies?: DocumentCommentReply[];
}

export interface DocumentVersionSnapshot {
  id: string;
  title: string;
  timestamp: string;
  wordCount: number;
  content: string;
  contentJson?: Record<string, unknown>;
  isNamed?: boolean;
}

export interface DocumentCitation {
  id: string;
  key: string;
  author: string;
  title: string;
  year?: string;
  publisher?: string;
  url?: string;
}

export interface DocumentFootnote {
  id: string;
  number: number;
  text: string;
}

export interface DocumentSectionConfig {
  id: string;
  title?: string;
  orientation?: DocumentOrientation;
  margins?: DocumentMargins;
  headerText?: string;
  footerText?: string;
  linkToPrevious?: boolean;
}

export interface DocumentItem extends BaseItem {
  type: 'doc';
  content: string; // HTML or Markdown content
  contentJson?: Record<string, unknown>; // Authoritative ProseMirror JSON
  wordCount?: number;
  characterCount?: number;
  readingTime?: number;
  pageSize?: DocumentPageSize;
  customDimensions?: { widthMm: number; heightMm: number };
  orientation?: DocumentOrientation;
  margins?: DocumentMargins | MarginPreset;
  marginPreset?: MarginPreset;
  columns?: 1 | 2 | 3;
  headerText?: string;
  footerText?: string;
  firstPageHeaderText?: string;
  firstPageFooterText?: string;
  showPageNumbers?: boolean;
  pageNumberPosition?: 'bottom-center' | 'bottom-right' | 'top-right';
  differentFirstPage?: boolean;
  sections?: DocumentSectionConfig[];
  lineSpacing?: number;
  paragraphSpacing?: number;
  fontFamily?: string;
  fontSize?: number;
  comments?: DocumentComment[];
  versionHistory?: DocumentVersionSnapshot[];
  citations?: DocumentCitation[];
  footnotes?: DocumentFootnote[];
}

export interface CellData {
  value: string;
  computed?: string;
  format?: 'text' | 'number' | 'currency' | 'percent';
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  bg?: string;
}

export interface SheetData {
  id: string;
  name: string;
  cells: Record<string, CellData>; // e.g. "A1": { value: "100" }
  rowCount: number;
  colCount: number;
}

export interface SpreadsheetItem extends BaseItem {
  type: 'sheet';
  sheets: SheetData[];
  activeSheetId: string;
}

export interface SlideElement {
  id: string;
  type: 'title' | 'text' | 'image' | 'shape' | 'table';
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  bgColor?: string;
  fontSize?: number;
}

export interface SlidePage {
  id: string;
  title: string;
  notes?: string;
  elements: SlideElement[];
  bgColor?: string;
  theme?: string;
  layout?: string;
}

export interface PresentationItem extends BaseItem {
  type: 'slide';
  slides: SlidePage[];
}

export interface PdfAnnotation {
  id: string;
  page: number;
  type: 'highlight' | 'note' | 'drawing' | 'signature';
  content?: string;
  color: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  createdAt: string;
}

export interface PdfItem extends BaseItem {
  type: 'pdf';
  pageCount: number;
  fileUrl: string;
  annotations: PdfAnnotation[];
}

export interface ProjectTask {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  assignee: {
    name: string;
    avatar: string;
  };
  dueDate: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  docId?: string;
}

export interface ProjectItem extends BaseItem {
  type: 'project';
  progress: number;
  tasks: ProjectTask[];
  documentIds: string[];
}

export interface TemplateItem {
  id: string;
  title: string;
  type: DocumentType;
  category: 'Business' | 'Engineering' | 'Marketing' | 'Personal' | 'Design';
  description: string;
  previewSnippet: string;
  icon: string;
  badge?: string;
  content: string;
}

export interface ChartSeries {
  name: string;
  data: number[];
  color?: string;
}

export interface ChartSpecification {
  type: 'bar' | 'line' | 'pie' | 'scatter';
  title: string;
  description?: string;
  xAxis?: {
    label?: string;
    data: string[];
  };
  yAxis?: {
    label?: string;
  };
  series: ChartSeries[];
  pieData?: { name: string; value: number }[];
  summary?: string;
}

export interface GeneratedImageMetadata {
  id: string;
  url: string;
  prompt: string;
  revisedPrompt?: string;
  aspectRatio: string;
  provider: string;
  createdAt: string;
}

export type AgentStepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AgentActivityEvent {
  id: string;
  stepId?: string;
  taskId?: string;
  conversationId?: string;
  responseId?: string;
  agentRunId?: string;
  eventType: string;
  label: string;
  title?: string;
  description?: string;
  status: AgentStepStatus;
  safeSummary?: string;
  toolName?: string;
  order?: number;
  durationMs?: number;
  timestamp: string;
}

export type StructuredContentBlock =
  | { type: 'text'; text: string }
  | { type: 'chart'; chart: ChartSpecification }
  | { type: 'image'; image: GeneratedImageMetadata }
  | { type: 'table'; title?: string; headers: string[]; rows: string[][] }
  | { type: 'code'; language: string; code: string }
  | { type: 'citation'; citation: { sourceId: string; sourceTitle: string; url?: string; page?: number; snippet: string } }
  | { type: 'math'; expression: string };

export interface ResearchSource {
  id: string;
  title: string;
  type: 'url' | 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'note' | 'txt' | 'md' | 'image';
  sourceUrl?: string;
  snippet: string;
  addedAt: string;
  updatedAt?: string;
  status: 'indexed' | 'syncing' | 'processing' | 'error' | 'ready';
  tags: string[];
  isIncludedInContext?: boolean;
  scope?: 'document' | 'conversation';
  fileSize?: string;
  mimeType?: string;
  extractedText?: string;
  extractedImages?: { id: string; url: string; caption?: string; page?: number }[];
  chunkCount?: number;
  contentHash?: string;
  indexedAt?: string;
  conversationId?: string;
  workspaceId?: string;
}

export type AgentRunStatus =
  | 'idle'
  | 'preparing'
  | 'executing_tool'
  | 'generating'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  contentBlocks?: StructuredContentBlock[];
  activityEvents?: AgentActivityEvent[];
  attachments?: {
    id?: string;
    name: string;
    size: string;
    type: string;
    url?: string;
    status?: 'uploading' | 'processing' | 'ready' | 'error';
  }[];
  sources?: string[];
  citations?: {
    sourceId: string;
    sourceTitle: string;
    url?: string;
    page?: number;
    snippet: string;
  }[];
  toolCalls?: {
    name: string;
    status: 'running' | 'completed' | 'failed';
    result?: string;
  }[];
  suggestedAction?: {
    label: string;
    type: 'insert_doc' | 'create_table' | 'create_chart' | 'create_diagram' | 'add_slide';
    payload: string;
  };
  modelUsed?: {
    providerId: string;
    modelId: string;
  };
  status?: 'sending' | 'streaming' | 'completed' | 'failed';
  runStatus?: AgentRunStatus;
  error?: string;
  /** Unix ms timestamp when generation began — used for elapsed-time display */
  generationStartTime?: number;
  /** Unix ms timestamp when generation finished — used for elapsed-time display */
  generationEndTime?: number;
}

export interface WorkspaceConversation {
  id: string;
  title: string;
  category: 'document' | 'general';
  workspaceId?: string;
  workspaceType?: DocumentType | 'general';
  documentId?: string;
  createdAt: string;
  updatedAt: string;
  messages: AiChatMessage[];
  sources: ResearchSource[];
  scratchpad?: string;
  runStatus?: AgentRunStatus;
  selectedTools: {
    internetSearch?: boolean;
    imageGeneration?: boolean;
    chartsAndData?: boolean;
    imageSearch?: boolean;
    diagramsAndGraphs?: boolean;
    documentOperations?: boolean;
  };
  modelConfig?: {
    providerId: string;
    modelId: string;
  };
  selectedProvider?: ProviderId;
  selectedModel?: string;
}

export interface EmbeddingConfig {
  provider: 'openai' | 'gemini' | 'cloudflare' | 'ollama' | 'local';
  model: string;
  apiKey?: string;
  baseUrl?: string;
  dimensions: number;
  localOnlyPrivacy: boolean;
  fallbackToLocal: boolean;
}

export interface SpecializedTaskModels {
  mainAi: { providerId: string; modelId: string };
  vision: { providerId: string; modelId: string };
  embeddings: { providerId: string; modelId: string };
}

export type AiPanelMode = 'docked' | 'minimized' | 'compact' | 'hidden';

export interface AiPanelState {
  mode: AiPanelMode;
  preferredWidth: number;
  isOpen: boolean;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  type: 'mention' | 'share' | 'system' | 'ai';
  link?: string;
}

export interface WorkspaceFileRecord {
  id: string;
  title: string;
  type: 'doc' | 'sheet' | 'slide' | 'pdf';
  content?: string;
  wordCount?: number;
  updatedAt?: string;
  tags?: string[];
}

export interface FileOperationEvent {
  operation: 'update' | 'create';
  itemType: 'doc' | 'sheet' | 'slide' | 'pdf';
  itemId: string;
  title: string;
  content: string;
  mode?: 'append' | 'prepend' | 'replace' | 'section' | 'create';
  summary?: string;
}

export interface ActiveDocumentHeading {
  level: number;
  text: string;
  pos?: number;
}

export interface ActiveDocumentSelectionContext {
  hasSelection: boolean;
  selectedText?: string;
  from?: number;
  to?: number;
  cursorPos?: number;
  surroundingParagraph?: string;
}

export interface ActiveDocumentContext {
  id: string;
  title: string;
  format?: string;
  content?: string;
  headings?: ActiveDocumentHeading[];
  selection?: ActiveDocumentSelectionContext;
  selectedText?: string;
  cursorPosition?: number;
  surroundingParagraph?: string;
  margins?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
    preset?: string;
  };
  pageSize?: DocumentPageSize;
  orientation?: DocumentOrientation;
  columns?: 1 | 2 | 3;
  headerText?: string;
  footerText?: string;
  showPageNumbers?: boolean;
  differentFirstPage?: boolean;
  wordCount?: number;
  characterCount?: number;
  lastModified?: string;
  readingTime?: number;
  saveStatus?: 'saved' | 'saving' | 'error';
  hasUnsavedChanges?: boolean;
  editorMounted?: boolean;
  isEditable?: boolean;
}

export interface EditorActionEvent {
  actionId?: string;
  action:
    | 'insert_structured_document'
    | 'insert_text_at_cursor'
    | 'replace_selected_text'
    | 'delete_selected_content'
    | 'append_or_insert_paragraph'
    | 'prepend_to_document'
    | 'create_or_edit_heading'
    | 'create_document_list'
    | 'insert_document_table'
    | 'modify_table_structure'
    | 'insert_hyperlink'
    | 'format_document_text'
    | 'set_font_style'
    | 'change_document_alignment'
    | 'insert_document_page_break'
    | 'insert_document_section_break'
    | 'insert_callout_box'
    | 'insert_vector_shape'
    | 'insert_document_image'
    | 'modify_page_layout'
    | 'move_document_section'
    | 'duplicate_document_content'
    | 'find_and_replace_text'
    | 'editor_undo'
    | 'editor_redo'
    | 'rename_current_document'
    | 'save_document_changes'
    | 'navigate_to_document_heading'
    | (string & {});
  payload: Record<string, unknown>;
  summary?: string;
}

export interface EditorActionResult {
  success: boolean;
  error?: string;
  documentId?: string;
  action?: string;
  actionId?: string;
  contentChanged?: boolean;
  insertedCharacters?: number;
  persisted?: boolean;
  summary?: string;
}

