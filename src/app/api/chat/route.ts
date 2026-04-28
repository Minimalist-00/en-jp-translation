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
    const { messages, context, isExplainRequest } = await req.json();

    // Extract the latest user message
    const latestMessage = messages[messages.length - 1]?.content;

    if (!latestMessage) {
      return new Response('No message provided', { status: 400 });
    }

    let instruction = "";
    if (isExplainRequest) {
      instruction = `
### 指示
入力されたテキストの言語を自動で判定し、英語の場合は日本語に、日本語の場合は英語に翻訳してください。

必ず以下のルールに従って出力してください。
1. 翻訳結果の文章（英語に翻訳する場合は、Neoが今すぐ使える正確でシンプルな表現）は、必ず引用ブロック（>）を使って出力すること。
2. 続いて、詳細な解説を行ってください。文法の解説や使用頻度（⭐️の数）、より自然な表現などを簡潔に記述してください。解説は **💡 解説** という見出しの後に続けてください。

出力例:
> Hello! （または こんにちは！）

**💡 解説**
ここに文法の解説や使用頻度（⭐️の数）、より自然な表現などを記述。
`;
    } else {
      instruction = `
### 指示
入力されたテキストの言語を自動で判定し、英語の場合は日本語に、日本語の場合は英語に翻訳してください。

必ず以下のルールに従って出力してください。
1. 翻訳結果の文章（英語に翻訳する場合は、Neoが今すぐ使える正確でシンプルな表現）は、必ず引用ブロック（>）を使って出力すること。
2. 解説は一切含めず、翻訳結果のみを出力してください。

出力例:
> Hello! （または こんにちは！）
`;
    }

    // Append context to user message if present
    const promptWithContext = context
      ? `${instruction}\n【状況/トーン】: ${context}\n\n【入力】: ${latestMessage}`
      : `${instruction}\n\n【入力】: ${latestMessage}`;

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
