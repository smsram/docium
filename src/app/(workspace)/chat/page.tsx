'use client';

import React from 'react';
import { WorkspaceAI } from '@/components/workspace/WorkspaceAI';

export default function AiChatPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] max-w-4xl mx-auto w-full p-3 sm:p-5">
      <WorkspaceAI
        workspaceId="general-ai"
        documentFormat="doc"
        fullWidth={true}
      />
    </div>
  );
}
