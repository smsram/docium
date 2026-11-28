import { resolveTrueTypeFontWithMeta, type FontWeightKey } from '@/lib/editor/serverFontResolver';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const family = searchParams.get('family') || '';
  const weight: FontWeightKey = searchParams.get('weight') === '700' ? '700' : '400';
  const italic = searchParams.get('italic') === '1' || searchParams.get('italic') === 'true';
  const exactOnly = searchParams.get('exact') === '1' || searchParams.get('exact') === 'true';

  if (!family.trim()) {
    return new Response('Missing family parameter', { status: 400 });
  }

  const res = await resolveTrueTypeFontWithMeta(family, weight, italic, { exactOnly });
  if (!res) {
    return new Response('Font binary not found', { status: 404 });
  }

  return new Response(new Uint8Array(res.buffer), {
    status: 200,
    headers: {
      'Content-Type': 'font/ttf',
      'X-Font-Exact': res.exact ? '1' : '0',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
