"use client";
import React, { useState, useRef, useEffect, use } from 'react';
import { Menu, Plus, MessageSquare, X, Loader2, LogOut, User } from 'lucide-react';
import Link from 'next/link';
import { chatAPI, handleAPIError } from '@/lib/api';
import Markdown from 'react-markdown'
import supabase from '@/lib/supabaseClient';

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: string; // Changed to string for better JSON serialization
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

// Extended interface for sending messages with images
interface SendMessageWithImages {
  message: string;
  conversationId: string | null;
  images?: string[];
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
  const [userEmail, setUserEmail] = useState<string>('');
  const [showLogout, setShowLogout] = useState(false);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
    // Only load chat history if user is authenticated and not loading
    if (user?.id && !loading) {
      loadChatHistory();
    } else {
      setChatHistory([]);
    }
  }, [user?.id, loading]); // Only depend on user.id, not the entire user object

  useEffect(() => {
    const getSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Session error:', error)
          return
        }
        console.log('Session:', session)
        setUser(session?.user || null)
        if (session?.user?.email) {
          setUserEmail(session.user.email)
        }
      } catch (error) {
        console.error('Error getting session:', error)
      } finally {
        setLoading(false)
      }
    }

    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('Auth state changed:', event, session)
        
        if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
          setUser(session?.user || null)
        } else if (event === 'SIGNED_IN') {
          setUser(session?.user || null)
        } else if (event === 'USER_UPDATED') {
          setUser(session?.user || null)
        }
        
        if (session?.user?.email) {
          setUserEmail(session.user.email)
        } else {
          setUserEmail('')
        }
        
        setLoading(false)
      }
    )

    return () => {
      subscription?.unsubscribe()
    }
  }, []) // Empty dependency array - only runs once on mount

  // Session validation interval - separate useEffect to avoid recreating interval
  useEffect(() => {
    let sessionCheckInterval: NodeJS.Timeout | null = null;
    
    if (user?.id) {
      // Set up interval to check session every 5 minutes
      sessionCheckInterval = setInterval(async () => {
        try {
          const { data: { session }, error } = await supabase.auth.getSession()
          if (error || !session) {
            setUser(null)
            setUserEmail('')
          }
        } catch (error) {
          console.error('Session validation error:', error)
        }
      }, 5 * 60 * 1000); // 5 minutes
    }

    return () => {
      if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval)
      }
    }
  }, [user?.id]) // Only recreate interval when user.id changes

  useEffect(() => {
    if (audioChunks.length > 0 && !isRecording) {
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
      processAudioToText(audioBlob);
      setAudioChunks([]);
    }
  }, [audioChunks, isRecording]);

  const processAudioToText = async (audioBlob: Blob) => {
    // Convert audio blob to base64
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Audio = reader.result as string;
      // For now, just add a placeholder message
      // You'll need to integrate with a speech-to-text service
      setInputValue(prev => prev + "[Voice message recorded - integrate with speech-to-text service]");
    };
    reader.readAsDataURL(audioBlob);
  };

  // Optional: Delete image from storage (for cleanup)
  const deleteImageFromStorage = async (imageUrl: string) => {
    try {
      // Extract file path from URL
      const urlParts = imageUrl.split('/');
      const filePath = urlParts.slice(-2).join('/'); // Gets "images/filename.ext"

      const { error } = await supabase.storage
        .from('image')
        .remove([filePath]);

      if (error) {
        console.error('Error deleting image:', error);
      } else {
        console.log('Image deleted successfully');
      }
    } catch (error) {
      console.error('Error in deleteImageFromStorage:', error);
    }
  };

  // Upload file to Supabase Storage with better error handling
  const uploadFileToStorage = async (file: File): Promise<string | null> => {
    try {
      // Check if user is authenticated
      if (!user?.id) {
        console.error('User not authenticated');
        return null;
      }

      // Clean filename and add user ID for organization
      const fileExt = file.name.split('.').pop();
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `${user.id}/${Date.now()}-${cleanFileName}`;

      console.log('Uploading file:', {
        originalName: file.name,
        fileName: fileName,
        size: file.size,
        type: file.type
      });

      const { data, error } = await supabase.storage
        .from('image')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('Supabase storage error:', error);
        console.error('Error details:', {
          message: error.message,
          statusCode: error.statusCode,
          error: error.error
        });
        return null;
      }

      console.log('Upload successful:', data);

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('image')
        .getPublicUrl(fileName);

      console.log('Public URL generated:', publicUrl);
      return publicUrl;

    } catch (error) {
      console.error('Error in uploadFileToStorage:', error);
      return null;
    }
  };

  // Convert file to base64 (keeping for backward compatibility)
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  // Handle image selection
  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newFiles = Array.from(files).slice(0, 4 - selectedImages.length); // Limit to 4 images total
    
    newFiles.forEach(file => {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        alert('Image size must be less than 10MB');
        return;
      }
      
      if (!file.type.startsWith('image/')) {
        alert('Please select only image files');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setImagePreviews(prev => [...prev, result]);
      };
      reader.readAsDataURL(file);
    });

    setSelectedImages(prev => [...prev, ...newFiles]);
  };

  // Remove selected image
  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  // Click image upload button
  const handleImageUpload = () => {
    fileInputRef.current?.click();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          setAudioChunks(prev => [...prev, event.data]);
        }
      };
      
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
      };
      
      setMediaRecorder(recorder);
      setIsRecording(true);
      recorder.start();
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const handleVoiceRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const initializeConversation = async () => {
    setInitializing(true);
    try {
      setConnectionError(null);
      
      if (id === 'new') {
        const initialMessage = sessionStorage.getItem('initialMessage');
        const newConversationId = sessionStorage.getItem('newConversationId');
        const initialImages = sessionStorage.getItem('initialImages');
        
        if (initialMessage && newConversationId) {
          setConversationId(newConversationId);
          
          sessionStorage.removeItem('initialMessage');
          sessionStorage.removeItem('newConversationId');
          if (initialImages) {
            sessionStorage.removeItem('initialImages');
          }
          
          window.history.replaceState({}, '', `/chat/${newConversationId}`);
          
          const imageUrls = initialImages ? JSON.parse(initialImages) : [];
          await sendInitialMessage(initialMessage, newConversationId, imageUrls);
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

  const sendInitialMessage = async (message: string, convId: string, imageUrls: string[] = []) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      content: message,
      isUser: true,
      timestamp: new Date().toISOString(),
      images: imageUrls
    };

    setMessages([userMessage]);
    setIsLoading(true);

    try {
      // First, save the conversation with initial user message to Supabase
      if (user?.id) {
        console.log('Attempting to insert new conversation:', {
          id: convId,
          user: user.id,
          messagesCount: 1
        });

        const { error: insertError } = await supabase
          .from('conversation')
          .insert({
            id: convId, // Now works with text column
            user: user.id,
            messages: [userMessage],
            created_at: new Date().toISOString()
          });

        if (insertError) {
          console.error('Error inserting conversation - Full error:', JSON.stringify(insertError, null, 2));
          console.error('Insert error code:', insertError.code);
          console.error('Insert error message:', insertError.message);
        } else {
          console.log('Initial conversation inserted successfully');
        }
      }

      // Process image descriptions for all uploaded images
      let enhancedMessage = message;
      if (imageUrls.length > 0) {
        const imageDescriptions: string[] = [];
        
        for (const imageUrl of imageUrls) {
          try {
            console.log('Describing image:', imageUrl);
            const description = await describeImage(imageUrl);
            console.log('Image description:', description);
            imageDescriptions.push(description);
          } catch (error) {
            console.error('Error describing image:', error);
            imageDescriptions.push('Unable to describe image.');
          }
        }
        
        if (imageDescriptions.length > 0) {
          enhancedMessage += `\n\nImage Descriptions:\n${imageDescriptions.map((desc, index) => `Image ${index + 1}: ${desc}`).join('\n')}`;
        }
      }

      const data = await chatAPI.sendMessage({
        message: enhancedMessage,
        conversationId: convId,
        ...(imageUrls.length > 0 && { images: imageUrls })
      });
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: data.response,
        isUser: false,
        timestamp: new Date().toISOString()
      };

      const updatedMessages = [userMessage, aiMessage];
      setMessages(updatedMessages);

      // Update conversation in Supabase with both messages
      if (user?.id) {
        console.log('Attempting to update conversation with AI response:', {
          id: convId,
          user: user.id,
          messagesCount: updatedMessages.length
        });

        const { error: updateError } = await supabase
          .from('conversation')
          .update({
            messages: updatedMessages,
          })
          .eq('id', convId); // Now works with text column

        if (updateError) {
          console.error('Error updating initial conversation - Full error:', JSON.stringify(updateError, null, 2));
          console.error('Update error code:', updateError.code);
          console.error('Update error message:', updateError.message);
        } else {
          console.log('Initial conversation updated successfully');
        }
      }

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
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadConversation = async (convId: string) => {
    try {
      // First try to load from Supabase
      if (user?.id) {
        const { data: supabaseData, error } = await supabase
          .from('conversation')
          .select('messages')
          .eq('id', convId) // Now works with text column
          .eq('user', user.id)
          .single();

        if (!error && supabaseData?.messages) {
          setMessages(supabaseData.messages);
          return;
        }
      }

      // Fallback to API if not in Supabase
      const data = await chatAPI.getConversation(convId);
      const formattedMessages = data.conversation.map((msg: any, index: number) => ({
        id: `${convId}-${index}`,
        content: msg.content,
        isUser: msg.role === 'user',
        timestamp: new Date().toISOString(),
        images: msg.images || []
      }));
      setMessages(formattedMessages);

      // Save to Supabase for future use
      if (user?.id) {
        const { error } = await supabase
          .from('conversation')
          .upsert({
            id: convId, // Now works with text column
            user: user.id,
            messages: formattedMessages,
            created_at: new Date().toISOString()
          });

        if (error) {
          console.error('Error saving conversation to Supabase:', error);
        }
      }

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

  const loadChatHistory = async () => {
    if (!user?.id) {
      setChatHistory([]);
      return;
    }

    try {
      console.log('Loading chat history for user:', user.id);
      
      const { data, error } = await supabase
        .from('conversation')
        .select('id, messages, created_at')
        .eq('user', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase error details:', error);
        // Don't retry on table not found errors
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.log('Conversation table does not exist yet - this is normal for new installations');
          setChatHistory([]);
          return;
        }
        throw error;
      }

      console.log('Chat history data:', data);

      if (!data || data.length === 0) {
        console.log('No chat history found');
        setChatHistory([]);
        return;
      }

      const formattedHistory: ChatHistory[] = data.map(conversation => {
        const messages = conversation.messages || [];
        const firstUserMessage = messages.find((msg: Message) => msg.isUser);
        
        return {
          id: conversation.id,
          title: firstUserMessage?.content?.substring(0, 50) + '...' || 'New Chat',
          messages: messages.map((msg: any) => ({
            ...msg,
            timestamp: typeof msg.timestamp === 'string' ? msg.timestamp : new Date(msg.timestamp).toISOString()
          })),
          lastMessage: new Date(conversation.created_at)
        };
      });

      console.log('Formatted history:', formattedHistory);
      setChatHistory(formattedHistory);
    } catch (error) {
      console.error('Failed to load chat history:', error);
      setChatHistory([]);
    }
  };

  const handleSendMessage = async () => {
    if ((!inputValue.trim() && selectedImages.length === 0) || isLoading) return;

    setIsLoading(true);
    setConnectionError(null);

    // Upload images to Supabase Storage and get URLs
    const imageUrls: string[] = [];
    const imageDescriptions: string[] = [];
    
    if (selectedImages.length > 0) {
      console.log('Uploading images to storage...');
      
      for (const file of selectedImages) {
        const uploadedUrl = await uploadFileToStorage(file);
        if (uploadedUrl) {
          imageUrls.push(uploadedUrl);
          
          // Get image description for each uploaded image
          try {
            console.log('Describing image:', uploadedUrl);
            const description = await describeImage(uploadedUrl);
            console.log('Image description:', description);
            imageDescriptions.push(description);
          } catch (error) {
            console.error('Error describing image:', error);
            imageDescriptions.push('Unable to describe image.');
          }
        } else {
          console.error('Failed to upload image:', file.name);
        }
      }
      
      console.log('Uploaded image URLs:', imageUrls);
      console.log('Image descriptions:', imageDescriptions);
    }

    // Enhance message with image descriptions
    let enhancedMessage = inputValue;
    if (imageDescriptions.length > 0) {
      enhancedMessage += `\n\nImage Descriptions:\n${imageDescriptions.map((desc, index) => `Image ${index + 1}: ${desc}`).join('\n')}`;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue, // Store original message without descriptions
      isUser: true,
      timestamp: new Date().toISOString(),
      images: imageUrls // Use URLs instead of base64
    };

    const currentInput = inputValue;
    setInputValue('');
    setSelectedImages([]);
    setImagePreviews([]);

    // Update messages state with user message
    const updatedMessagesWithUser = [...messages, userMessage];
    setMessages(updatedMessagesWithUser);

    try {
      // Send enhanced message to API with image URLs
      const data = await chatAPI.sendMessage({
        message: enhancedMessage, // Send enhanced message with descriptions
        conversationId: conversationId || id,
        ...(imageUrls.length > 0 && { images: imageUrls }) // Send URLs instead of base64
      } as any);
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: data.response,
        isUser: false,
        timestamp: new Date().toISOString()
      };

      // Update messages state with AI response
      const finalMessages = [...updatedMessagesWithUser, aiMessage];
      setMessages(finalMessages);

      // Update conversation ID if it was created
      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId);
      }

      // Update the conversation in Supabase
      if (user?.id) {
        const conversationIdToUse = conversationId || id;
        console.log('Attempting to save conversation:', {
          id: conversationIdToUse,
          user: user.id,
          messagesCount: finalMessages.length
        });

        const { error } = await supabase
          .from('conversation')
          .upsert({
            id: conversationIdToUse,
            user: user.id,
            messages: finalMessages,
            created_at: new Date().toISOString()
          });

        if (error) {
          console.error('Error updating conversation - Full error:', JSON.stringify(error, null, 2));
          console.error('Error code:', error.code);
          console.error('Error message:', error.message);
          console.error('Error details:', error.details);
          console.error('Error hint:', error.hint);
        } else {
          console.log('Conversation saved successfully');
        }
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
        timestamp: new Date().toISOString()
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
      setSelectedImages([]);
      setImagePreviews([]);
      
      window.location.href = `/chat/${data.conversationId}`;
    } catch (error) {
      console.error('Failed to create new conversation:', error);
      setConnectionError(handleAPIError(error));
      
      setMessages([]);
      setCurrentChatId(null);
      setSidebarOpen(false);
      setSelectedImages([]);
      setImagePreviews([]);
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
      setSelectedImages([]);
      setImagePreviews([]);
      window.location.href = `/chat/${chatId}`;
    }
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Logout error:', error);
      } else {
        setUser(null);
        setUserEmail('');
        window.location.href = '/log-in';
      }
    } catch (error) {
      console.error('Logout error:', error);
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

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
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

          {/* Profile Section */}
          <div className="border-t border-gray-200 p-4">
            {/* Always visible logout button for testing */}
            {userEmail && (
              <button
                onClick={handleLogout}
                className="mb-2 w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors z-50 border border-red-200 bg-white"
              >
                <LogOut size={16} className="inline mr-2" />
                Log Out (Test Button)
              </button>
            )}
            <div className="relative group">
              <div
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                onMouseEnter={() => setShowLogout(true)}
                onMouseLeave={() => setShowLogout(false)}
              >
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                  <User size={16} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {user ? (user.email) : (<Link href='/log-in'>Log in</Link>)}
                  </div>
                </div>
              </div>
              {/* Logout Button - appears on hover */}
              {showLogout && userEmail && (
                <button
                  onClick={handleLogout}
                  className="absolute right-0 top-full mt-2 w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors z-50"
                  onMouseEnter={() => setShowLogout(true)}
                  onMouseLeave={() => setShowLogout(false)}
                >
                  <LogOut size={16} className="inline mr-2" />
                  Logout
                </button>
              )}
            </div>
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
                      {formatMessageTime(message.timestamp)}
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