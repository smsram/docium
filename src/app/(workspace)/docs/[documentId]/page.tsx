import { redirect } from 'next/navigation';

export function generateStaticParams() {
  return [{ documentId: 'doc-1' }, { documentId: 'doc-2' }, { documentId: 'doc-3' }];
}

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  redirect(`/workspace/${documentId}`);
}
