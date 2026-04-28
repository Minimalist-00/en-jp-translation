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
1. 前置き禁止: 「承知いたしました」「お答えします」などの挨拶や前置きは一切不要。結果のみを返す。
2. 言語: 解説は日本語、例文やフレーズは英語。
3. レベル感: 語学留学中のリアルな会話（カジュアル〜セミフォーマル）を優先。
4. TOEIC 400点相当の英語力はあるので、超基本的な文法用語や文法の解説は不要である。
`;

export async function POST(req: Request) {
  try {
    const { messages, context, isExplainRequest, isExampleRequest } = await req.json();

    // Extract the latest user message
    const latestMessage = messages[messages.length - 1]?.content;

    if (!latestMessage) {
      return new Response('No message provided', { status: 400 });
    }

    let instruction = `
### 指示
入力されたテキストの言語を自動で判定し、以下のガイドラインに従って出力してください。
ただし、最も重要な翻訳結果（英語への翻訳、または日本語での意味）は、必ず先頭に引用ブロック（>）を使って出力してください。
`;

    if (!isExplainRequest && !isExampleRequest) {
      instruction += `
【重要】今回は解説や例文は一切含めず、翻訳結果のみを出力してください。
`;
    } else {
      let includes = [];
      if (isExplainRequest) includes.push("解説（品詞、イメージ、Grammar解説など）");
      if (isExampleRequest) includes.push("例文・応用表現（例文、Short Phraseなど）");
      instruction += `
今回は翻訳結果に加えて、${includes.join("と")}を出力してください。要求されていない項目は出力しないでください。

【出力ガイドライン】

■ 英語（単語・フレーズ・英文）が入力された場合
・意味: 日本語での適切な意味（※必ず先頭に > をつけて出力）
`;
      if (isExplainRequest) {
        instruction += `・品詞: 単語の役割（単語の場合）
・イメージ: 記憶に定着しやすいビジュアルやニュアンスの解説
・Grammar解説: 文法構造のポイントを簡潔に（フレーズ・英文の場合）
`;
      }
      if (isExampleRequest) {
        instruction += `・例文: 語学学校の先生や友だちとの会話、実際の留学生活で使える例文を2〜3個
`;
      }

      instruction += `
■ 日本語が入力された場合（英訳依頼）
・英語回答: 自然で伝わりやすい表現（※必ず先頭に > をつけて出力）
`;
      if (isExplainRequest) {
        instruction += `・イメージ: その表現が持つ感覚的なニュアンス
・Grammar補足: 少し高度な文法が含まれる場合のみ、軽く解説
`;
      }
      if (isExampleRequest) {
        instruction += `・Short Phrase: 即レスで使える短い決まり文句
・Simple Sentence: 難しい単語を避けた、中学レベルの基本構文での文章
`;
      }
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
