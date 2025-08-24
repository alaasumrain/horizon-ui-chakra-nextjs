import { ChatBody } from 'types/types';

export const runtime = 'edge';

async function OpenAIStream(
  inputCode: string,
  model: string,
  key: string | undefined,
) {
  const res = await fetch(`https://api.openai.com/v1/chat/completions`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key || process.env.NEXT_PUBLIC_OPENAI_API_KEY}`,
    },
    method: 'POST',
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a helpful AI assistant.' },
        { role: 'user', content: inputCode }
      ],
      temperature: 0,
      stream: true,
    }),
  });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  if (res.status !== 200) {
    const statusText = res.statusText;
    const result = await res.body?.getReader().read();
    throw new Error(
      `OpenAI API returned an error: ${
        decoder.decode(result?.value) || statusText
      }`,
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = res.body?.getReader();
      if (!reader) return;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;
            
            const dataStr = trimmedLine.slice(6);
            if (dataStr === '[DONE]') {
              controller.close();
              return;
            }

            try {
              const json = JSON.parse(dataStr);
              const text = json.choices[0]?.delta?.content || '';
              if (text) {
                const queue = encoder.encode(text);
                controller.enqueue(queue);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return stream;
}

export async function POST(request: Request) {
  const { inputCode, model, apiKey }: ChatBody = await request.json();

  try {
    const stream = await OpenAIStream(inputCode, model, apiKey);
    return new Response(stream);
  } catch (error) {
    console.error(error);
    return new Response('Error', { status: 500 });
  }
}