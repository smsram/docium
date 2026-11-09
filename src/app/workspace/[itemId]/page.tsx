import React, { Suspense } from 'react';
import { WorkspaceClient } from './WorkspaceClient';

export function generateStaticParams() {
  return [
    { itemId: 'doc-1' },
    { itemId: 'doc-2' },
    { itemId: 'doc-3' },
    { itemId: 'sheet-1' },
    { itemId: 'sheet-2' },
    { itemId: 'slide-1' },
    { itemId: 'pdf-1' },
    { itemId: 'pdf-2' },
  ];
}

async function WorkspaceLoader({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  return <WorkspaceClient itemId={itemId} />;
}

export default function WorkspaceItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-[var(--background)] text-[var(--text-muted)] text-xs space-y-2">
          <div className="h-5 w-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          <span>Opening workspace...</span>
        </div>
      }
    >
      <WorkspaceLoader params={params} />
    </Suspense>
  );
}
