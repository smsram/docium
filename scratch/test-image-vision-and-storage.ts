/**
 * DOCIUM Verification Suite: Image Source Resolution, Vision Model Runner,
 * Workspace Storage, and LocalStorage Quota Resilience.
 */

import { saveOriginalFile, getOriginalFile, hasOriginalFile, listStoredWorkspaceSources } from '../src/lib/storage/sourceStorage';
import { executeVisionInspection, getMaxVisionImagesPerRequest } from '../src/lib/ai/vision/visionRunner';
import { inspectSourceImageTool, searchToolCatalogTool } from '../src/lib/ai/tools/catalog';
import { ToolExecutionContext } from '../src/lib/ai/tools/types';
import { buildSharedAgentSystemPrompt } from '../src/lib/ai/agent/systemPrompt';
import { isMetaNarration } from '../src/lib/ai/agent/orchestrator';
import { createSafeWorkspaceStorage } from '../src/lib/storage/safeStorage';
import { parseUploadedFile } from '../src/lib/ai/ingestion/parser';

async function runTestSuite() {
  console.log('================================================================');
  console.log('DOCIUM Image Source Resolution, Vision & Storage Verification');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`  [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${desc}`);
      failed++;
    }
  }

  const workspaceA = `test-ws-alpha-${Date.now()}`;
  const workspaceB = `test-ws-beta-${Date.now()}`;

  // --------------------------------------------------------------------------
  // TEST 1: Original Image Persistence & Canonical Source ID Resolution
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Original Image Storage & Canonical Source Resolution ---');
  const canonicalSourceId = 'src-1794112640814-0';
  const filename = 'WhatsApp Image 2026-11-04 at 11.14.53 AM.jpeg';
  // Small valid 1x1 JPEG buffer for testing
  const sampleJpgBytes = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
    0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
    0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
    0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
    0x00, 0xbf, 0x00, 0xff, 0xd9,
  ]);

  saveOriginalFile(workspaceA, canonicalSourceId, sampleJpgBytes, {
    filename,
    mimeType: 'image/jpeg',
  });

  const resolvedById = getOriginalFile(workspaceA, canonicalSourceId);
  assert(resolvedById !== null, 'getOriginalFile resolves by canonical sourceId');
  assert(resolvedById?.byteLength === sampleJpgBytes.length, 'Retrieved file preserves exact uncorrupted byte length');
  assert(resolvedById?.mimeType === 'image/jpeg', 'Retrieved file preserves exact MIME type');

  const resolvedByName = getOriginalFile(workspaceA, filename);
  assert(resolvedByName !== null, 'getOriginalFile resolves by exact filename');
  assert(resolvedByName?.sourceId === canonicalSourceId, 'Filename resolution returns matching canonical sourceId');

  const storedList = listStoredWorkspaceSources(workspaceA);
  assert(storedList.length === 1 && storedList[0].sourceId === canonicalSourceId, 'listStoredWorkspaceSources lists stored files');

  // --------------------------------------------------------------------------
  // TEST 2: inspect_source_image Execution with Canonical ID and Filename
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: inspect_source_image Tool Execution ---');
  const testContext: ToolExecutionContext = {
    workspaceId: workspaceA,
    workspaceType: 'doc',
    conversationId: 'conv-test-1',
    attachedSources: [
      {
        id: canonicalSourceId,
        title: filename,
        type: 'image',
        mimeType: 'image/jpeg',
        fileSize: `${sampleJpgBytes.length} bytes`,
        status: 'ready',
        chunkCount: 1,
        extractedText: 'Sample diagram OCR header',
        snippet: 'Sample diagram OCR header',
        addedAt: new Date().toISOString(),
        tags: [],
      },
    ],
    conversationHistory: [],
    scratchpad: '',
  };

  const inspectByIdRes = await inspectSourceImageTool.execute({ sourceId: canonicalSourceId }, testContext);
  assert(inspectByIdRes.success === true, 'inspect_source_image succeeds when given canonical sourceId');
  assert(inspectByIdRes.status === 'inspected', 'inspect_source_image returns status: "inspected"');
  assert(inspectByIdRes.sourceId === canonicalSourceId, 'inspect_source_image returns canonical sourceId');

  const inspectByNameRes = await inspectSourceImageTool.execute({ sourceId: filename }, testContext);
  assert(inspectByNameRes.success === true, 'inspect_source_image succeeds when given image filename');

  const inspectByGenericRes = await inspectSourceImageTool.execute({ sourceId: 'image' }, testContext);
  assert(inspectByGenericRes.success === true, 'inspect_source_image succeeds with generic keyword "image" when 1 image is attached');

  // --------------------------------------------------------------------------
  // TEST 3: Multi-Image Inspection (2 to 5 images)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Multi-Image Inspection (2-5 images) ---');
  const multiIds = ['img-1', 'img-2', 'img-3'];
  for (const id of multiIds) {
    saveOriginalFile(workspaceA, id, sampleJpgBytes, {
      filename: `${id}.jpeg`,
      mimeType: 'image/jpeg',
    });
  }

  const multiInspectRes = await inspectSourceImageTool.execute({ sourceIds: multiIds }, testContext);
  assert(multiInspectRes.success === true, 'inspect_source_image successfully inspects multiple images (3 images)');

  // --------------------------------------------------------------------------
  // TEST 4: Image Count Limit Enforcement (> 5 images)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Max Image Count Limit Enforcement ---');
  const sixImages = Array.from({ length: 6 }, (_, i) => ({
    sourceId: `over-limit-${i}`,
    filename: `image-${i}.jpeg`,
    mimeType: 'image/jpeg',
    dataUrl: `data:image/jpeg;base64,${sampleJpgBytes.toString('base64')}`,
    byteLength: sampleJpgBytes.length,
  }));

  const limitRes = await executeVisionInspection(sixImages, 'Inspect all 6 images', {
    providerId: 'cloudflare',
    modelId: '@cf/qwen/qwen3.8-27b',
    apiKey: 'test-token',
    accountId: 'test-account',
  });

  assert(limitRes.success === false, 'executeVisionInspection rejects 6 images when max limit is 5');
  assert(limitRes.errorCategory === 'IMAGE_COUNT_LIMIT_EXCEEDED', 'Returns exact errorCategory: IMAGE_COUNT_LIMIT_EXCEEDED');
  assert(Boolean(limitRes.error?.includes('5 images per request')), 'Error message cites configured limit');

  // --------------------------------------------------------------------------
  // TEST 5: Strict Workspace Isolation (Cross-Workspace Access Blocked)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Strict Workspace Isolation ---');
  const isolatedInB = getOriginalFile(workspaceB, canonicalSourceId);
  assert(isolatedInB === null, 'getOriginalFile in workspace B cannot access file saved in workspace A');

  const contextB: ToolExecutionContext = {
    workspaceId: workspaceB,
    workspaceType: 'doc',
    conversationId: 'conv-test-b',
    attachedSources: [],
    conversationHistory: [],
    scratchpad: '',
  };

  let crossAccessCaught = false;
  try {
    const crossRes = await inspectSourceImageTool.execute({ sourceId: canonicalSourceId }, contextB);
    if (!crossRes.success) {
      crossAccessCaught = true;
    }
  } catch (err: any) {
    if (err?.isSecurityViolation || String(err).includes('boundary')) {
      crossAccessCaught = true;
    }
  }
  assert(crossAccessCaught, 'Cross-workspace image inspection is strictly blocked');

  // --------------------------------------------------------------------------
  // TEST 6: Diagnostic Error Categories
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Diagnostic Error Categories ---');
  // Non-existent source
  const notFoundRes = await inspectSourceImageTool.execute({ sourceId: 'non-existent-source-999' }, testContext);
  assert(notFoundRes.success === false, 'Non-existent source fails');
  assert(notFoundRes.errorCategory === 'SOURCE_NOT_FOUND', 'Returns errorCategory: SOURCE_NOT_FOUND');

  // Empty 0-byte image
  const emptyRes = await executeVisionInspection(
    [
      {
        sourceId: 'empty-img',
        filename: 'empty.jpg',
        mimeType: 'image/jpeg',
        dataUrl: 'data:image/jpeg;base64,',
        byteLength: 0,
      },
    ],
    'inspect',
    { providerId: 'openai', modelId: 'gpt-4o' }
  );
  assert(emptyRes.success === false, '0-byte image fails');
  assert(emptyRes.errorCategory === 'IMAGE_BYTES_EMPTY', 'Returns errorCategory: IMAGE_BYTES_EMPTY');

  // Unsupported image MIME type
  const unsuppRes = await executeVisionInspection(
    [
      {
        sourceId: 'unsupported-doc',
        filename: 'malicious.exe',
        mimeType: 'application/x-msdownload',
        dataUrl: 'data:application/x-msdownload;base64,AA==',
        byteLength: 100,
      },
    ],
    'inspect',
    { providerId: 'openai', modelId: 'gpt-4o' }
  );
  assert(unsuppRes.success === false, 'Unsupported MIME type fails');
  assert(unsuppRes.errorCategory === 'UNSUPPORTED_IMAGE_TYPE', 'Returns errorCategory: UNSUPPORTED_IMAGE_TYPE');

  // --------------------------------------------------------------------------
  // TEST 7: JPG & PNG Upload Parser Resilience
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: Standalone Image Upload & Parser ---');
  const dummyFile = {
    name: 'photo.jpg',
    type: 'image/jpeg',
    size: sampleJpgBytes.length,
    arrayBuffer: async () => sampleJpgBytes.buffer.slice(sampleJpgBytes.byteOffset, sampleJpgBytes.byteOffset + sampleJpgBytes.byteLength),
  } as unknown as File;

  const parsedResult = await parseUploadedFile(dummyFile, 'src-upload-test-1');
  assert(parsedResult.type === 'image', 'Parser identifies image type');
  assert(parsedResult.extractedText.includes('photo.jpg'), 'Parser extracts file metadata and OCR description');
  assert(parsedResult.embeddedImages?.length === 1, 'Parser generates standalone image asset');
  assert(Boolean(parsedResult.embeddedImages?.[0].url.startsWith('data:image/jpeg;base64,')), 'Parser generates uncorrupted base64 data URL');

  // --------------------------------------------------------------------------
  // TEST 8: Safe Persistence Adapter & QuotaExceeded Protection
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 8: Safe Persistence Adapter & LocalStorage Quota Resilience ---');
  let localStorageMock: Record<string, string> = {};
  let quotaTriggered = false;

  // Mock window.localStorage
  (global as any).window = {
    localStorage: {
      getItem: (key: string) => localStorageMock[key] || null,
      setItem: (key: string, val: string) => {
        // If value is > 200KB, simulate QuotaExceededError
        if (val.length > 200 * 1024) {
          quotaTriggered = true;
          const quotaErr = new Error('Setting the value of docium-workspace-storage-v1 exceeded the quota.');
          (quotaErr as any).name = 'QuotaExceededError';
          (quotaErr as any).code = 22;
          throw quotaErr;
        }
        localStorageMock[key] = val;
      },
      removeItem: (key: string) => {
        delete localStorageMock[key];
      },
    },
  };

  const safeStorage = createSafeWorkspaceStorage();

  // Create state with huge base64 data in documentSources that would blow 200KB limit
  const hugeBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(300 * 1024);
  const largeState = {
    state: {
      documentSources: {
        'doc-1': [
          {
            id: 'src-large-1',
            title: 'Large Diagram.jpg',
            extractedImages: [{ id: 'img-1', url: hugeBase64 }],
          },
        ],
      },
      documentConversations: {
        'doc-1': [
          {
            id: 'conv-1',
            messages: Array.from({ length: 30 }, (_, i) => ({
              id: `msg-${i}`,
              role: 'user',
              content: `Message ${i} content`,
            })),
          },
        ],
      },
    },
    version: 1,
  };

  let didCrash = false;
  try {
    safeStorage.setItem('docium-workspace-storage-v1', JSON.stringify(largeState));
  } catch {
    didCrash = true;
  }

  assert(!didCrash, 'safeStorage.setItem does NOT crash on QuotaExceededError');
  assert(quotaTriggered, 'QuotaExceededError was triggered and intercepted');

  const savedPruned = (safeStorage.getItem('docium-workspace-storage-v1') as string | null);
  assert(savedPruned !== null, 'Pruned state was saved successfully to localStorage');
  const parsedPruned = JSON.parse(savedPruned!);
  assert(
    parsedPruned.state.documentSources['doc-1'][0].extractedImages[0].url === '[stored:img-1]',
    'Heavy base64 was safely pruned from localStorage while preserving documentSources'
  );
  assert(
    parsedPruned.state.documentConversations['doc-1'][0].messages.length <= 10,
    'Message history pruned to recent 10 messages for localStorage'
  );

  // --------------------------------------------------------------------------
  // TEST 9: System Prompt & Canonical Source IDs
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 9: Shared Agent System Prompt with Attached Images ---');
  const promptOutput = buildSharedAgentSystemPrompt({
    workspaceId: workspaceA,
    workspaceType: 'doc',
    attachedSources: [
      {
        id: canonicalSourceId,
        title: filename,
        type: 'image',
        mimeType: 'image/jpeg',
        fileSize: '120 KB',
        status: 'ready',
        chunkCount: 1,
        snippet: 'Sample snippet',
        addedAt: new Date().toISOString(),
        tags: [],
      },
    ],
    currentScratchpad: '',
  });

  assert(promptOutput.includes(canonicalSourceId), 'System prompt includes canonical sourceId');
  assert(promptOutput.includes(filename), 'System prompt includes original filename');
  assert(promptOutput.includes('Call "inspect_source_image" with sourceId: "src-1794112640814-0"'), 'System prompt instructs agent to call inspect_source_image with canonical ID');

  // --------------------------------------------------------------------------
  // TEST 10: Meta-Narration Filtering
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 10: Meta-Narration Filtering in Working UI ---');
  assert(isMetaNarration('Let me search for tools to inspect this image') === true, 'Filters "Let me search for tools..."');
  assert(isMetaNarration('Let me first list the sources') === true, 'Filters "Let me first list the sources"');
  assert(isMetaNarration('I will now inspect the image') === true, 'Filters "I will now inspect the image"');
  assert(isMetaNarration('I have identified the target page and am updating its content') === false, 'Allows natural step updates');

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
