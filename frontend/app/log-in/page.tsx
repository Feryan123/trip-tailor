"use client"
import React from 'react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import supabase from "@/lib/supabaseClient"
import { useRouter } from 'next/navigation'

const LogIn = () => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const login = async () => {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google', // or whatever provider
          options: {
            redirectTo: 'https://triptailor-ten.vercel.app/auth/callback' // Must match Supabase config
          }
        })

        if (error) {
            alert(`Error: ${error}`)
        }
    }

    useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // Redirect to chat after successful login
        router.push('/chat/new')
      }
    }
  )

  return () => subscription.unsubscribe()
}, [router])
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
                console.log('Auth state changed:', event, session)
                
                if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
                    setUser(session?.user || null)
                } else if (event === 'SIGNED_IN') {
                    setUser(session?.user || null)
                } else if (event === 'USER_UPDATED') {
                    setUser(session?.user || null)
                }
                
                setLoading(false)
            }
        )

        let sessionCheckInterval;
        if (user) {
            sessionCheckInterval = setInterval(() => {
                validateSession();
            }, 5 * 60 * 1000); // 5 minutes
        }

        return () => {
            subscription?.unsubscribe()
            if (sessionCheckInterval) {
                clearInterval(sessionCheckInterval)
            }
        }
    }, [user]) 
  return (
    <div className="">
        <nav className='absolute top-6 left-15 z-10'>
          <Link href='/'><h2 className='font-poppins font-semibold text-2xl'>TripTailor</h2></Link>
        </nav>
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <h2 className='font-inter font-medium text-2xl'>Log in</h2>
  
                <Link 
                href='#' 
                className="bg-themeblue text-white text-center font-semibold rounded-4xl py-2.5 my-4 px-8 w-80 
                            transition-colors duration-300 hover:bg-blue-600"
                >
                {user ? (
                <div>
                    <h2>{user.email}</h2> 
                </div>
            ) : (
                <button onClick={login} className='login logout-button'>
                    Login with Google
                </button>
            )}
                </Link>
       
        </div>
    </div>
  )
}

export default LogIn
