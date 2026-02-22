import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    // ❗ 파일 업로드이므로 반드시 formData()로 받아야 합니다.
    const formData = await req.formData();
    
    let backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://35.76.230.177:8008';
    
    if (!backendUrl.startsWith('http')) backendUrl = `http://${backendUrl}`;
    
    // FastAPI의 /docs-sign/summarize 로 전달
    const response = await fetch(`${backendUrl}/docs-sign/summarize`, {
      method: 'POST',
      body: formData, // JSON이 아닌 formData 그대로 전달
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ message: errorText }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
    
  } catch (error: any) {
    console.error('Docs Sign Summarize API Error:', error);
    return NextResponse.json({ message: error.message || 'Internal Server Error' }, { status: 500 });
  }
}