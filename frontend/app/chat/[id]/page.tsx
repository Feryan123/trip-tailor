"use client";
import React, { useState, useRef, useEffect, use } from 'react';
import { Menu, Plus, MessageSquare, X, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { chatAPI, handleAPIError } from '@/lib/api';
import Markdown from 'react-markdown';

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

interface ChatHistory {
  id: string;
  title: string;
  messages: Message[];
  lastMessage: Date;
}

interface ChatPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function ChatPage({ params }: ChatPageProps) {
  const { id } = use(params);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(id);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    initializeConversation();
  }, [id]);

  useEffect(() => {
    loadChatHistory();
  }, []);

  const initializeConversation = async () => {
    setInitializing(true);
    try {
      setConnectionError(null);
      
      if (id === 'new') {
        const initialMessage = sessionStorage.getItem('initialMessage');
        const newConversationId = sessionStorage.getItem('newConversationId');
        
        if (initialMessage && newConversationId) {
          setConversationId(newConversationId);
          
          sessionStorage.removeItem('initialMessage');
          sessionStorage.removeItem('newConversationId');
          
          window.history.replaceState({}, '', `/chat/${newConversationId}`);
          
          await sendInitialMessage(initialMessage, newConversationId);
        } else {
          const data = await chatAPI.createConversation();
          setConversationId(data.conversationId);
          setMessages([]);
          
          window.history.replaceState({}, '', `/chat/${data.conversationId}`);
        }
      } else {
        setConversationId(id);
        await loadConversation(id);
      }
    } catch (error) {
      console.error('Failed to initialize conversation:', error);
      setConnectionError(handleAPIError(error));
    } finally {
      setInitializing(false);
    }
  };

  const sendInitialMessage = async (message: string, convId: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      content: message,
      isUser: true,
      timestamp: new Date()
    };

    setMessages([userMessage]);
    setIsLoading(true);

    try {
      const data = await chatAPI.sendMessage({
        message: message,
        conversationId: convId
      });
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: data.response,
        isUser: false,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);

      if (data.enrichedWithRealData) {
        console.log('✨ Response enhanced with real travel data!');
      }

      if (data.toolsUsed && data.toolsUsed.length > 0) {
        console.log('🔧 Tools used:', data.toolsUsed);
      }

    } catch (error) {
      console.error('Failed to send initial message:', error);
      setConnectionError(handleAPIError(error));
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `❌ ${handleAPIError(error)}`,
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadConversation = async (convId: string) => {
    try {
      const data = await chatAPI.getConversation(convId);
      const formattedMessages = data.conversation.map((msg: any, index: number) => ({
        id: `${convId}-${index}`,
        content: msg.content,
        isUser: msg.role === 'user',
        timestamp: new Date(),
      }));
      setMessages(formattedMessages);
    } catch (error) {
      console.error('Failed to load conversation:', error);
      
      if (error instanceof Error && (error.message.includes('404') || error.message.includes('Conversation not found'))) {
        console.log('Conversation not found, redirecting to new chat');
        setMessages([]);
        window.location.href = '/chat/new';
      } else {
        setConnectionError(handleAPIError(error));
        setMessages([]);
      }
    }
  };

  const loadChatHistory = () => {
    setChatHistory([]);
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue,
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputValue;
    setInputValue('');
    setIsLoading(true);
    setConnectionError(null);

    try {
      const data = await chatAPI.sendMessage({
        message: currentInput,
        conversationId: conversationId || id
      });
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: data.response,
        isUser: false,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);

      // Update conversation ID if it was created
      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId);
      }

      if (data.enrichedWithRealData) {
        console.log('✨ Response enhanced with real travel data!');
      }

      if (data.toolsUsed && data.toolsUsed.length > 0) {
        console.log('🔧 Tools used:', data.toolsUsed);
      }

      if (data.agentWorkflow) {
        console.log('🤖 Agent workflow completed:', data.agentWorkflow.stepsCompleted);
      }

    } catch (error) {
      console.error('Failed to send message:', error);
      setConnectionError(handleAPIError(error));
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `❌ ${handleAPIError(error)}`,
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const startNewChat = async () => {
    try {
      const data = await chatAPI.createConversation();
      setMessages([]);
      setConversationId(data.conversationId);
      setCurrentChatId(null);
      setSidebarOpen(false);
      setConnectionError(null);
      
      window.location.href = `/chat/${data.conversationId}`;
    } catch (error) {
      console.error('Failed to create new conversation:', error);
      setConnectionError(handleAPIError(error));
      
      setMessages([]);
      setCurrentChatId(null);
      setSidebarOpen(false);
      window.location.href = '/chat/new';
    }
  };

  const loadChat = (chatId: string) => {
    const chat = chatHistory.find(c => c.id === chatId);
    if (chat) {
      setMessages(chat.messages);
      setCurrentChatId(chatId);
      setConversationId(chatId);
      setSidebarOpen(false);
      window.location.href = `/chat/${chatId}`;
    }
  };

  const formatDate = (date: Date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  };

  // Show loading screen while initializing
  if (initializing) {
    return (
      <div className="h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-500" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Starting your trip planning...</h2>
          <p className="text-gray-600">TripTailor is getting ready to help you!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-white flex">
      <div className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-50 w-80 bg-gray-50 border-r border-gray-200 transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0`}>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <button
              onClick={startNewChat}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Plus size={16} />
              New Chat
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 text-gray-500 hover:text-gray-700 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
              Recent Chats
            </div>
            {chatHistory.length === 0 ? (
              <div className="text-sm text-gray-500 text-center py-8">
                No chat history yet.<br />
                Start a conversation to see it here!
              </div>
            ) : (
              chatHistory.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => loadChat(chat.id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    currentChatId === chat.id
                      ? 'bg-blue-50 border border-blue-200'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare size={16} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {chat.title}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 ml-6">
                    {formatDate(chat.lastMessage)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <Menu size={20} />
          </button>
          <Link href='/'>
            <h1 className="text-lg font-poppins font-semibold text-gray-900">TripTailor</h1>
          </Link>
          <div className="w-8 lg:w-0"></div>
        </header>

        {/* Connection Error Banner */}
        {connectionError && (
          <div className="bg-red-50 border-b border-red-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-red-600 text-sm">⚠️ Connection Error:</span>
                <span className="text-red-700 text-sm">{connectionError}</span>
              </div>
              <button
                onClick={() => setConnectionError(null)}
                className="text-red-600 hover:text-red-800"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex items-center font-inter justify-center h-full">
              <div className="text-center">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  What's your next trip?
                </h2>
                <p className="text-gray-600 max-w-md">
                  Let TripTailor help you plan your next adventure. Start by typing your travel plans.
                </p>
                {process.env.NODE_ENV === 'development' && (
                  <div className="mt-4 text-sm text-gray-500">
                    Conversation ID: {conversationId || 'Not set'} | Chat ID: {id}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl font-geist mx-auto space-y-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-4 ${message.isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-2xl ${message.isUser ? 'order-1' : 'order-2'}`}>
                    <div
                      className={`rounded-2xl px-4 py-3 ${
                        message.isUser
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 text-black'
                      }`}
                    >
                      <div className="text-sm leading-relaxed whitespace-pre-wrap">
                        {message.isUser ? (
                          message.content
                        ) : (
                          <Markdown>{message.content}</Markdown>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 px-2">
                      {message.timestamp.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex gap-4 justify-start">
                  <div className="max-w-2xl order-2">
                    <div className="rounded-2xl px-4 py-3 bg-gray-100 text-black">
                      <div className="flex items-center gap-2">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                        </div>
                        <span className="text-sm text-gray-600">TripTailor is analyzing and planning...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 px-4 py-4 bg-white">
          <div className="max-w-4xl mx-auto">
            <div className="max-w-3xl mx-auto h-40 rounded-3xl bg-white border border-gray-300 shadow-sm">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your travel needs here..."
                className="text-lg w-full px-5 pt-4 resize-none overflow-hidden bg-transparent border-none outline-none h-28"
                rows={3}
                disabled={isLoading}
              />
              
              <div className="flex items-center justify-between px-5 pt-0">
                <button className="hover:cursor-pointer transition-opacity hover:opacity-70">
                  <svg xmlns="http://www.w3.org/2000/svg" width="29" height="29" viewBox="0 0 29 29" fill="none">
                    <path d="M3.625 7.625C3.625 5.41586 5.41586 3.625 7.625 3.625H21.375C23.5841 3.625 25.375 5.41586 25.375 7.625V21.375C25.375 23.5841 23.5841 25.375 21.375 25.375H7.625C5.41586 25.375 3.625 23.5841 3.625 21.375V7.625Z" stroke="#222222" strokeWidth="2"/>
                    <path d="M3.625 18.125L7.368 14.382C8.25033 13.4997 9.7163 13.6318 10.4266 14.6578L13.2664 18.7596C13.9311 19.7197 15.2735 19.9085 16.1773 19.1691L19.745 16.2501C20.5402 15.5995 21.6991 15.6573 22.4257 16.3839L25.375 19.3333" stroke="#222222" strokeWidth="2"/>
                    <circle cx="19.3333" cy="9.66667" r="2.41667" fill="#222222"/>
                  </svg>
                </button>
                <div className="flex gap-3">
                    <button className="hover:cursor-pointer transition-opacity hover:opacity-70">
                    <svg xmlns="http://www.w3.org/2000/svg" width="29" height="29" viewBox="0 0 29 29" fill="none">
                        <rect x="10.875" y="3.625" width="7.25" height="13.2917" rx="3" stroke="#222222" strokeWidth="2" strokeLinejoin="round"/>
                        <path d="M6.25 13.2917C6.25 15.4797 7.11919 17.5781 8.66637 19.1253C10.2135 20.6725 12.312 21.5417 14.5 21.5417C16.688 21.5417 18.7865 20.6725 20.3336 19.1253C21.8808 17.5781 22.75 15.4797 22.75 13.2917" stroke="#222222" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M14.5 25.375V22.9583" stroke="#222222" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    </button>
                    <button 
                    onClick={handleSendMessage}
                    disabled={!inputValue.trim() || isLoading}
                    className="hover:cursor-pointer transition-all duration-200 hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed bg-blue-500 hover:bg-blue-600 text-white rounded-full p-2"
                    >
                        {isLoading ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M19.4354 0.581983C18.9352 0.0685981 18.1949 -0.122663 17.5046 0.0786645L1.408 4.75952C0.679698 4.96186 0.163487 5.54269 0.0244302 6.28055C-0.117628 7.0315 0.378575 7.98479 1.02684 8.38342L6.0599 11.4768C6.57611 11.7939 7.24239 11.7144 7.66956 11.2835L13.4329 5.4843C13.723 5.18231 14.2032 5.18231 14.4934 5.4843C14.7835 5.77623 14.7835 6.24935 14.4934 6.55134L8.71999 12.3516C8.29181 12.7814 8.21178 13.4508 8.52691 13.9702L11.6022 19.0538C11.9623 19.6577 12.5826 20 13.2628 20C13.3429 20 13.4329 20 13.513 19.9899C14.2933 19.8893 14.9135 19.3558 15.1436 18.6008L19.9156 2.52479C20.1257 1.84028 19.9356 1.09537 19.4354 0.581983" fill="currentColor"/>
                          </svg>
                        )}
                    </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}