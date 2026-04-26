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
- 現在の英語力は、基礎的な文法や単語を理解しており、人と意思疎通が出来る程度である。

# Rules
1. 挨拶や「もちろんです」といった不要な装飾語は一切排除し、結果のみを返す。
2. [Quick Response] は、Neoが今すぐ正確に発音・理解できる構文（SVO中心）にする。
3. 入力が英語の場合は、その意味と、より自然な別の英語表現を簡潔に返すこと。
4. TOEIC 400点相当の英語力はあるので、超基本的な文法用語や文法の解説は不要である。
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
      ? `
### 指示
入力された英語を日本語に翻訳し、意味を簡潔に解説してください。

使われてる文法も軽く解説してほしい。
例) to不定詞や関係代名詞など。どれくらい日常的に使うかの頻度も☆1〜3段階中で評価してほしい。「⭐️」を使って
`
      : `
### 指示
入力された日本語を英語に翻訳してください。
以下を必ず提示してください
- **Quick Response**: Neoが今すぐ使える、正確でシンプルな表現

使われてる文法も軽く解説してほしい。
例) to不定詞や関係代名詞など。どれくらい日常的に使うかの頻度も☆3段階中で評価してほしい。
`;

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
