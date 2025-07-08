"use client";
import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { chatAPI, handleAPIError } from "@/lib/api";
import { Trash2 } from "lucide-react";
import supabase from "@/lib/supabaseClient";

export default function Home() {
  const router = useRouter();
  const [placeholder, setPlaceholder] = useState('');
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [isErasing, setIsErasing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userEmail, setUserEmail] = useState<string>('');


  const texts = [
    "Plan a trip for me and my partner for 5 days. We are going to Japan from NYC on the 27th with a budget of $2200. Refer to these images for our dream trip.",
    "Me and my two friends are going to Los Angeles and San Diego for 6 days from Chicago. Each of us has a budget of $1500. Give fun recommendations and include Disneyland!",
    "I'm solo travelling for a week in Bali starting from Sydney next week. I have $2000 to spend. I want to visit beaches, see the culture, and meet people."
  ];

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

  useEffect(() => {
    let index = isErasing ? texts[currentTextIndex].length : 0;
    
    const timer = setInterval(() => {
      const currentText = texts[currentTextIndex];
      
      if (!isErasing) {
        if (index < currentText.length) {
          setPlaceholder(currentText.slice(0, index + 1));
          index++;
        } else {
          clearInterval(timer);
          setTimeout(() => setIsErasing(true), 2000);
        }
      } else {
        if (index > 0) {
          setPlaceholder(currentText.slice(0, index - 1));
          index--;
        } else {
          clearInterval(timer);
          setIsErasing(false);
          setCurrentTextIndex((prev) => (prev + 1) % texts.length);
        }
      }
    }, isErasing ? 15 : 25); // Erase faster than type
    
    return () => clearInterval(timer);
  }, [currentTextIndex, isErasing]);

  // Get user session
  useEffect(() => {
    const getSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Session error:', error)
          return
        }
        setUser(session?.user || null)
      } catch (error) {
        console.error('Error getting session:', error)
      } finally {
        setLoading(false)
      }
    }

    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user || null)
        setLoading(false)
      }
    )

    return () => {
      subscription?.unsubscribe()
    }
  }, [])

  // Audio recording effects

  // Upload file to Supabase Storage
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

  // Voice recording functions
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

  const handleStartPlanning = async () => {
    if (!inputValue.trim() && selectedImages.length === 0) {
      setError('Please describe your travel plans or upload images');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('Starting planning with message:', inputValue);
      console.log('Selected images:', selectedImages.length);
      
      const imageUrls: string[] = [];
      
      if (selectedImages.length > 0) {
        console.log('Uploading images to storage...');
        
        for (const file of selectedImages) {
          const uploadedUrl = await uploadFileToStorage(file);
          if (uploadedUrl) {
            imageUrls.push(uploadedUrl);
          } else {
            console.error('Failed to upload image:', file.name);
          }
        }
        
        console.log('Uploaded image URLs:', imageUrls);
      }
      
      const conversationData = await chatAPI.createConversation();
      console.log('✅ Created conversation:', conversationData.conversationId);
      
      sessionStorage.setItem('initialMessage', inputValue);
      sessionStorage.setItem('newConversationId', conversationData.conversationId);
      
      if (imageUrls.length > 0) {
        sessionStorage.setItem('initialImages', JSON.stringify(imageUrls));
      }
      
      console.log('Stored in sessionStorage:', {
        initialMessage: inputValue,
        conversationId: conversationData.conversationId,
        imageUrls: imageUrls.length
      });
      
      // Small delay to ensure sessionStorage is set
      await new Promise(resolve => setTimeout(resolve, 100));
      
      console.log('🔄 Redirecting to chat page...');
      router.push(`/chat/${conversationData.conversationId}`);
      
    } catch (error) {
      console.error('Failed to start planning:', error);
      setError(handleAPIError(error));
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleStartPlanning();
    }
  };

  const handleSamplePromptClick = (prompt: string) => {
    setInputValue(prompt);
  };

  return (
    <div className="home">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageSelect}
        accept="image/*"
        multiple
        className="hidden"
      />

      <div className="mesh-background h-screen">
        <nav className='absolute top-0 left-0 right-0 z-10 items-center justify-between flex pt-6 px-15'>
          <Link href='/'><h2 className='font-poppins font-semibold text-2xl'>TripTailor</h2></Link>
          {userEmail ? (<Link href='/chat/new'>{userEmail}</Link>) : (<Link href='/log-in' className="font-andika text-md">LOG IN</Link>)}
        </nav>
        
        <div className="cta drop-shadow-xs flex flex-col items-center gap-6 justify-center h-full">
          <h1 className="font-poppins font-medium text-center text-4xl">
            <u>Seamless</u> itinerary planning <br />
            with your smart travel sidekick.
          </h1>
          
          <div className="chatbot w-[43rem] rounded-3xl bg-[#FFF] shadow-lg">
            

            {/* Image previews */}
            {imagePreviews.length > 0 && (
              <div className="mx-5 mt-4">
                <div className="flex flex-wrap gap-2">
                  {imagePreviews.map((preview, index) => (
                    <div key={index} className="relative">
                      <img
                        src={preview}
                        alt={`Preview ${index + 1}`}
                        className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                      />
                      <button
                        onClick={() => removeImage(index)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <textarea 
              placeholder={inputValue ? "" : placeholder}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              className="text-lg w-full px-5 pt-4 resize-none overflow-hidden border-none outline-none"
              rows={3}
              disabled={isLoading}
            />          
            
            <div className="icons flex items-center justify-between px-5 pt-2 pb-4">
              <button 
                onClick={handleImageUpload}
                className="hover:cursor-pointer transition-opacity hover:opacity-70"
                disabled={isLoading || !userEmail || selectedImages.length >= 1}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="29" height="29" viewBox="0 0 29 29" fill="none">
                  <path d="M3.625 7.625C3.625 5.41586 5.41586 3.625 7.625 3.625H21.375C23.5841 3.625 25.375 5.41586 25.375 7.625V21.375C25.375 23.5841 23.5841 25.375 21.375 25.375H7.625C5.41586 25.375 3.625 23.5841 3.625 21.375V7.625Z" stroke="#222222" strokeWidth="2"/>
                  <path d="M3.625 18.125L7.368 14.382C8.25033 13.4997 9.7163 13.6318 10.4266 14.6578L13.2664 18.7596C13.9311 19.7197 15.2735 19.9085 16.1773 19.1691L19.745 16.2501C20.5402 15.5995 21.6991 15.6573 22.4257 16.3839L25.375 19.3333" stroke="#222222" strokeWidth="2"/>
                  <circle cx="19.3333" cy="9.66667" r="2.41667" fill="#222222"/>
                </svg>
              </button>

              <div className="flex gap-2">


                <button 
                  onClick={handleStartPlanning}
                  disabled={(!inputValue.trim() && selectedImages.length === 0) || isLoading}
                  className="hover:cursor-pointer transition-all duration-200 hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <div className="w-7 h-7 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M19.4354 0.581983C18.9352 0.0685981 18.1949 -0.122663 17.5046 0.0786645L1.408 4.75952C0.679698 4.96186 0.163487 5.54269 0.0244302 6.28055C-0.117628 7.0315 0.378575 7.98479 1.02684 8.38342L6.0599 11.4768C6.57611 11.7939 7.24239 11.7144 7.66956 11.2835L13.4329 5.4843C13.723 5.18231 14.2032 5.18231 14.4934 5.4843C14.7835 5.77623 14.7835 6.24935 14.4934 6.55134L8.71999 12.3516C8.29181 12.7814 8.21178 13.4508 8.52691 13.9702L11.6022 19.0538C11.9623 19.6577 12.5826 20 13.2628 20C13.3429 20 13.4329 20 13.513 19.9899C14.2933 19.8893 14.9135 19.3558 15.1436 18.6008L19.9156 2.52479C20.1257 1.84028 19.9356 1.09537 19.4354 0.581983" fill="black"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mx-5 mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}
          </div>

          {/* Sample Prompts */}
          <div className="sample-prompts max-w-4xl mx-auto">
            <p className="text-center text-gray-600 mb-4 font-medium">Try these examples:</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {texts.map((text, index) => (
                <button
                  key={index}
                  onClick={() => handleSamplePromptClick(text)}
                  className="p-4 bg-white/80 hover:bg-white border border-gray-200 hover:border-blue-300 rounded-xl text-left text-sm transition-all duration-200 hover:shadow-md hover:scale-105"
                  disabled={isLoading}
                >
                  <p className="text-gray-700 line-clamp-3">{text}</p>
                </button>
              ))}
            </div>
            <p className="text-center text-gray-600 mt-4 font-medium">For image functionality log in.</p>
          </div>
        </div>
      </div>

      <div className="benefits flex flex-col mt-15 mb-20">
        <h1 className="font-poppins font-semibold text-5xl text-center">Why TripTailor?</h1>
        <div className="reasons flex justify-center items-start gap-30">
          <div className="card font-poppins flex min-w-15 text-center max-w-50 flex-col mt-15 items-center justify-center gap-4">
            <h2 className="font-semibold text-2xl">Time Efficient</h2>
            <svg xmlns="http://www.w3.org/2000/svg" width="99" height="99" viewBox="0 0 99 99" fill="none">
              <path fillRule="evenodd" clipRule="evenodd" d="M49.5 98.2505C22.59 98.2505 0.75 76.4592 0.75 49.5005C0.75 22.5905 22.59 0.750488 49.5 0.750488C76.4587 0.750488 98.25 22.5905 98.25 49.5005C98.25 76.4592 76.4587 98.2505 49.5 98.2505ZM65.0512 67.5867C65.6362 67.928 66.27 68.123 66.9525 68.123C68.1712 68.123 69.39 67.4892 70.0725 66.3192C71.0962 64.613 70.56 62.3705 68.805 61.298L51.45 50.963V28.4405C51.45 26.393 49.7925 24.7842 47.7937 24.7842C45.795 24.7842 44.1375 26.393 44.1375 28.4405V53.0592C44.1375 54.3267 44.82 55.4967 45.9412 56.1792L65.0512 67.5867Z" fill="url(#paint0_linear_26_11)"/>
              <defs>
                <linearGradient id="paint0_linear_26_11" x1="49.5" y1="0.750488" x2="49.5" y2="98.2505" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#7BB1F7"/>
                  <stop offset="1" stopColor="#5A98EE"/>
                </linearGradient>
              </defs>
            </svg>
            <p>
              One prompt and an itinerary done. No need to search for hours!
            </p>
          </div>
          <div className="card font-poppins flex min-w-15 text-center max-w-50 flex-col mt-15 items-center justify-center gap-4">
            <h2 className="font-semibold text-2xl">Personalized</h2>
            <svg xmlns="http://www.w3.org/2000/svg" width="79" height="99" viewBox="0 0 79 99" fill="none">
              <path d="M39.5 64.9727C60.6508 64.9727 78.5 68.4098 78.5 81.6699C78.5 94.9349 60.5338 98.25 39.5 98.25C18.3541 98.25 0.5 94.8129 0.5 81.5527C0.500201 68.2879 18.4664 64.9727 39.5 64.9727ZM39.5 0.75C53.8281 0.75 65.3086 12.2259 65.3086 26.5439C65.3086 40.8619 53.8281 52.3428 39.5 52.3428C25.1768 52.3428 13.6914 40.8619 13.6914 26.5439C13.6914 12.2259 25.1768 0.75 39.5 0.75Z" fill="url(#paint0_linear_26_2)"/>
              <defs>
                <linearGradient id="paint0_linear_26_2" x1="39.5" y1="0.75" x2="39.5" y2="98.25" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#7BB1F7"/>
                  <stop offset="1" stopColor="#5A98EE"/>
                </linearGradient>
              </defs>
            </svg>
            <p>
              Want a fun trip? On a budget? Got a specific photo reference? TripTailor personalizes the itinerary just for you.              
            </p>
          </div>
          <div className="card font-poppins flex min-w-15 text-center max-w-50 flex-col mt-15 items-center justify-center gap-4">
            <h2 className="font-semibold text-2xl">Stress Free</h2>
            <svg xmlns="http://www.w3.org/2000/svg" width="99" height="93" viewBox="0 0 99 93" fill="none">
              <path d="M78.3526 57.8105C77.0899 59.0341 76.5098 60.8037 76.7974 62.5392L81.1313 86.5242C81.4969 88.5571 80.6389 90.6144 78.9376 91.7892C77.2703 93.008 75.0522 93.1542 73.2338 92.1792L51.6424 80.918C50.8917 80.5182 50.0581 80.3037 49.2049 80.2794H47.8838C47.4256 80.3476 46.9771 80.4939 46.5676 80.7181L24.9713 92.033C23.9037 92.5692 22.6947 92.7594 21.5101 92.5692C18.6241 92.0232 16.6984 89.2737 17.1713 86.3731L21.5101 62.3881C21.7977 60.638 21.2176 58.8586 19.9549 57.6155L2.35132 40.553C0.879067 39.1246 0.367191 36.9796 1.03994 35.0442C1.69319 33.1137 3.36044 31.7049 5.37382 31.388L29.6026 27.8731C31.4453 27.683 33.0638 26.5617 33.8926 24.9042L44.5688 3.01549C44.8223 2.52799 45.1489 2.07949 45.5438 1.69924L45.9826 1.35799C46.2117 1.10449 46.4749 0.894863 46.7674 0.724238L47.2988 0.529238L48.1276 0.187988H50.1799C52.0129 0.378113 53.6266 1.47499 54.4699 3.11299L65.2876 24.9042C66.0676 26.4984 67.5837 27.605 69.3338 27.8731L93.5626 31.388C95.6101 31.6805 97.3212 33.0942 97.9988 35.0442C98.6374 36.9991 98.0866 39.1441 96.5851 40.553L78.3526 57.8105Z" fill="url(#paint0_linear_26_9)"/>
              <defs>
                <linearGradient id="paint0_linear_26_9" x1="49.5044" y1="0.187988" x2="49.5044" y2="92.8192" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#7BB1F7"/>
                  <stop offset="1" stopColor="#5A98EE"/>
                </linearGradient>
              </defs>
            </svg>
            <p>
              All the details managed in one place-flights, hotels, and activities. You won't miss a thing.
            </p>
          </div>
        </div>
        <Link 
          href='/chat/new' 
          className="bg-themeblue mx-auto mt-15 text-white text-center font-semibold rounded-4xl text-2xl py-3 px-8 w-50 
                    transform transition-all duration-300 ease-in-out 
                    hover:scale-105 hover:bg-blue-600 hover:shadow-lg"
        >
          Get Started
        </Link>
      </div>
    </div>
  );
}