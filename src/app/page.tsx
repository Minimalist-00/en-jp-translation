'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Star, Search, MessageSquare, Bookmark, RefreshCw, Trash2, Copy, ClipboardPaste, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { supabase } from '@/lib/supabaseClient';

type Message = {
  id?: string;
  role: string;
  content: string;
  is_bookmarked?: boolean;
  isHidden?: boolean;
  created_at?: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'bookmarks'>('chat');
  const [searchQuery, setSearchQuery] = useState('');
  const [withExplain, setWithExplain] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleReload = async () => {
    if (isLoading) return;

    // ブックマークに関わるものを残して他を消す
    const keepIds = new Set<string>();
    messages.forEach((msg, idx) => {
      if (msg.role === 'assistant' && msg.is_bookmarked && msg.id) {
        keepIds.add(msg.id);
        const prevMsg = messages[idx - 1];
        if (prevMsg && prevMsg.role === 'user' && prevMsg.id) {
          keepIds.add(prevMsg.id);
        }
      }
    });

    const keepArray = Array.from(keepIds);
    if (keepArray.length > 0) {
      await supabase.from('messages').delete().not('id', 'in', `(${keepArray.join(',')})`);
    } else {
      await supabase.from('messages').delete().neq('role', 'none'); 
    }
    
    // 画面の表示を更新（全て隠す）
    localStorage.setItem('chatClearedAt', new Date().toISOString());
    setMessages(prev => prev.map(m => ({ ...m, isHidden: true })));
  };

  // Fetch initial messages from Supabase
  useEffect(() => {
    const fetchMessages = async () => {
      const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: true });
      if (data) {
        const clearedAt = localStorage.getItem('chatClearedAt');
        const clearedTime = clearedAt ? new Date(clearedAt).getTime() : 0;
        
        setMessages(data.map(m => ({
          ...m,
          isHidden: new Date(m.created_at).getTime() <= clearedTime
        })));
      }
    };
    fetchMessages();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeTab]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input;
    setInput('');
    setIsLoading(true);

    // 1. Save user message to Supabase
    const { data: userSaved } = await supabase.from('messages').insert({ role: 'user', content: userText }).select().single();
    
    const newMessages: Message[] = [...messages, { id: userSaved?.id, role: 'user', content: userText }];
    setMessages(newMessages);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          isExplainRequest: withExplain
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
        throw new Error('APIからの応答が空でした。');
      }

      // 2. Save assistant message to Supabase
      const { data: assistantSaved } = await supabase.from('messages').insert({ role: 'assistant', content: text }).select().single();
      setMessages([...newMessages, { id: assistantSaved?.id, role: 'assistant', content: text }]);

    } catch (error: any) {
      console.error(error);
      setMessages([...newMessages, { role: 'assistant', content: `⚠️ エラーが発生しました: ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleBookmark = async (id: string, currentStatus: boolean) => {
    // UIを即座に更新 (Optimistic UI)
    setMessages(prev => prev.map(m => m.id === id ? { ...m, is_bookmarked: !currentStatus } : m));
    // Supabaseのデータを更新
    await supabase.from('messages').update({ is_bookmarked: !currentStatus }).eq('id', id);
  };

  // ブックマークのペアを作成（解説を除外し辞書形式にする）
  const bookmarkPairs = messages
    .map((msg, idx) => {
      if (msg.role === 'assistant' && msg.is_bookmarked) {
        const userMsg = messages[idx - 1]?.role === 'user' ? messages[idx - 1] : null;
        return {
          id: msg.id || String(idx),
          userContent: userMsg?.content.replace(/【.*?】: /g, '').trim() || '',
          assistantContent: msg.content,
          assistantId: msg.id
        };
      }
      return null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .filter(pair => 
      pair.userContent.toLowerCase().includes(searchQuery.toLowerCase()) || 
      pair.assistantContent.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const extractMainText = (content: string) => {
    let mainText = content;
    if (content.includes('<details>')) {
      mainText = content.split('<details>')[0];
    } else if (content.includes('**💡 解説**')) {
      mainText = content.split('**💡 解説**')[0].replace('---', '');
    }
    return mainText.replace(/^>\s*/gm, '').trim();
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Header */}
      <header className="bg-white px-6 py-4 flex items-center justify-between sticky top-0 z-30 shadow-sm/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold shadow-sm">
            N
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-gray-900">
            Neo<span className="text-blue-500">.</span> AI
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleReload}
            className="p-2 rounded-full text-gray-400 hover:bg-gray-100 hover:text-red-500 transition-all"
            title="履歴をリセット"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setActiveTab('chat')}
            className={`p-2 rounded-full transition-all ${activeTab === 'chat' ? 'bg-blue-50 text-blue-500' : 'text-gray-400 hover:bg-gray-100'}`}
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setActiveTab('bookmarks')}
            className={`p-2 rounded-full transition-all ${activeTab === 'bookmarks' ? 'bg-yellow-50 text-yellow-600' : 'text-gray-400 hover:bg-gray-100'}`}
          >
            <Bookmark className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto p-3 flex flex-col gap-4 pb-28">
        {activeTab === 'bookmarks' ? (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl flex items-center px-4 py-2 border border-gray-200 shadow-sm">
              <Search className="w-5 h-5 text-gray-400 mr-2" />
              <input
                type="text"
                placeholder="ブックマークを検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-1 outline-none text-gray-800"
              />
            </div>
            {bookmarkPairs.length === 0 ? (
              <p className="text-center text-gray-400 mt-10 text-sm">ブックマークが見つかりません</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {bookmarkPairs.map((pair) => {
                  const translation = extractMainText(pair.assistantContent);
                  
                  return (
                    <div key={pair.id} className="bg-white rounded-[14px] p-4 shadow-sm border border-gray-100 relative flex items-center justify-between transition-all hover:shadow-md hover:border-blue-100 group">
                      <div className="flex flex-col gap-1 flex-1 pr-4">
                        <span className="text-[13px] font-medium text-gray-500 leading-tight">
                          {pair.userContent}
                        </span>
                        <span className="text-[16px] font-bold text-gray-900 leading-tight">
                          {translation}
                        </span>
                      </div>
                      <button 
                        onClick={() => pair.assistantId && toggleBookmark(pair.assistantId, true)}
                        className="p-2 text-blue-500 hover:bg-blue-50 active:bg-blue-100 rounded-full transition-colors flex-shrink-0"
                        title="ブックマーク解除"
                      >
                        <Bookmark className="w-5 h-5 fill-current" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.filter(m => !m.isHidden).length === 0 && (
              <div className="pt-8 pb-4 text-center space-y-3">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-50 text-blue-500 mb-2">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">What to say?</h2>
                <p className="text-sm text-gray-500">日本語または英語を入力してください。</p>
              </div>
            )}

            <div className="space-y-4">
              {messages.filter(m => !m.isHidden).map((msg, idx) => {
                if (msg.role === 'user') {
                  return (
                    <div key={msg.id || idx} className="bg-blue-500 text-white rounded-2xl rounded-tr-sm px-4 py-2 shadow-sm relative ml-auto w-fit max-w-[85%]">
                      <p className="text-[15px] leading-relaxed break-words">
                        {msg.content.replace(/【.*?】: /g, '')}
                      </p>
                    </div>
                  )
                } else {
                  return (
                    <div key={msg.id || idx} className="text-gray-800 w-full relative pt-1 pb-2">
                      <div className="absolute top-0 right-0 flex items-center gap-1 z-10">
                        <button 
                          onClick={() => msg.id && toggleBookmark(msg.id, !!msg.is_bookmarked)}
                          className={`p-1.5 rounded-full transition-colors text-gray-400 hover:bg-gray-100`}
                        >
                          <Bookmark className={`w-4 h-4 ${msg.is_bookmarked ? 'fill-blue-500 text-blue-500' : ''}`} />
                        </button>
                      </div>
                      
                      <div className="text-[15px] leading-relaxed pr-8">
                        <ReactMarkdown 
                             remarkPlugins={[remarkGfm]}
                             rehypePlugins={[rehypeRaw]}
                             components={{
                               p: ({node, ...props}) => <p className="mb-1.5 last:mb-0" {...props} />,
                               ul: ({node, ...props}) => <ul className="list-disc ml-4 mb-1.5 last:mb-0" {...props} />,
                               ol: ({node, ...props}) => <ol className="list-decimal ml-4 mb-1.5 last:mb-0" {...props} />,
                               li: ({node, ...props}) => <li className="mb-0.5 last:mb-0" {...props} />,
                               strong: ({node, ...props}) => <strong className="font-bold text-gray-900" {...props} />,
                               hr: ({node, ...props}) => <hr className="my-2 border-gray-200" {...props} />,
                               blockquote: ({node, children, ...props}) => (
                                 <div className="relative my-2 bg-gray-50 rounded-lg overflow-hidden border-l-4 border-gray-300 flex items-stretch">
                                   <blockquote className="py-2 px-3 text-base font-bold flex-1 m-0 text-gray-800" {...props}>
                                     {children}
                                   </blockquote>
                                   <button 
                                     onClick={(e) => {
                                       const text = e.currentTarget.previousElementSibling?.textContent || '';
                                       navigator.clipboard.writeText(text);
                                       const btn = e.currentTarget;
                                       const copyIcon = btn.querySelector('.copy-icon');
                                       const checkIcon = btn.querySelector('.check-icon');
                                       if (copyIcon && checkIcon) {
                                          copyIcon.classList.add('hidden');
                                          checkIcon.classList.remove('hidden');
                                          setTimeout(() => {
                                             copyIcon.classList.remove('hidden');
                                             checkIcon.classList.add('hidden');
                                          }, 2000);
                                       }
                                     }}
                                     className="px-3 text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors flex items-center justify-center border-l border-gray-200"
                                     title="コピーする"
                                   >
                                     <Copy className="w-4 h-4 copy-icon block" />
                                     <Check className="w-4 h-4 check-icon hidden text-green-500" />
                                   </button>
                                 </div>
                               ),
                               details: ({node, ...props}) => <details className="my-1.5 bg-gray-50 rounded-lg border border-gray-200 overflow-hidden [&_summary::-webkit-details-marker]:hidden text-sm [&[open]>summary]:mb-1.5 [&[open]]:pb-2 [&>*:not(summary)]:px-3" {...props} />,
                               summary: ({node, ...props}) => (
                                 <summary className="px-3 py-2 cursor-pointer font-medium hover:bg-gray-100 transition-colors flex items-center outline-none select-none" {...props}>
                                    {props.children}
                                 </summary>
                               ),
                             }}
                           >
                             {msg.content}
                           </ReactMarkdown>
                      </div>
                    </div>
                  )
                }
              })}
              
              {isLoading && !messages[messages.length - 1]?.role.includes('assistant') && (
                <div className="text-gray-800 w-full pt-2 pb-1 flex items-center gap-2">
                   <div className="flex gap-1">
                     <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                     <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                     <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                   </div>
                   <span className="text-xs text-gray-500">翻訳中...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </>
        )}
      </main>

      {activeTab === 'chat' && (
        <div className="fixed bottom-0 left-0 right-0 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.03)] border-t border-gray-100 z-20 pb-safe">
          <div className="max-w-md mx-auto p-4">
            <form onSubmit={onSubmit} className="flex gap-2 items-end">
              <div className="bg-gray-100 rounded-2xl flex-1 flex items-center pl-4 pr-1 py-1.5 border border-transparent focus-within:border-blue-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-50 transition-all duration-200">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                       e.preventDefault();
                       const form = e.currentTarget.closest('form');
                       if (form) form.requestSubmit();
                    }
                  }}
                  placeholder="翻訳したい文を入力..."
                  className="w-full bg-transparent text-sm resize-none focus:outline-none py-2.5 max-h-[120px] text-gray-800"
                  rows={1}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setWithExplain(!withExplain)}
                  className={`p-2 rounded-xl transition-colors shrink-0 mr-1 ${withExplain ? 'text-blue-500 bg-blue-50' : 'text-gray-400 hover:text-blue-500 hover:bg-white'}`}
                  title={withExplain ? "解説あり" : "解説なし"}
                >
                  <Sparkles className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      setInput(prev => prev + text);
                    } catch (err) {
                      console.error('Failed to read clipboard contents: ', err);
                    }
                  }}
                  className="p-2 text-gray-400 hover:text-blue-500 hover:bg-white rounded-xl transition-colors shrink-0"
                  title="ペースト"
                >
                  <ClipboardPaste className="w-5 h-5" />
                </button>
              </div>
              
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="bg-blue-500 text-white rounded-2xl w-12 h-12 flex-shrink-0 flex items-center justify-center shadow-md shadow-blue-200 disabled:opacity-50 disabled:shadow-none transition-all focus:outline-none focus:ring-4 focus:ring-blue-100 hover:bg-blue-600 active:scale-95"
              >
                <Send className="w-5 h-5 ml-0.5" />
              </button>
            </form>
          </div>
        </div>
      )}
      
      <style dangerouslySetInnerHTML={{__html: `
        .pb-safe { padding-bottom: env(safe-area-inset-bottom); }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
