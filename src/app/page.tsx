'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, ArrowRightLeft, Star, Search, MessageSquare, Bookmark } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '@/lib/supabaseClient';

type Message = {
  id?: string;
  role: string;
  content: string;
  is_bookmarked?: boolean;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'ja-en' | 'en-ja'>('ja-en');
  const [activeTab, setActiveTab] = useState<'chat' | 'bookmarks'>('chat');
  const [searchQuery, setSearchQuery] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  // Fetch initial messages from Supabase
  useEffect(() => {
    const fetchMessages = async () => {
      const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: true });
      if (data) setMessages(data);
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

  // ブックマークのフィルタリング・検索
  const bookmarkedMessages = messages.filter(m => m.is_bookmarked && m.role === 'assistant');
  const searchedBookmarks = bookmarkedMessages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()));

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
            onClick={() => setActiveTab('chat')}
            className={`p-2 rounded-full transition-all ${activeTab === 'chat' ? 'bg-blue-100 text-blue-600' : 'text-slate-400 hover:bg-slate-100'}`}
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setActiveTab('bookmarks')}
            className={`p-2 rounded-full transition-all ${activeTab === 'bookmarks' ? 'bg-yellow-100 text-yellow-600' : 'text-slate-400 hover:bg-slate-100'}`}
          >
            <Bookmark className="w-5 h-5" />
          </button>
          
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
        {activeTab === 'bookmarks' ? (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl flex items-center px-4 py-2 border border-slate-200 shadow-sm">
              <Search className="w-5 h-5 text-slate-400 mr-2" />
              <input
                type="text"
                placeholder="ブックマークを検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-1 outline-none"
              />
            </div>
            {searchedBookmarks.length === 0 ? (
              <p className="text-center text-slate-500 mt-10 text-sm">ブックマークが見つかりません</p>
            ) : (
              searchedBookmarks.map((msg, idx) => (
                <div key={msg.id || idx} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 relative">
                  <button 
                    onClick={() => msg.id && toggleBookmark(msg.id, true)}
                    className="absolute top-3 right-3 p-1.5 text-blue-500 hover:bg-blue-50 rounded-full transition-colors"
                  >
                    <Bookmark className="w-5 h-5 fill-current" />
                  </button>
                  <div className="text-sm font-medium leading-relaxed prose prose-sm max-w-none pr-8">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <>
            {messages.length === 0 && (
              <div className="pt-8 pb-4 text-center space-y-3">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 mb-2">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">What to say?</h2>
                <p className="text-sm text-slate-500">日本語または英語を入力してください。</p>
              </div>
            )}

            <div className="space-y-6">
              {messages.map((msg, idx) => {
                if (msg.role === 'user') {
                  return (
                    <div key={msg.id || idx} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 relative ml-auto w-[90%]">
                      <p className="text-sm text-slate-600 leading-relaxed break-words pr-6">
                        {msg.content.replace(/【.*?】: /g, '')}
                      </p>
                    </div>
                  )
                } else {
                  return (
                    <div key={msg.id || idx} className="bg-gradient-to-br from-blue-600 to-blue-500 rounded-2xl shadow-lg shadow-blue-200 overflow-hidden text-white w-[95%] relative">
                      <button 
                        onClick={() => msg.id && toggleBookmark(msg.id, !!msg.is_bookmarked)}
                        className={`absolute top-3 right-3 p-1.5 rounded-full transition-colors z-10 text-white hover:bg-white/10`}
                      >
                        <Bookmark className={`w-5 h-5 ${msg.is_bookmarked ? 'fill-white' : ''}`} />
                      </button>
                      
                      <div className="p-5">
                         <div className="text-sm font-medium leading-relaxed prose-invert pr-6">
                           <ReactMarkdown 
                             remarkPlugins={[remarkGfm]}
                             components={{
                               p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                               ul: ({node, ...props}) => <ul className="list-disc ml-4 mb-2" {...props} />,
                               ol: ({node, ...props}) => <ol className="list-decimal ml-4 mb-2" {...props} />,
                               li: ({node, ...props}) => <li className="mb-1" {...props} />,
                               strong: ({node, ...props}) => <strong className="font-bold text-white" {...props} />,
                               hr: ({node, ...props}) => <hr className="my-3 border-blue-400/30" {...props} />,
                             }}
                           >
                             {msg.content}
                           </ReactMarkdown>
                         </div>
                      </div>
                    </div>
                  )
                }
              })}
              
              {isLoading && !messages[messages.length - 1]?.role.includes('assistant') && (
                <div className="bg-gradient-to-br from-blue-600 to-blue-500 rounded-2xl shadow-lg shadow-blue-200 overflow-hidden text-white w-[95%] min-h-[100px] flex items-center justify-center">
                   <div className="flex gap-1">
                     <span className="w-2 h-2 bg-blue-200 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                     <span className="w-2 h-2 bg-blue-200 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                     <span className="w-2 h-2 bg-blue-200 rounded-full animate-bounce"></span>
                   </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </>
        )}
      </main>

      {activeTab === 'chat' && (
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
      )}
      
      <style dangerouslySetInnerHTML={{__html: `
        .pb-safe { padding-bottom: env(safe-area-inset-bottom); }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
