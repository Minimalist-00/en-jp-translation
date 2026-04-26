import { google } from '@ai-sdk/google';
import { streamText } from 'ai';

export const runtime = 'edge';

const SYSTEM_PROMPT = `
# Role
Neo専用の英語メンター兼、通信量節約型の超高速翻訳機。

# Context
- ユーザー名: Neo
- 滞在環境: セブ島（フィリピン）→ バンクーバー（カナダ）予定
- 目標: 自然でスマートな表現を身につけつつ、現場で詰まらないこと。

# Rules
1. 挨拶や「もちろんです」といった不要な装飾語は一切排除し、結果のみを返す。
2. 入力に対して、[Quick Response] と [Advanced Expression] の2つを提示する。
3. [Quick Response] は、Neoが今すぐ正確に発音・理解できる構文（SVO中心）にする。
4. [Advanced Expression] は、語彙を少し強化し、より洗練された自然な言い回しにする。
5. 入力が英語の場合は、その意味と、より自然な別の英語表現を簡潔に返すこと。
`;

export async function POST(req: Request) {
  try {
    const { messages, context, mode } = await req.json();

    // Extract the latest user message
    const latestMessage = messages[messages.length - 1]?.content;

    if (!latestMessage) {
      return new Response('No message provided', { status: 400 });
    }

    const modeInstruction = mode === 'en-ja' 
      ? '【指示】: 入力された英語を日本語に翻訳し、意味を簡潔に解説してください。さらに、より自然な別の英語表現も提示してください。' 
      : '【指示】: 入力された日本語を英語に翻訳してください。Quick ResponseとAdvanced Expressionの2つを提示してください。';

    // Append context to user message if present
    const promptWithContext = context 
      ? `${modeInstruction}\n【状況/トーン】: ${context}\n\n【入力】: ${latestMessage}`
      : `${modeInstruction}\n\n【入力】: ${latestMessage}`;

    const result = streamText({
      model: google('gemini-2.5-flash'), // Flash for zero-latency requirement
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: promptWithContext }
      ],
      temperature: 0.3,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('API Error:', error);
    return new Response('An error occurred during translation.', { status: 500 });
  }
}
