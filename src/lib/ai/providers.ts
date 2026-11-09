import { ProviderId, ModelOption, ModelCapability, ProviderConfig, IntegrationCategory } from '@/lib/types';

export interface ProviderCatalogItem {
  id: ProviderId;
  name: string;
  category: IntegrationCategory;
  description: string;
  defaultBaseUrl?: string;
  models: ModelOption[];
  requiresApiKey: boolean;
  supportsCustomBaseUrl: boolean;
  docsUrl: string;
}

export const PROVIDER_CATALOG: ProviderCatalogItem[] = [
  // ==========================================
  // AI REASONING PROVIDERS
  // ==========================================
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    category: 'ai',
    description: 'Premier reasoning, nuanced long-form prose synthesis, and code generation.',
    requiresApiKey: true,
    supportsCustomBaseUrl: false,
    docsUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet (Recommended)',
        capabilities: {
          contextWindow: '200k tokens',
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: true,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Highest capability model for deep document architecture and complex reasoning.',
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        capabilities: {
          contextWindow: '200k tokens',
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: false,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Ultra-fast, cost-effective intelligence for quick edits and summaries.',
      },
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        capabilities: {
          contextWindow: '200k tokens',
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: true,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Deep analytical synthesis and complex multi-domain document evaluation.',
      },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    category: 'ai',
    description: 'Multimodal GPT-4o, structured outputs, and deep reasoning models.',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresApiKey: true,
    supportsCustomBaseUrl: true,
    docsUrl: 'https://platform.openai.com/api-keys',
    models: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o Omnimodal',
        capabilities: {
          contextWindow: '128k tokens',
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: true,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Flagship omnimodal model for complex documents, spreadsheets and images.',
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        capabilities: {
          contextWindow: '128k tokens',
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: false,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Affordable, fast intelligence for everyday document tasks.',
      },
      {
        id: 'o3-mini',
        name: 'o3-mini (Reasoning)',
        capabilities: {
          contextWindow: '200k tokens',
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: true,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Deep mathematical, algorithmic and financial formula reasoning.',
      },
      {
        id: 'o1',
        name: 'o1 Deep Reasoning',
        capabilities: {
          contextWindow: '200k tokens',
          supportsVision: true,
          supportsTools: false,
          supportsStreaming: true,
          reasoning: true,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'State-of-the-art chain-of-thought reasoning for hard scientific writing.',
      },
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    category: 'ai',
    description: 'Up to 2-million token context window for massive documents and book-length research.',
    requiresApiKey: true,
    supportsCustomBaseUrl: false,
    docsUrl: 'https://aistudio.google.com/app/apikey',
    models: [
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash (Latest)',
        capabilities: {
          contextWindow: '1M tokens',
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: true,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Next-gen frontier speed and high-fidelity multimodal understanding.',
      },
      {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        capabilities: {
          contextWindow: '1M tokens',
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: true,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Real-time conversational speed with native multimodal tool usage.',
      },
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro (2M Context)',
        capabilities: {
          contextWindow: '2M tokens',
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: true,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Massive context ingest — read entire codebases or 500-page PDF reports.',
      },
      {
        id: 'gemini-1.5-flash',
        name: 'Gemini 1.5 Flash',
        capabilities: {
          contextWindow: '1M tokens',
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: false,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Sub-second latency with extensive context capacity.',
      },
    ],
  },
  {
    id: 'groq',
    name: 'Groq (Ultra-Fast LPU)',
    category: 'ai',
    description: 'Hardware-accelerated open weights at 500+ tokens per second for zero-latency drafting.',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    requiresApiKey: true,
    supportsCustomBaseUrl: false,
    docsUrl: 'https://console.groq.com/keys',
    models: [
      {
        id: 'llama-3.2-11b-vision-preview',
        name: 'Llama 3.2 11B Vision (Fastest)',
        capabilities: {
          contextWindow: '128k tokens',
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: false,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Ultra-fast multimodal vision and text reasoning on Groq LPUs.',
      },
      {
        id: 'llama-3.2-90b-vision-preview',
        name: 'Llama 3.2 90B Vision',
        capabilities: {
          contextWindow: '128k tokens',
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: true,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Frontier 90B multimodal model with deep visual chart and document comprehension.',
      },
      {
        id: 'llama-3.3-70b-versatile',
        name: 'Llama 3.3 70B Versatile (Text Only)',
        capabilities: {
          contextWindow: '128k tokens',
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: true,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'State of the art open model operating at blinding speed on Groq LPUs.',
      },
      {
        id: 'deepseek-r1-distill-llama-70b',
        name: 'DeepSeek R1 Distill Llama 70B',
        capabilities: {
          contextWindow: '128k tokens',
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: true,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Specialized chain-of-thought mathematical reasoning model.',
      },
      {
        id: 'mixtral-8x7b-32768',
        name: 'Mixtral 8x7B 32k',
        capabilities: {
          contextWindow: '32k tokens',
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: false,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Fast mixture-of-experts model for versatile drafting and summarization.',
      },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    category: 'ai',
    description: 'Unified gateway to 100+ AI models across Anthropic, Meta, DeepSeek, Mistral, and more.',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    requiresApiKey: true,
    supportsCustomBaseUrl: false,
    docsUrl: 'https://openrouter.ai/keys',
    models: [
      {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet (via OpenRouter)',
        capabilities: {
          contextWindow: '200k tokens',
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: true,
          supportsText: true,
          supportsStructuredOutput: true,
        },
      },
      {
        id: 'deepseek/deepseek-r1',
        name: 'DeepSeek R1 (Open Weights)',
        capabilities: {
          contextWindow: '64k tokens',
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: true,
          supportsText: true,
          supportsStructuredOutput: true,
        },
      },
      {
        id: 'meta-llama/llama-3.3-70b-instruct',
        name: 'Llama 3.3 70B Instruct',
        capabilities: {
          contextWindow: '128k tokens',
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: false,
          supportsText: true,
          supportsStructuredOutput: true,
        },
      },
      {
        id: 'meta-llama/llama-3.2-11b-vision-instruct',
        name: 'Llama 3.2 11B Vision (OpenRouter)',
        capabilities: {
          contextWindow: '128k tokens',
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: false,
          supportsText: true,
          supportsStructuredOutput: true,
        },
      },
      {
        id: 'google/gemini-2.0-flash-exp:free',
        name: 'Gemini 2.0 Flash (Free Gateway)',
        capabilities: {
          contextWindow: '1M tokens',
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: true,
          supportsText: true,
          supportsStructuredOutput: true,
        },
      },
    ],
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare Workers AI',
    category: 'ai',
    description: 'Serverless global GPU network with zero cold starts and privacy-compliant edge compute.',
    defaultBaseUrl: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1',
    requiresApiKey: true,
    supportsCustomBaseUrl: true,
    docsUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    models: [
      {
        id: '@cf/qwen/qwen3.8-27b',
        name: 'Qwen 3.8 27B',
        capabilities: {
          contextWindow: '32k tokens',
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: true,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'High-capability multi-task multilingual reasoning model on Cloudflare edge with verified vision and image understanding.',
      },
      {
        id: '@cf/google/gemma-4-26b-a4b-it',
        name: 'Gemma 4 26B A4B IT',
        capabilities: {
          contextWindow: '32k tokens',
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: true,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Google Gemma-series instruction tuned model optimized for Cloudflare edge.',
      },
      {
        id: '@cf/meta/llama-4-scout-17b-16e-instruct',
        name: 'Llama 4 Scout 17B 16E Instruct',
        capabilities: {
          contextWindow: '64k tokens',
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: true,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Next-gen Meta Llama 4 architecture running on Workers AI.',
      },
      {
        id: '@cf/mistralai/mistral-small-3.1-24b-instruct',
        name: 'Mistral Small 3.1 24B Instruct',
        capabilities: {
          contextWindow: '32k tokens',
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: true,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Enterprise-grade reasoning and reasoning-focused document drafting.',
      },
      {
        id: '@cf/zai-org/glm-4.7-flash',
        name: 'GLM 4.7 Flash',
        capabilities: {
          contextWindow: '32k tokens',
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: false,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Ultra-fast sub-second edge model for high throughput editing.',
      },
      {
        id: '@cf/moondream/moondream3.1-9B-A2B',
        name: 'Moondream 3.1 9B A2B (Vision)',
        capabilities: {
          contextWindow: '8k tokens',
          supportsVision: true,
          supportsTools: false,
          supportsStreaming: true,
          reasoning: false,
          supportsText: true,
          supportsStructuredOutput: false,
        },
        description: 'Edge-native compact vision model for image inspection and document OCR.',
      },
      {
        id: '@cf/meta/llama-3.2-11b-vision-instruct',
        name: 'Llama 3.2 11B Vision Instruct',
        capabilities: {
          contextWindow: '128k tokens',
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: false,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Multimodal vision and text model running on Cloudflare GPUs.',
      },
      {
        id: '@cf/meta/llama-3.1-70b-instruct',
        name: 'Llama 3.1 70B Instruct (Edge)',
        capabilities: {
          contextWindow: '128k tokens',
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: false,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Flagship open weight model hosted on Cloudflare global edge.',
      },
      {
        id: '@cf/mistral/mistral-7b-instruct-v0.2',
        name: 'Mistral 7B Instruct',
        capabilities: {
          contextWindow: '32k tokens',
          supportsVision: false,
          supportsTools: false,
          supportsStreaming: true,
          reasoning: false,
          supportsText: true,
          supportsStructuredOutput: false,
        },
        description: 'Efficient open model for rapid text transformation.',
      },
      {
        id: '@cf/qwen/qwen3-embedding-0.6b',
        name: 'Qwen 3 Embedding 0.6B',
        capabilities: {
          contextWindow: '8k tokens',
          supportsVision: false,
          supportsTools: false,
          supportsStreaming: false,
          reasoning: false,
          supportsText: false,
          supportsEmbeddings: true,
        },
        description: 'Multilingual text vector embeddings on Cloudflare edge.',
      },
      {
        id: '@cf/baai/bge-m3',
        name: 'BAAI BGE-M3 (Embeddings)',
        capabilities: {
          contextWindow: '8k tokens',
          supportsVision: false,
          supportsTools: false,
          supportsStreaming: false,
          reasoning: false,
          supportsText: false,
          supportsEmbeddings: true,
        },
        description: 'Versatile dense, sparse, and multi-vector search embeddings.',
      },
      {
        id: '@cf/google/embeddinggemma-300m',
        name: 'Embedding Gemma 300M',
        capabilities: {
          contextWindow: '4k tokens',
          supportsVision: false,
          supportsTools: false,
          supportsStreaming: false,
          reasoning: false,
          supportsText: false,
          supportsEmbeddings: true,
        },
        description: 'Compact Google Gemma vector embeddings for fast similarity indexing.',
      },
    ],
  },
  {
    id: 'huggingface',
    name: 'Hugging Face Inference',
    category: 'ai',
    description: 'Serverless Inference API and Dedicated Inference Endpoints with tens of thousands of open models.',
    defaultBaseUrl: 'https://router.huggingface.co/hf-inference/v1',
    requiresApiKey: true,
    supportsCustomBaseUrl: true,
    docsUrl: 'https://huggingface.co/settings/tokens',
    models: [
      {
        id: 'meta-llama/Llama-3.3-70B-Instruct',
        name: 'Llama 3.3 70B Instruct',
        capabilities: {
          contextWindow: '128k tokens',
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: false,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Meta flagship open weights hosted via Hugging Face Serverless Router.',
      },
      {
        id: 'deepseek-ai/DeepSeek-R1',
        name: 'DeepSeek R1',
        capabilities: {
          contextWindow: '64k tokens',
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: true,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Open reasoning model for multi-step logic and mathematical analysis.',
      },
      {
        id: 'mistralai/Mistral-Small-24B-Instruct-2501',
        name: 'Mistral Small 24B Instruct',
        capabilities: {
          contextWindow: '32k tokens',
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: true,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Highly capable multilingual reasoning model.',
      },
      {
        id: 'Qwen/Qwen2-VL-7B-Instruct',
        name: 'Qwen 2 VL 7B Instruct (Vision)',
        capabilities: {
          contextWindow: '32k tokens',
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: true,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Advanced open weights multimodal vision-language model on Hugging Face.',
      },
      {
        id: 'Qwen/Qwen2.5-72B-Instruct',
        name: 'Qwen 2.5 72B Instruct',
        capabilities: {
          contextWindow: '128k tokens',
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: true,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'State of the art coding and mathematical open weights.',
      },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama (Local & Air-Gapped)',
    category: 'ai',
    description: 'Run completely private open-source models directly on your hardware without internet access.',
    defaultBaseUrl: 'http://localhost:11434',
    requiresApiKey: false,
    supportsCustomBaseUrl: true,
    docsUrl: 'https://ollama.com/',
    models: [
      {
        id: 'llama3.2-vision',
        name: 'Llama 3.2 Vision (Local Multimodal)',
        capabilities: {
          contextWindow: '128k tokens',
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: false,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Native multimodal vision and image understanding running entirely on local GPU/CPU.',
      },
      {
        id: 'llava',
        name: 'LLaVA (Visual Assistant)',
        capabilities: {
          contextWindow: '32k tokens',
          supportsVision: true,
          supportsTools: false,
          supportsStreaming: true,
          reasoning: false,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Local visual instruction tuning model for deep image inspection and OCR.',
      },
      {
        id: 'llama3.2',
        name: 'Llama 3.2 (Local)',
        capabilities: {
          contextWindow: '128k tokens',
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: false,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Fast local model running entirely in local memory with zero external requests.',
      },
      {
        id: 'deepseek-r1',
        name: 'DeepSeek R1 (Local Reasoner)',
        capabilities: {
          contextWindow: '32k tokens',
          supportsVision: false,
          supportsTools: false,
          supportsStreaming: true,
          reasoning: true,
          supportsText: true,
          supportsStructuredOutput: false,
        },
        description: 'Local chain-of-thought reasoning with zero external telemetry.',
      },
      {
        id: 'qwen2.5-coder',
        name: 'Qwen 2.5 Coder',
        capabilities: {
          contextWindow: '32k tokens',
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: false,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Local code and technical document specialist.',
      },
      {
        id: 'mistral',
        name: 'Mistral 7B (Local)',
        capabilities: {
          contextWindow: '32k tokens',
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: false,
          supportsText: true,
          supportsStructuredOutput: true,
        },
        description: 'Reliable general purpose local model.',
      },
    ],
  },
  {
    id: 'custom',
    name: 'Custom OpenAI-Compatible Endpoint',
    category: 'ai',
    description: 'Connect any OpenAI-standard endpoint: vLLM, LM Studio, LocalAI, Jan, or LiteLLM proxy.',
    defaultBaseUrl: 'http://localhost:8000/v1',
    requiresApiKey: false,
    supportsCustomBaseUrl: true,
    docsUrl: 'https://github.com/vllm-project/vllm',
    models: [
      {
        id: 'custom-model',
        name: 'Custom Defined Model',
        capabilities: {
          contextWindow: 'Custom',
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true,
          reasoning: true,
          supportsText: true,
          supportsStructuredOutput: true,
        },
      },
    ],
  },

  // ==========================================
  // INTERNET SEARCH PROVIDERS
  // ==========================================
  {
    id: 'brave',
    name: 'Brave Search',
    category: 'search',
    description: 'Independent, privacy-first search index with high freshness and clean markdown extracts.',
    defaultBaseUrl: 'https://api.search.brave.com/res/v1/web/search',
    requiresApiKey: true,
    supportsCustomBaseUrl: false,
    docsUrl: 'https://brave.com/search/api/',
    models: [
      {
        id: 'brave-web',
        name: 'Brave Web Search API',
        capabilities: {
          contextWindow: 'N/A',
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: false,
          reasoning: false,
        },
      },
    ],
  },
  {
    id: 'tavily',
    name: 'Tavily Search',
    category: 'search',
    description: 'AI-native search engine designed specifically for LLM research, summaries, and fact extraction.',
    defaultBaseUrl: 'https://api.tavily.com',
    requiresApiKey: true,
    supportsCustomBaseUrl: false,
    docsUrl: 'https://tavily.com/',
    models: [
      {
        id: 'tavily-search',
        name: 'Tavily Search & Research',
        capabilities: {
          contextWindow: 'N/A',
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: false,
          reasoning: false,
        },
      },
    ],
  },
  {
    id: 'serper',
    name: 'Serper (Google Search)',
    category: 'search',
    description: 'Fast, structured Google Search and Google Images results API.',
    defaultBaseUrl: 'https://google.serper.dev',
    requiresApiKey: true,
    supportsCustomBaseUrl: false,
    docsUrl: 'https://serper.dev/',
    models: [
      {
        id: 'serper-google',
        name: 'Google Search & Images',
        capabilities: {
          contextWindow: 'N/A',
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: false,
          reasoning: false,
        },
      },
    ],
  },
  {
    id: 'serpapi',
    name: 'SerpApi',
    category: 'search',
    description: 'Real-time search scraping engine covering Google, Bing, Yahoo, and DuckDuckGo.',
    defaultBaseUrl: 'https://serpapi.com',
    requiresApiKey: true,
    supportsCustomBaseUrl: false,
    docsUrl: 'https://serpapi.com/',
    models: [
      {
        id: 'serpapi-universal',
        name: 'Universal Search Engine',
        capabilities: {
          contextWindow: 'N/A',
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: false,
          reasoning: false,
        },
      },
    ],
  },
  {
    id: 'searxng',
    name: 'SearXNG (Self-Hosted Privacy)',
    category: 'search',
    description: 'Open-source metasearch engine combining results from 70+ search services without tracking.',
    defaultBaseUrl: 'http://localhost:8080',
    requiresApiKey: false,
    supportsCustomBaseUrl: true,
    docsUrl: 'https://docs.searxng.org/',
    models: [
      {
        id: 'searxng-local',
        name: 'Local SearXNG Instance',
        capabilities: {
          contextWindow: 'N/A',
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: false,
          reasoning: false,
        },
      },
    ],
  },

  // ==========================================
  // IMAGE GENERATION PROVIDERS
  // ==========================================
  {
    id: 'google-imagen',
    name: 'Google AI Studio (Imagen 3)',
    category: 'image',
    description: "Google's highest quality text-to-image model with photorealism and crisp typography.",
    requiresApiKey: true,
    supportsCustomBaseUrl: false,
    docsUrl: 'https://aistudio.google.com/',
    models: [
      {
        id: 'imagen-3.0-generate-002',
        name: 'Imagen 3 (Photorealistic)',
        capabilities: {
          contextWindow: 'N/A',
          supportsVision: true,
          supportsTools: false,
          supportsStreaming: false,
          reasoning: false,
        },
      },
    ],
  },
  {
    id: 'cloudflare-flux',
    name: 'Cloudflare Workers AI (FLUX)',
    category: 'image',
    description: 'Serverless FLUX.1 Schnell image generation running on Cloudflare global GPU network.',
    defaultBaseUrl: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run',
    requiresApiKey: true,
    supportsCustomBaseUrl: true,
    docsUrl: 'https://dash.cloudflare.com/',
    models: [
      {
        id: '@cf/black-forest-labs/flux-1-schnell',
        name: 'FLUX.1 Schnell (Fast Edge)',
        capabilities: {
          contextWindow: 'N/A',
          supportsVision: true,
          supportsTools: false,
          supportsStreaming: false,
          reasoning: false,
        },
      },
    ],
  },
  {
    id: 'stability',
    name: 'Stability AI',
    category: 'image',
    description: 'Creators of Stable Diffusion 3.5 Large and SDXL for high-resolution document visuals.',
    defaultBaseUrl: 'https://api.stability.ai/v2beta/stable-image/generate/core',
    requiresApiKey: true,
    supportsCustomBaseUrl: false,
    docsUrl: 'https://platform.stability.ai/',
    models: [
      {
        id: 'sd3.5-large',
        name: 'Stable Diffusion 3.5 Large',
        capabilities: {
          contextWindow: 'N/A',
          supportsVision: true,
          supportsTools: false,
          supportsStreaming: false,
          reasoning: false,
        },
      },
      {
        id: 'sdxl-1.0',
        name: 'SDXL 1.0',
        capabilities: {
          contextWindow: 'N/A',
          supportsVision: true,
          supportsTools: false,
          supportsStreaming: false,
          reasoning: false,
        },
      },
    ],
  },
  {
    id: 'fal',
    name: 'fal.ai',
    category: 'image',
    description: 'Sub-second inference platform for state-of-the-art FLUX.1 and Recraft generation.',
    defaultBaseUrl: 'https://queue.fal.run',
    requiresApiKey: true,
    supportsCustomBaseUrl: false,
    docsUrl: 'https://fal.ai/dashboard/keys',
    models: [
      {
        id: 'fal-ai/flux/dev',
        name: 'FLUX.1 [dev]',
        capabilities: {
          contextWindow: 'N/A',
          supportsVision: true,
          supportsTools: false,
          supportsStreaming: false,
          reasoning: false,
        },
      },
      {
        id: 'fal-ai/recraft-v3',
        name: 'Recraft v3 (Vector & Graphic Art)',
        capabilities: {
          contextWindow: 'N/A',
          supportsVision: true,
          supportsTools: false,
          supportsStreaming: false,
          reasoning: false,
        },
      },
    ],
  },
  {
    id: 'replicate',
    name: 'Replicate',
    category: 'image',
    description: 'Run open-source machine learning models with a cloud API, featuring FLUX and SDXL.',
    defaultBaseUrl: 'https://api.replicate.com/v1',
    requiresApiKey: true,
    supportsCustomBaseUrl: false,
    docsUrl: 'https://replicate.com/account/api-tokens',
    models: [
      {
        id: 'black-forest-labs/flux-1.1-pro',
        name: 'FLUX 1.1 Pro',
        capabilities: {
          contextWindow: 'N/A',
          supportsVision: true,
          supportsTools: false,
          supportsStreaming: false,
          reasoning: false,
        },
      },
      {
        id: 'stability-ai/sdxl',
        name: 'SDXL',
        capabilities: {
          contextWindow: 'N/A',
          supportsVision: true,
          supportsTools: false,
          supportsStreaming: false,
          reasoning: false,
        },
      },
    ],
  },
  {
    id: 'together',
    name: 'Together AI',
    category: 'image',
    description: 'Fast cloud compute for open source image generation and fine-tuned models.',
    defaultBaseUrl: 'https://api.together.xyz/v1',
    requiresApiKey: true,
    supportsCustomBaseUrl: false,
    docsUrl: 'https://api.together.ai/settings/api-keys',
    models: [
      {
        id: 'black-forest-labs/FLUX.1-schnell-Free',
        name: 'FLUX.1 Schnell',
        capabilities: {
          contextWindow: 'N/A',
          supportsVision: true,
          supportsTools: false,
          supportsStreaming: false,
          reasoning: false,
        },
      },
      {
        id: 'stabilityai/stable-diffusion-xl-base-1.0',
        name: 'SDXL Base 1.0',
        capabilities: {
          contextWindow: 'N/A',
          supportsVision: true,
          supportsTools: false,
          supportsStreaming: false,
          reasoning: false,
        },
      },
    ],
  },
];

export const INITIAL_PROVIDER_CONFIGS: Record<ProviderId, ProviderConfig> = {
  // AI
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    category: 'ai',
    enabled: true,
    apiKey: '',
    selectedModel: 'claude-3-5-sonnet-20241022',
    status: 'unconfigured',
    isAdded: true,
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    category: 'ai',
    enabled: true,
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    selectedModel: 'gpt-4o',
    status: 'unconfigured',
    isAdded: true,
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    category: 'ai',
    enabled: true,
    apiKey: '',
    selectedModel: 'gemini-2.0-flash',
    status: 'unconfigured',
    isAdded: true,
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    category: 'ai',
    enabled: false,
    apiKey: '',
    baseUrl: 'https://api.groq.com/openai/v1',
    selectedModel: 'llama-3.2-11b-vision-preview',
    status: 'unconfigured',
    isAdded: false,
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    category: 'ai',
    enabled: false,
    apiKey: '',
    baseUrl: 'https://openrouter.ai/api/v1',
    selectedModel: 'anthropic/claude-3.5-sonnet',
    status: 'unconfigured',
    isAdded: false,
  },
  cloudflare: {
    id: 'cloudflare',
    name: 'Cloudflare Workers AI',
    category: 'ai',
    enabled: false,
    apiKey: '',
    baseUrl: '',
    selectedModel: '@cf/qwen/qwen3.8-27b',
    status: 'unconfigured',
    isAdded: false,
  },
  huggingface: {
    id: 'huggingface',
    name: 'Hugging Face Inference',
    category: 'ai',
    enabled: false,
    apiKey: '',
    baseUrl: 'https://api-inference.huggingface.co/models',
    selectedModel: 'Qwen/Qwen2-VL-7B-Instruct',
    status: 'unconfigured',
    isAdded: false,
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (Local)',
    category: 'ai',
    enabled: true,
    apiKey: '',
    baseUrl: 'http://localhost:11434',
    selectedModel: 'llama3.2-vision',
    status: 'unconfigured',
    isAdded: true,
  },
  custom: {
    id: 'custom',
    name: 'Custom Endpoint',
    category: 'ai',
    enabled: false,
    apiKey: '',
    baseUrl: 'http://localhost:8000/v1',
    selectedModel: 'custom-model',
    status: 'unconfigured',
    isAdded: false,
  },

  // Search
  brave: {
    id: 'brave',
    name: 'Brave Search',
    category: 'search',
    enabled: false,
    apiKey: '',
    baseUrl: 'https://api.search.brave.com/res/v1/web/search',
    selectedModel: 'brave-web',
    status: 'unconfigured',
    isAdded: false,
  },
  tavily: {
    id: 'tavily',
    name: 'Tavily Search',
    category: 'search',
    enabled: false,
    apiKey: '',
    baseUrl: 'https://api.tavily.com',
    selectedModel: 'tavily-search',
    status: 'unconfigured',
    isAdded: false,
  },
  serper: {
    id: 'serper',
    name: 'Serper (Google Search)',
    category: 'search',
    enabled: false,
    apiKey: '',
    baseUrl: 'https://google.serper.dev',
    selectedModel: 'serper-google',
    status: 'unconfigured',
    isAdded: false,
  },
  serpapi: {
    id: 'serpapi',
    name: 'SerpApi',
    category: 'search',
    enabled: false,
    apiKey: '',
    baseUrl: 'https://serpapi.com',
    selectedModel: 'serpapi-universal',
    status: 'unconfigured',
    isAdded: false,
  },
  searxng: {
    id: 'searxng',
    name: 'SearXNG',
    category: 'search',
    enabled: false,
    apiKey: '',
    baseUrl: 'http://localhost:8080',
    selectedModel: 'searxng-local',
    status: 'unconfigured',
    isAdded: false,
  },

  // Image
  'google-imagen': {
    id: 'google-imagen',
    name: 'Google AI Studio (Imagen 3)',
    category: 'image',
    enabled: false,
    apiKey: '',
    selectedModel: 'imagen-3.0-generate-002',
    status: 'unconfigured',
    isAdded: false,
  },
  'cloudflare-flux': {
    id: 'cloudflare-flux',
    name: 'Cloudflare Workers AI (FLUX)',
    category: 'image',
    enabled: false,
    apiKey: '',
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run',
    selectedModel: '@cf/black-forest-labs/flux-1-schnell',
    status: 'unconfigured',
    isAdded: false,
  },
  stability: {
    id: 'stability',
    name: 'Stability AI',
    category: 'image',
    enabled: false,
    apiKey: '',
    baseUrl: 'https://api.stability.ai/v2beta/stable-image/generate/core',
    selectedModel: 'sd3.5-large',
    status: 'unconfigured',
    isAdded: false,
  },
  fal: {
    id: 'fal',
    name: 'fal.ai',
    category: 'image',
    enabled: false,
    apiKey: '',
    baseUrl: 'https://queue.fal.run',
    selectedModel: 'fal-ai/flux/dev',
    status: 'unconfigured',
    isAdded: false,
  },
  replicate: {
    id: 'replicate',
    name: 'Replicate',
    category: 'image',
    enabled: false,
    apiKey: '',
    baseUrl: 'https://api.replicate.com/v1',
    selectedModel: 'black-forest-labs/flux-1.1-pro',
    status: 'unconfigured',
    isAdded: false,
  },
  together: {
    id: 'together',
    name: 'Together AI',
    category: 'image',
    enabled: false,
    apiKey: '',
    baseUrl: 'https://api.together.xyz/v1',
    selectedModel: 'black-forest-labs/FLUX.1-schnell-Free',
    status: 'unconfigured',
    isAdded: false,
  },
};

/**
 * Returns the catalog item for a given provider ID.
 */
export function getProviderCatalogItem(providerId: ProviderId): ProviderCatalogItem | undefined {
  return PROVIDER_CATALOG.find((p) => p.id === providerId);
}

/**
 * Resolves all models available for a provider:
 * Static catalog models + manually entered customModels + dynamically discoveredModels.
 */
export function getProviderModels(providerId: ProviderId, providerConfig?: ProviderConfig): ModelOption[] {
  const catalogItem = getProviderCatalogItem(providerId);
  const catalogModels = catalogItem?.models || [];
  const customModels = providerConfig?.customModels || [];
  const discoveredModels = providerConfig?.discoveredModels || [];

  const seenIds = new Set<string>();
  const combined: ModelOption[] = [];

  for (const m of [...catalogModels, ...customModels, ...discoveredModels]) {
    if (!seenIds.has(m.id)) {
      seenIds.add(m.id);
      combined.push(m);
    }
  }

  return combined;
}

/**
 * Resolves vision-capable chat models strictly for Docium AI conversations.
 * Filters out text-only, embedding-only, and non-vision models.
 */
export function getChatVisionModels(providerId?: ProviderId, providerConfig?: ProviderConfig): ModelOption[] {
  if (providerId) {
    const models = getProviderModels(providerId, providerConfig);
    return models.filter(
      (m) =>
        m.capabilities.supportsVision === true &&
        !m.capabilities.supportsEmbeddings &&
        m.capabilities.supportsText === true
    );
  }

  const allVisionModels: ModelOption[] = [];
  for (const p of PROVIDER_CATALOG) {
    for (const m of p.models) {
      if (
        m.capabilities.supportsVision === true &&
        !m.capabilities.supportsEmbeddings &&
        m.capabilities.supportsText === true
      ) {
        allVisionModels.push(m);
      }
    }
  }
  return allVisionModels;
}

/**
 * Checks if a specific model supports vision/image input.
 */
export function isVisionCapableModel(
  modelId: string,
  providerId?: ProviderId,
  providerConfig?: ProviderConfig
): boolean {
  const meta = getModelById(modelId, providerId, providerConfig);
  if (meta) {
    return Boolean(meta.capabilities?.supportsVision);
  }
  // Fall back to capability inference
  const inferred = inferModelCapabilities(modelId);
  return inferred.supportsVision;
}

/**
 * Finds a model by ID across catalog, custom, and discovered sets.
 */
export function getModelById(
  modelId: string,
  providerId?: ProviderId,
  providerConfig?: ProviderConfig
): ModelOption | undefined {
  if (providerId) {
    const list = getProviderModels(providerId, providerConfig);
    const found = list.find((m) => m.id === modelId);
    if (found) return found;
  }

  for (const item of PROVIDER_CATALOG) {
    const found = item.models.find((m) => m.id === modelId);
    if (found) return found;
  }

  return undefined;
}

/**
 * Automatically infers reasonable capabilities for dynamically discovered models.
 */
export function inferModelCapabilities(modelId: string, name?: string): ModelCapability {
  const lower = `${modelId} ${name || ''}`.toLowerCase();
  const isEmbedding = lower.includes('embed') || lower.includes('bge-') || lower.includes('e5-');
  const isVision =
    !isEmbedding &&
    (lower.includes('vision') ||
      lower.includes('qwen3.8') ||
      lower.includes('qwen-vl') ||
      lower.includes('qwen2-vl') ||
      lower.includes('qwen2.5-vl') ||
      lower.includes('-vl') ||
      lower.includes('vl-') ||
      lower.includes('omni') ||
      lower.includes('4o') ||
      lower.includes('gemini') ||
      lower.includes('claude-3-5-sonnet') ||
      lower.includes('claude-3-opus') ||
      lower.includes('llava') ||
      lower.includes('minicpm-v') ||
      lower.includes('pixtral') ||
      lower.includes('bakllava') ||
      lower.includes('moondream') ||
      lower.includes('internvl'));
  const isReasoning =
    lower.includes('r1') ||
    lower.includes('reason') ||
    lower.includes('o1') ||
    lower.includes('o3') ||
    lower.includes('thinking');

  return {
    contextWindow: lower.includes('1m') || lower.includes('2m') ? '1M+ tokens' : lower.includes('128k') ? '128k tokens' : '32k-128k tokens',
    supportsVision: isVision,
    supportsTools: !isEmbedding,
    supportsStreaming: !isEmbedding,
    reasoning: isReasoning,
    supportsText: !isEmbedding,
    supportsEmbeddings: isEmbedding,
    supportsStructuredOutput: !isEmbedding,
  };
}
