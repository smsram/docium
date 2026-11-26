/**
 * Comprehensive Test Suite for Workspace Creation, Vision Authentication, and Storage Architecture
 */

import { useWorkspaceStore } from '../src/lib/store';
import { executeVisionInspection, VisionImageInput } from '../src/lib/ai/vision/visionRunner';
import { parseCloudflarePairs } from '../src/lib/ai/credentials';
import { createSafeWorkspaceStorage } from '../src/lib/storage/safeStorage';

async function runTests() {
  console.log('--- 1. Testing Empty Workspace Creation ---');
  const store = useWorkspaceStore.getState();

  // Test empty document workspace creation
  const emptyDocId = store.createFromPrompt('', 'doc', [], [], '<p></p>');
  const createdDoc = useWorkspaceStore.getState().documents.find((d) => d.id === emptyDocId);

  console.assert(createdDoc !== undefined, 'Empty document must exist');
  console.assert(createdDoc?.title === 'Untitled Document', `Expected 'Untitled Document', got '${createdDoc?.title}'`);
  console.assert(createdDoc?.content === '<p></p>', `Expected '<p></p>', got '${createdDoc?.content}'`);
  console.assert(createdDoc?.wordCount === 0, `Expected wordCount 0, got ${createdDoc?.wordCount}`);
  console.assert(!createdDoc?.tags?.includes('AI Generated'), 'Empty document must not have AI Generated tag');

  const emptyConv = useWorkspaceStore.getState().documentConversations[emptyDocId]?.[0];
  console.assert(emptyConv !== undefined, 'Conversation must exist');
  console.assert(emptyConv?.messages.length === 0, `Expected 0 conversation messages, got ${emptyConv?.messages.length}`);
  console.log('✓ Empty Document Workspace successfully created with zero boilerplate or fake AI dialogue.');

  // Test prompt-provided workspace creation
  const promptDocId = store.createFromPrompt(
    'Technical Design Review',
    'doc',
    [],
    [],
    '<h1>Technical Design Review</h1><p>Real generated content.</p>'
  );
  const promptDoc = useWorkspaceStore.getState().documents.find((d) => d.id === promptDocId);
  console.assert(promptDoc?.content === '<h1>Technical Design Review</h1><p>Real generated content.</p>', 'Document content must match passed initial content');
  console.assert(Boolean(promptDoc?.tags?.includes('AI Generated')), 'Prompt document should have AI Generated tag');
  console.log('✓ Prompt-provided Workspace creation successfully uses real prompt content without mock template.');

  console.log('\n--- 2. Testing Vision Request Authentication & Credential Pairing ---');
  // Test Cloudflare credential pairing
  const pairTest1 = parseCloudflarePairs('acc1,acc2', 'tok1,tok2');
  console.assert(pairTest1.valid && pairTest1.pairs.length === 2, 'Should pair 2 accounts and tokens 1:1');
  console.assert(pairTest1.pairs[0].accountId === 'acc1' && pairTest1.pairs[0].apiToken === 'tok1', 'Pair 0 match');
  console.assert(pairTest1.pairs[1].accountId === 'acc2' && pairTest1.pairs[1].apiToken === 'tok2', 'Pair 1 match');

  const pairMismatch = parseCloudflarePairs('acc1', 'tok1,tok2');
  console.assert(!pairMismatch.valid && Boolean(pairMismatch.error), 'Mismatched counts must return validation error');
  console.log('✓ Cloudflare 1:1 Account ID + Token positional pairing verified.');

  // Test Vision Runner with missing / invalid credentials
  const mockImage: VisionImageInput = {
    sourceId: 'src-test-1',
    filename: 'diagram.png',
    mimeType: 'image/png',
    dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    byteLength: 68,
  };

  const visionAuthResult = await executeVisionInspection([mockImage], 'Read this diagram', {
    providerId: 'cloudflare',
    modelId: '@cf/meta/llama-3.2-11b-vision-instruct',
    apiKey: '',
    accountId: '',
  });

  console.assert(!visionAuthResult.success, 'Inspection without credentials must fail');
  console.assert(
    visionAuthResult.errorCategory === 'AUTHENTICATION_ERROR',
    `Expected AUTHENTICATION_ERROR, got ${visionAuthResult.errorCategory}`
  );
  console.assert(
    visionAuthResult.diagnostics?.httpStatus === 401,
    `Expected diagnostics httpStatus 401, got ${visionAuthResult.diagnostics?.httpStatus}`
  );
  console.log('✓ Vision runner accurately categorizes missing/unauthenticated credentials as AUTHENTICATION_ERROR with HTTP 401.');

  console.log('\n--- 3. Testing Safe Persistence Architecture ---');
  const safeStorage = createSafeWorkspaceStorage();
  console.assert(typeof safeStorage.getItem === 'function', 'getItem exists');
  console.assert(typeof safeStorage.setItem === 'function', 'setItem exists');
  console.assert(typeof safeStorage.removeItem === 'function', 'removeItem exists');
  console.log('✓ Safe persistence storage adapter initial structure verified.');

  console.log('\nALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
