import { redirect } from 'next/navigation';

export function generateStaticParams() {
  return [{ presentationId: 'slide-1' }];
}

export default async function PresentationPage({
  params,
}: {
  params: Promise<{ presentationId: string }>;
}) {
  const { presentationId } = await params;
  redirect(`/workspace/${presentationId}`);
}
