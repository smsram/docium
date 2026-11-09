import { redirect } from 'next/navigation';

export function generateStaticParams() {
  return [{ spreadsheetId: 'sheet-1' }, { spreadsheetId: 'sheet-2' }];
}

export default async function SpreadsheetPage({
  params,
}: {
  params: Promise<{ spreadsheetId: string }>;
}) {
  const { spreadsheetId } = await params;
  redirect(`/workspace/${spreadsheetId}`);
}
