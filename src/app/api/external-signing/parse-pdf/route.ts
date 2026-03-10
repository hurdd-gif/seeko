import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: NextRequest) {
  // 1. Auth check — must be admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // 2. Extract PDF from form data
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file || file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'PDF file required' }, { status: 400 });
  }

  // 3. Parse PDF text
  const { PDFParse } = await import('pdf-parse');
  const buffer = Buffer.from(await file.arrayBuffer());
  const pdfParser = new PDFParse({ data: buffer });
  const parsed = await pdfParser.getText();
  const rawText = parsed.text;

  if (!rawText.trim()) {
    return NextResponse.json({ error: 'Could not extract text from PDF' }, { status: 422 });
  }

  // 4. Use Claude API to parse into sections
  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `Parse the following legal document text into numbered sections. Extract each section's title and body content. Format the body as HTML with <p> for paragraphs and <ul>/<li> for lists.

Return ONLY a JSON array with this exact format, no markdown code fences:
[{"number": 1, "title": "Section Title", "content": "<p>HTML content...</p>"}]

If the document has no clear sections, create logical sections based on content breaks.

Document text:
${rawText}`,
      },
    ],
  });

  const textContent = response.content.find((c) => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return NextResponse.json({ error: 'Failed to parse document' }, { status: 500 });
  }

  try {
    const sections = JSON.parse(textContent.text);
    return NextResponse.json({ sections, title: file.name.replace('.pdf', '') });
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
  }
}
