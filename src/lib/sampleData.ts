import {
  DocumentItem,
  SpreadsheetItem,
  PresentationItem,
  PdfItem,
  ProjectItem,
  TemplateItem,
  ResearchSource,
  NotificationItem,
} from './types';

export const SAMPLE_DOCUMENTS: DocumentItem[] = [
  {
    id: 'doc-1',
    title: 'Docium Architecture & Product Strategy 2026',
    type: 'doc',
    updatedAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    starred: true,
    shared: true,
    owner: {
      name: 'Sarah Chen',
      email: 'sarah.chen@docium.workspace',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    },
    collaborators: [
      { name: 'Alex Rivera', email: 'alex@docium.workspace', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150', role: 'editor' },
      { name: 'Elena Rostova', email: 'elena@docium.workspace', avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150', role: 'viewer' },
    ],
    tags: ['Architecture', 'Strategy', 'Q4'],
    size: '142 KB',
    wordCount: 840,
    readingTime: 4,
    pageSize: 'A4',
    orientation: 'portrait',
    margins: 'normal',
    headerText: 'Docium Confidential — Engineering Strategy',
    footerText: 'Page {page} of {pages} — Internal Use Only',
    content: `
      <h1>Docium Architecture & Product Strategy 2026</h1>
      <p><em>Version 2.4 — Prepared for Executive Leadership & Product Architecture Team</em></p>
      
      <h2>1. Executive Summary</h2>
      <p>Modern knowledge workers operate across fragmented applications: text editors, spreadsheets, presentation creators, and external AI chatbots. <strong>Docium</strong> unifies these modalities into a coherent, high-velocity workspace engineered for deep work and multi-modal synthesis.</p>
      
      <blockquote>
        "The purpose of Docium is not simply to render text, but to provide a cohesive canvas where thought, data, and generative intelligence interact with zero friction."
      </blockquote>

      <h2>2. Core Architectural Pillars</h2>
      <ul>
        <li><strong>Unified Data Model:</strong> Text, tabular numbers, visual slides, and vectorized sources share a persistent schema.</li>
        <li><strong>Native Multimodal AI:</strong> Context-aware agents able to formulate spreadsheets, query research repositories, and adjust document tone.</li>
        <li><strong>Local-First Performance:</strong> Sub-10ms keystroke latency, optimistic UI transitions, and background synchronization.</li>
      </ul>

      <h2>3. Performance & Capacity Benchmarks</h2>
      <table>
        <thead>
          <tr>
            <th>Workspace Metric</th>
            <th>Legacy Suites</th>
            <th>Docium Baseline</th>
            <th>Target 2026</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Time to Interactive (TTI)</td>
            <td>1,420 ms</td>
            <td>320 ms</td>
            <td>&lt; 180 ms</td>
          </tr>
          <tr>
            <td>Editor Memory Footprint</td>
            <td>450 MB</td>
            <td>68 MB</td>
            <td>&lt; 50 MB</td>
          </tr>
          <tr>
            <td>Context Window Integration</td>
            <td>Manual / None</td>
            <td>128k Tokens</td>
            <td>1M Tokens</td>
          </tr>
          <tr>
            <td>Collaboration Sync Delay</td>
            <td>180 ms</td>
            <td>35 ms</td>
            <td>&lt; 15 ms</td>
          </tr>
        </tbody>
      </table>

      <h2>4. Integration Architecture</h2>
      <p>The workspace runtime connects to intelligent sidecars via lightweight streaming protocols:</p>
      <pre><code>// Dynamic Model Gateway Dispatcher
export async function dispatchTask(prompt: string, context: DocumentContext) {
  const model = selectOptimalModel(context.complexity);
  return await streamInference({
    provider: model.provider,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2
  });
}</code></pre>

      <h2>5. Action Items & Timeline</h2>
      <ol>
        <li>Finalize ProseMirror custom node schema for embedded reactive tables.</li>
        <li>Integrate Mermaid diagramming engine and dynamic SVG charts.</li>
        <li>Benchmark client-side token serialization with Web Workers.</li>
      </ol>
    `,
  },
  {
    id: 'doc-2',
    title: 'Customer Feedback & UX Research Synthesis',
    type: 'doc',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    starred: true,
    shared: false,
    owner: {
      name: 'Alex Rivera',
      email: 'alex@docium.workspace',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    },
    tags: ['UX', 'Research', 'Interviews'],
    size: '86 KB',
    wordCount: 520,
    readingTime: 3,
    pageSize: 'A4',
    orientation: 'portrait',
    margins: 'normal',
    content: `
      <h1>Customer Feedback & UX Research Synthesis</h1>
      <p>Findings from 34 qualitative interviews conducted with product managers, engineers, and researchers.</p>
      <h2>Top User Insights</h2>
      <ul>
        <li>Users desire frictionless export to clean Markdown without formatting corruption.</li>
        <li>Keyboard navigation shortcuts (similar to Linear and Notion) increase perceived speed by 3x.</li>
        <li>AI assistance must be inline and non-intrusive rather than a intrusive floating bubble.</li>
      </ul>
    `,
  },
  {
    id: 'doc-3',
    title: 'Q4 Marketing Campaign & Brand Guidelines',
    type: 'doc',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
    starred: false,
    shared: true,
    owner: {
      name: 'Elena Rostova',
      email: 'elena@docium.workspace',
      avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150',
    },
    tags: ['Marketing', 'Brand', 'Q4'],
    size: '115 KB',
    wordCount: 640,
    readingTime: 3,
    pageSize: 'A4',
    orientation: 'portrait',
    margins: 'normal',
    content: `
      <h1>Q4 Marketing Campaign & Brand Guidelines</h1>
      <p>Guidelines on visual identity, voice and tone, and messaging pillars for the Docium Public Beta launch.</p>
      <h2>Brand Personality</h2>
      <p>Calm, precise, unobtrusive, highly capable. We avoid hype and focus on raw utility and craftsmanship.</p>
    `,
  },
];

export const SAMPLE_SHEETS: SpreadsheetItem[] = [
  {
    id: 'sheet-1',
    title: 'FY2026 SaaS Financial Model & Projections',
    type: 'sheet',
    updatedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    starred: true,
    shared: true,
    owner: {
      name: 'Sarah Chen',
      email: 'sarah.chen@docium.workspace',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    },
    tags: ['Finance', 'Budget', 'ARR'],
    size: '320 KB',
    activeSheetId: 's1',
    sheets: [
      {
        id: 's1',
        name: 'Revenue Projections',
        rowCount: 20,
        colCount: 8,
        cells: {
          A1: { value: 'Metric', bold: true, bg: '#EBF3EF' },
          B1: { value: 'Q1 2026', bold: true, bg: '#EBF3EF' },
          C1: { value: 'Q2 2026', bold: true, bg: '#EBF3EF' },
          D1: { value: 'Q3 2026', bold: true, bg: '#EBF3EF' },
          E1: { value: 'Q4 2026', bold: true, bg: '#EBF3EF' },
          F1: { value: 'Total 2026', bold: true, bg: '#EBF3EF' },
          A2: { value: 'Active Workspaces' },
          B2: { value: '1240', format: 'number' },
          C2: { value: '2450', format: 'number' },
          D2: { value: '4120', format: 'number' },
          E2: { value: '6800', format: 'number' },
          F2: { value: '6800', format: 'number', bold: true },
          A3: { value: 'Subscription ARR ($)' },
          B3: { value: '148800', format: 'currency' },
          C3: { value: '294000', format: 'currency' },
          D3: { value: '494400', format: 'currency' },
          E3: { value: '816000', format: 'currency' },
          F3: { value: '1753200', format: 'currency', bold: true },
          A4: { value: 'AI Compute Cost ($)' },
          B4: { value: '12400', format: 'currency' },
          C4: { value: '22800', format: 'currency' },
          D4: { value: '38500', format: 'currency' },
          E4: { value: '59200', format: 'currency' },
          F4: { value: '132900', format: 'currency' },
          A5: { value: 'Gross Margin' },
          B5: { value: '91.6%', format: 'percent' },
          C5: { value: '92.2%', format: 'percent' },
          D5: { value: '92.2%', format: 'percent' },
          E5: { value: '92.7%', format: 'percent' },
          F5: { value: '92.4%', format: 'percent', bold: true },
        },
      },
      {
        id: 's2',
        name: 'Headcount & Opex',
        rowCount: 15,
        colCount: 6,
        cells: {
          A1: { value: 'Department', bold: true },
          B1: { value: 'Headcount', bold: true },
          C1: { value: 'Monthly Payroll ($)', bold: true },
          A2: { value: 'Engineering' },
          B2: { value: '8' },
          C2: { value: '96000' },
          A3: { value: 'Product & Design' },
          B3: { value: '3' },
          C3: { value: '36000' },
        },
      },
    ],
  },
  {
    id: 'sheet-2',
    title: 'Sprint 42 Velocity & Bug Tracker',
    type: 'sheet',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
    starred: false,
    shared: true,
    owner: {
      name: 'Alex Rivera',
      email: 'alex@docium.workspace',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    },
    tags: ['Sprint', 'Engineering'],
    size: '180 KB',
    activeSheetId: 's1',
    sheets: [
      {
        id: 's1',
        name: 'Sprint Tasks',
        rowCount: 15,
        colCount: 6,
        cells: {
          A1: { value: 'Task ID', bold: true },
          B1: { value: 'Title', bold: true },
          C1: { value: 'Owner', bold: true },
          D1: { value: 'Points', bold: true },
          E1: { value: 'Status', bold: true },
          A2: { value: 'DOC-102' },
          B2: { value: 'Tiptap table row resize handle' },
          C2: { value: 'Alex' },
          D2: { value: '5' },
          E2: { value: 'Done' },
          A3: { value: 'DOC-103' },
          B3: { value: 'Formula parser for sheet SUM/AVG' },
          C3: { value: 'Sarah' },
          D3: { value: '8' },
          E3: { value: 'In Progress' },
        },
      },
    ],
  },
];

export const SAMPLE_SLIDES: PresentationItem[] = [
  {
    id: 'slide-1',
    title: 'Docium Seed Series Pitch Deck',
    type: 'slide',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
    starred: true,
    shared: true,
    owner: {
      name: 'Sarah Chen',
      email: 'sarah.chen@docium.workspace',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    },
    tags: ['Pitch', 'Investors', 'Fundraising'],
    size: '1.4 MB',
    slides: [
      {
        id: 'slide-p1',
        title: 'Title Slide',
        notes: 'Introduce Docium: The modern operating system for intellectual work.',
        elements: [
          { id: 'e1', type: 'title', content: 'DOCIUM', x: 10, y: 30, width: 80, height: 20, fontSize: 44, color: '#245C45' },
          { id: 'e2', type: 'text', content: 'The AI-Powered Document Workspace Engineered for Flow.', x: 10, y: 52, width: 80, height: 15, fontSize: 20, color: '#171C19' },
          { id: 'e3', type: 'text', content: 'Confidential Investor Overview • Fall 2026', x: 10, y: 78, width: 80, height: 10, fontSize: 13, color: '#929B91' },
        ],
      },
      {
        id: 'slide-p2',
        title: 'The Problem: Workspace Fragmentation',
        notes: 'Explain how knowledge workers lose up to 4 hours daily context switching.',
        elements: [
          { id: 'e4', type: 'title', content: 'The Fragmentation Tax', x: 10, y: 15, width: 80, height: 15, fontSize: 32, color: '#245C45' },
          { id: 'e5', type: 'text', content: '• Knowledge workers hop between 7+ disjointed tools daily.\n• Documents and spreadsheets are isolated from research repositories.\n• AI tools operate in disconnected floating sidebars with no document context.', x: 10, y: 35, width: 80, height: 45, fontSize: 18, color: '#171C19' },
        ],
      },
      {
        id: 'slide-p3',
        title: 'The Solution: Cohesive Synthesis',
        notes: 'Walk through the unified document, spreadsheet, and AI architecture.',
        elements: [
          { id: 'e6', type: 'title', content: 'Unified Multimodal Canvas', x: 10, y: 15, width: 80, height: 15, fontSize: 32, color: '#245C45' },
          { id: 'e7', type: 'text', content: 'Docium merges the rigor of professional document editors with the fluid agility of modern AI teammates.', x: 10, y: 35, width: 80, height: 30, fontSize: 20, color: '#398568' },
        ],
      },
    ],
  },
];

export const SAMPLE_PDFS: PdfItem[] = [
  {
    id: 'pdf-1',
    title: 'Enterprise Security Whitepaper & SOC2 Type II.pdf',
    type: 'pdf',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12).toISOString(),
    starred: false,
    shared: false,
    owner: {
      name: 'Sarah Chen',
      email: 'sarah.chen@docium.workspace',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    },
    tags: ['Security', 'Compliance', 'SOC2'],
    size: '2.8 MB',
    pageCount: 18,
    fileUrl: '/sample-security.pdf',
    annotations: [
      { id: 'a1', page: 1, type: 'highlight', color: '#FEF08A', x: 12, y: 24, width: 60, height: 4, createdAt: '2026-10-28' },
      { id: 'a2', page: 1, type: 'note', content: 'Review section 3.2 on encryption at rest before audit.', color: '#245C45', x: 74, y: 24, createdAt: '2026-10-28' },
    ],
  },
  {
    id: 'pdf-2',
    title: 'Vendor Master Services Agreement - Signed.pdf',
    type: 'pdf',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(),
    starred: true,
    shared: true,
    owner: {
      name: 'Elena Rostova',
      email: 'elena@docium.workspace',
      avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150',
    },
    tags: ['Legal', 'Contracts'],
    size: '1.2 MB',
    pageCount: 12,
    fileUrl: '/sample-agreement.pdf',
    annotations: [
      { id: 'a3', page: 1, type: 'signature', color: '#245C45', x: 20, y: 80, width: 30, height: 10, createdAt: '2026-10-25' },
    ],
  },
];

export const SAMPLE_PROJECTS: ProjectItem[] = [
  {
    id: 'proj-1',
    title: 'Docium 2.0 Launch Sprint',
    type: 'project',
    updatedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
    starred: true,
    shared: true,
    owner: {
      name: 'Sarah Chen',
      email: 'sarah.chen@docium.workspace',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    },
    tags: ['Product', 'Launch', 'Milestone'],
    size: 'Project Hub',
    progress: 68,
    documentIds: ['doc-1', 'sheet-1', 'slide-1'],
    tasks: [
      {
        id: 't1',
        title: 'Complete Tiptap page break and headers renderer',
        status: 'done',
        assignee: { name: 'Alex Rivera', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150' },
        dueDate: 'Oct 28',
        priority: 'high',
        docId: 'doc-1',
      },
      {
        id: 't2',
        title: 'Review financial model ARR sensitivity table',
        status: 'in_progress',
        assignee: { name: 'Sarah Chen', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150' },
        dueDate: 'Nov 3',
        priority: 'urgent',
        docId: 'sheet-1',
      },
      {
        id: 't3',
        title: 'Prepare investor slide deck presenter notes',
        status: 'review',
        assignee: { name: 'Elena Rostova', avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150' },
        dueDate: 'Nov 5',
        priority: 'medium',
        docId: 'slide-1',
      },
      {
        id: 't4',
        title: 'Validate dark mode contrast ratio compliance (WCAG AAA)',
        status: 'todo',
        assignee: { name: 'Alex Rivera', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150' },
        dueDate: 'Nov 8',
        priority: 'medium',
      },
    ],
  },
  {
    id: 'proj-2',
    title: 'Enterprise Compliance & Security Certification',
    type: 'project',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    starred: false,
    shared: true,
    owner: {
      name: 'Elena Rostova',
      email: 'elena@docium.workspace',
      avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150',
    },
    tags: ['Security', 'Legal'],
    size: 'Project Hub',
    progress: 42,
    documentIds: ['pdf-1', 'pdf-2'],
    tasks: [
      {
        id: 't5',
        title: 'Penetration testing report remediation review',
        status: 'in_progress',
        assignee: { name: 'Sarah Chen', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150' },
        dueDate: 'Nov 12',
        priority: 'urgent',
        docId: 'pdf-1',
      },
      {
        id: 't6',
        title: 'Upload DPA addendums for EU enterprise clients',
        status: 'todo',
        assignee: { name: 'Elena Rostova', avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150' },
        dueDate: 'Nov 18',
        priority: 'medium',
      },
    ],
  },
];

export const SAMPLE_TEMPLATES: TemplateItem[] = [
  {
    id: 'tpl-1',
    title: 'Product Requirements Document (PRD)',
    type: 'doc',
    category: 'Engineering',
    badge: 'Popular',
    icon: 'FileText',
    description: 'Clean, modular PRD template inspired by Linear and Stripe engineering specs.',
    previewSnippet: 'Problem statement, User stories, Technical architecture, Success metrics & Non-goals.',
    content: `
      <h1>[Product / Feature Name] PRD</h1>
      <p><strong>Status:</strong> Draft | <strong>Author:</strong> Your Name | <strong>Date:</strong> 2026-11-01</p>
      <h2>1. Problem & Context</h2>
      <p>Describe the user problem, data evidence, and customer quotes supporting this work.</p>
      <h2>2. Proposed Solution</h2>
      <p>Outline the experience and workflow improvements.</p>
      <h2>3. Technical Considerations & Architecture</h2>
      <p>Data models, API contracts, caching strategy, and latency targets.</p>
      <h2>4. Metrics for Success</h2>
      <ul>
        <li>Adoption rate: &gt; 65% in first 30 days</li>
        <li>Task completion latency reduction: -40%</li>
      </ul>
    `,
  },
  {
    id: 'tpl-2',
    title: 'Executive Weekly Update / MBR',
    type: 'doc',
    category: 'Business',
    badge: 'Executive',
    icon: 'Briefcase',
    description: 'High-signal executive briefing template highlighting KPIs, wins, blockers, and bets.',
    previewSnippet: 'TL;DR, Metric dashboard, Strategic milestones, Customer sentiment, Asks for leadership.',
    content: `
      <h1>Executive Weekly Briefing</h1>
      <h2>TL;DR</h2>
      <p>Summarize the week in three high-impact bullet points.</p>
      <h2>Core Metrics</h2>
      <p>ARR growth, active workspaces, net churn rate, and system availability.</p>
      <h2>Strategic Wins & Major Milestones</h2>
      <p>Key client signings, technical launches, and talent updates.</p>
      <h2>Blockers & Asks</h2>
      <p>Identify areas requiring executive air cover or cross-team alignment.</p>
    `,
  },
  {
    id: 'tpl-3',
    title: 'Quarterly Financial Model & Budget',
    type: 'sheet',
    category: 'Business',
    badge: 'Finance',
    icon: 'Table',
    description: 'Turnkey financial sheet with pre-configured formulas for ARR, OpEx, Gross Margin, and Runways.',
    previewSnippet: 'Income statement, payroll forecast, marketing spend breakdown, and scenario modeling.',
    content: 'sheet_template_financial',
  },
  {
    id: 'tpl-4',
    title: 'Investor Pitch & Strategy Deck',
    type: 'slide',
    category: 'Business',
    badge: 'Seed / Series A',
    icon: 'Presentation',
    description: '10-slide high-conviction pitch deck structure with problem, market, product, traction, and ask.',
    previewSnippet: 'Mission, Problem, Solution, Market size, Moat, Business model, Team, Financials.',
    content: 'slide_template_pitch',
  },
  {
    id: 'tpl-5',
    title: 'Design System & Component Token Spec',
    type: 'doc',
    category: 'Design',
    badge: 'Design',
    icon: 'Palette',
    description: 'Comprehensive design tokens, typography scales, accessibility guidelines, and component states.',
    previewSnippet: 'Color palettes, typography matrix, elevation levels, and interactive states.',
    content: `
      <h1>Docium Design System Specification</h1>
      <h2>1. Color Harmony</h2>
      <p>Semantic tokens for light and dark environments with WCAG AAA conformance.</p>
      <h2>2. Type Scale</h2>
      <p>Geist Sans baseline grid with dynamic clamp scales.</p>
    `,
  },
  {
    id: 'tpl-6',
    title: 'Academic Research & Literature Review',
    type: 'doc',
    category: 'Personal',
    icon: 'BookOpen',
    description: 'Structured layout for literature reviews, abstract, citations, methodology, and empirical evidence.',
    previewSnippet: 'Abstract, Background, Literature taxonomy, Methodology, Discussion, References.',
    content: `
      <h1>Literature Synthesis: Neural Context Window Optimization</h1>
      <h2>Abstract</h2>
      <p>A systematic survey of modern sparse attention and retrieval augmented generation mechanisms.</p>
    `,
  },
];

export const SAMPLE_SOURCES: ResearchSource[] = [
  {
    id: 'src-1',
    title: 'Anthropic Context Window & Tool Use Optimization Guide',
    type: 'url',
    sourceUrl: 'https://docs.anthropic.com/en/docs/build-with-claude/tool-use',
    snippet: 'Best practices for structured JSON schema emission and low-latency token streaming in modern agentic workspaces.',
    addedAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    status: 'indexed',
    tags: ['AI', 'Tooling', 'API'],
  },
  {
    id: 'src-2',
    title: 'ProseMirror / Tiptap Collaborative Schema Documentation',
    type: 'url',
    sourceUrl: 'https://tiptap.dev/docs/editor/introduction',
    snippet: 'Custom extension architecture for block-level decorators, inline widgets, and transactional undo history.',
    addedAt: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
    status: 'indexed',
    tags: ['Editor', 'Frontend', 'Tiptap'],
  },
  {
    id: 'src-3',
    title: 'Gartner Market Guide for AI Collaborative Workspaces 2026.pdf',
    type: 'pdf',
    snippet: 'Analysis of market shift from static cloud storage toward intelligent conversational document canvases.',
    addedAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    status: 'indexed',
    tags: ['Market', 'Gartner', 'Research'],
  },
  {
    id: 'src-4',
    title: 'Local First Software: You Own Your Data, in spite of the Cloud',
    type: 'url',
    sourceUrl: 'https://www.inkandswitch.com/local-first/',
    snippet: 'Ink & Switch foundational paper on CRDTs, multi-master replication, and zero-latency local user interactions.',
    addedAt: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString(),
    status: 'indexed',
    tags: ['Local-First', 'Architecture', 'CRDT'],
  },
];

export const SAMPLE_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'n1',
    title: 'Sarah Chen mentioned you in Architecture Spec',
    message: '"@Alex can you review the Tiptap custom node table schema before Friday?"',
    timestamp: '15m ago',
    read: false,
    type: 'mention',
    link: '/docs/doc-1',
  },
  {
    id: 'n2',
    title: 'AI Synthesis Completed',
    message: 'Your research summary on "Local First Software" is indexed and ready in the AI panel.',
    timestamp: '1h ago',
    read: false,
    type: 'ai',
    link: '/sources',
  },
  {
    id: 'n3',
    title: 'Elena Rostova shared a file with you',
    message: 'You have been granted Editor access to "Vendor Master Services Agreement - Signed.pdf"',
    timestamp: '5h ago',
    read: true,
    type: 'share',
    link: '/pdfs/pdf-2',
  },
  {
    id: 'n4',
    title: 'Cloud Backup Complete',
    message: 'All 8 documents and 2 spreadsheets safely synchronized to encrypted storage.',
    timestamp: '1d ago',
    read: true,
    type: 'system',
    link: '/dashboard',
  },
];
