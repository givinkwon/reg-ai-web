import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    const slackWebhookUrl = 'https://hooks.slack.com/services/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';

    const response = await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.statusText}`);
    }

    return NextResponse.json({ message: 'Slack notification sent successfully' }, { status: 200 });
  } catch (error) {
    console.error('Error sending to Slack:', error);
    return NextResponse.json({ error: 'Failed to send Slack notification' }, { status: 500 });
  }
}
