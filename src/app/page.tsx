'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, UserRound, ArrowRightLeft } from 'lucide-react';

export default function Home() {
  const [messages, setMessages] = useState<{ role: string, content: string }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'ja-en' | 'en-ja'>('ja-en');

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);



  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input;
    setInput('');
    setIsLoading(true);


    const newMessages = [{ role: 'user', content: userText }];
    setMessages(newMessages);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          mode: mode
        }),
      });

      if (!response.ok) throw new Error('Network error');
      if (!response.body) throw new Error('No body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let text = '';
      
      setMessages([...newMessages, { role: 'assistant', content: '' }]);

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value);
        text += chunkValue;
        
        setMessages([...newMessages, { role: 'assistant', content: text }]);
      }
      
      if (text.trim() === '') {
        throw new Error('APIから空の応答が返されました。APIキーが正しく設定されていないか、サーバーの再起動が必要です。');
      }
    } catch (error: any) {
      console.error(error);
      const errorMessage = error.message?.includes('APIから空の応答') 
        ? error.message 
        : '通信エラー、またはAPIエラーが発生しました。サーバー（npm run dev）を再起動してみてください。';
      setMessages([...newMessages, { role: 'assistant', content: `⚠️ ${errorMessage}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  // The latest AI message
  const assistantMessage = messages.findLast(m => m.role === 'assistant');
  const userMessage = messages.findLast(m => m.role === 'user');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Header */}
      <header className="bg-white px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold shadow-md shadow-blue-200">
            N
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-800">
            Neo<span className="text-blue-500">.</span> AI
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setMode(m => m === 'ja-en' ? 'en-ja' : 'ja-en')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 active:scale-95 transition-all"
          >
            {mode === 'ja-en' ? '日 → 英' : '英 → 日'}
            <ArrowRightLeft className="w-3 h-3 text-slate-400" />
          </button>
          

        </div>
      </header>

      <main className="max-w-md mx-auto p-4 flex flex-col gap-6 pb-32">
        {/* Welcome Section / Status */}
        {messages.length === 0 && (
          <div className="pt-8 pb-4 text-center space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 mb-2">
              <Sparkles className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">What to say?</h2>
            <p className="text-sm text-slate-500">日本語または英語を入力してください。</p>
          </div>
        )}

        {/* Translation Result Area */}
        {userMessage && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 relative">
              <p className="text-sm text-slate-600 leading-relaxed break-words pr-6">
                {userMessage.content.replace(/【.*?】: /g, '')}
              </p>
            </div>
            
            {assistantMessage && (
              <div className="bg-gradient-to-br from-blue-600 to-blue-500 rounded-2xl shadow-lg shadow-blue-200 overflow-hidden text-white w-full">
                <div className="p-5">
                   <p className="whitespace-pre-wrap text-base font-medium leading-relaxed">
                     {assistantMessage.content}
                   </p>
                   {isLoading && (
                     <div className="mt-2 flex gap-1">
                       <span className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                       <span className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                       <span className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-bounce"></span>
                     </div>
                   )}
                </div>
              </div>
            )}
            
            {isLoading && !assistantMessage && (
              <div className="bg-gradient-to-br from-blue-600 to-blue-500 rounded-2xl shadow-lg shadow-blue-200 overflow-hidden text-white w-full min-h-[100px] flex items-center justify-center">
                 <div className="flex gap-1">
                   <span className="w-2 h-2 bg-blue-200 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                   <span className="w-2 h-2 bg-blue-200 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                   <span className="w-2 h-2 bg-blue-200 rounded-full animate-bounce"></span>
                 </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Input Form at Bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.05)] border-t border-slate-100 z-20 pb-safe">
        <div className="max-w-md mx-auto p-4">
          


          <form onSubmit={onSubmit} className="flex gap-2 items-end">
            <div className="bg-slate-100 rounded-2xl flex-1 flex items-center px-4 py-1.5 border border-transparent focus-within:border-blue-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100 transition-all duration-200">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                     e.preventDefault();
                     const form = e.currentTarget.closest('form');
                     if (form) form.requestSubmit();
                  }
                }}
                placeholder="翻訳したい文を入力..."
                className="w-full bg-transparent text-sm resize-none focus:outline-none py-2.5 max-h-[120px]"
                rows={1}
                disabled={isLoading}
              />
            </div>
            
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="bg-blue-600 text-white rounded-2xl w-12 h-12 flex-shrink-0 flex items-center justify-center shadow-lg shadow-blue-200 disabled:opacity-50 disabled:shadow-none transition-all focus:outline-none focus:ring-4 focus:ring-blue-100 hover:bg-blue-700 active:scale-95"
            >
              <Send className="w-5 h-5 ml-0.5" />
            </button>
          </form>
        </div>
      </div>
      
      {/* PWA safe area handler for iOS */}
      <style dangerouslySetInnerHTML={{__html: `
        .pb-safe { padding-bottom: env(safe-area-inset-bottom); }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
