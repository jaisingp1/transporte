import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatMessage, Machine, QueryResponse } from '../types';
import { Send, RefreshCw } from 'lucide-react';

interface ChatAreaProps {
  onQuerySuccess: (data: Machine[], sql: string | null, view?: 'TABLE' | 'CARD') => void;
  setIsLoading: (loading: boolean) => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ onQuerySuccess, setIsLoading }) => {
  const { t, i18n } = useTranslation();
  const getInitialMessage = () => ({ id: 'init', role: 'assistant' as const, content: t('chat.welcome'), timestamp: Date.now() });

  const [messages, setMessages] = useState<ChatMessage[]>([getInitialMessage()]);
  const [inputValue, setInputValue] = useState('');
  const [aiModel, setAiModel] = useState<'gemini' | 'zai'>('gemini'); // Add state for AI model
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isThinking, setIsThinking] = useState(false);

  useEffect(() => {
    // Update welcome message when language changes if it's the only message
    if (messages.length === 1 && messages[0].id === 'init') {
        setMessages([getInitialMessage()]);
    }
  }, [t, i18n.language]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  const handleReset = () => {
    setMessages([getInitialMessage()]);
    onQuerySuccess([], null); // Clear data area
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsThinking(true);
    setIsLoading(true);

    try {
      // Use relative URL for proxy support
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMsg.content,
          lang: i18n.language,
          model: aiModel // Pass the selected model
        })
      });

      if (!response.ok) throw new Error('Network response was not ok');

      const data: QueryResponse = await response.json();

      // Verificar que la respuesta tenga la estructura esperada
      if (!data || !Array.isArray(data.data)) {
        throw new Error('Invalid response format');
      }

      // Add assistant message
      const assistantContent = data.directAnswer || data.explanation || t('chat.defaultAssistantMessage');
      
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: assistantContent,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, assistantMsg]);
      
      // If the data is not machine data (e.g., a COUNT query), don't display it in the table.
      // The answer is already in the assistant's chat message.
      const isMachineData = data.data.length > 0 && data.data[0] && 'machine' in data.data[0];

      if (isMachineData) {
        onQuerySuccess(data.data, data.sql, data.view);
      } else {
        onQuerySuccess([], data.sql, undefined);
      }

    } catch (error) {
      console.error("Chat error:", error);
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: t('chat.error'),
        timestamp: Date.now(),
        isError: true
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsThinking(false);
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Chat Header */}
      <div className="h-16 border-b border-epiroc-medium-grey flex flex-col justify-center px-4 flex-shrink-0">
        <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-epiroc-dark-blue">{t('chat.title')}</h2>
            <div className="flex items-center gap-2">
                <select
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value as 'gemini' | 'zai')}
                    className="bg-epiroc-light-grey border border-epiroc-medium-grey rounded-md px-2 py-1 text-sm focus:outline-none focus:border-epiroc-yellow"
                >
                    <option value="gemini">Gemini</option>
                    <option value="zai">Z.ai</option>
                </select>
                <button
                    onClick={handleReset}
                    className="text-epiroc-grey hover:text-epiroc-dark-blue transition-colors"
                    title={t('chat.reset')}
                >
                    <RefreshCw size={18} />
                </button>
            </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4 scrollbar-thin">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm whitespace-pre-wrap ${
                  msg.role === 'user' 
                    ? 'bg-epiroc-yellow text-epiroc-dark-blue font-medium rounded-tr-none' 
                    : msg.isError 
                      ? 'bg-epiroc-red text-white rounded-tl-none'
                      : 'bg-white text-epiroc-dark-blue rounded-tl-none border border-epiroc-medium-grey'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {isThinking && (
            <div className="flex justify-start">
              <div className="bg-white border border-epiroc-medium-grey text-epiroc-grey rounded-2xl rounded-tl-none px-4 py-2 text-sm shadow-sm italic flex items-center gap-2">
                <span className="animate-pulse w-2 h-2 bg-epiroc-yellow rounded-full"></span>
                {t('chat.thinking')}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-epiroc-medium-grey flex-shrink-0">
        <div className="relative flex items-center">
          <input 
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.placeholder')}
            className="w-full bg-epiroc-light-grey border border-epiroc-medium-grey rounded-full pl-4 pr-12 py-3 focus:outline-none focus:border-epiroc-yellow focus:ring-1 focus:ring-epiroc-yellow transition-all"
          />
          <button 
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isThinking}
            className="absolute right-2 w-8 h-8 bg-epiroc-yellow rounded-full flex items-center justify-center text-epiroc-dark-blue hover:bg-epiroc-dark-yellow disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={t('chat.send')}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};