import React from 'react'
import Link from 'next/link'

const SignUp = () => {
  return (
    <div className="">
        <nav className='absolute top-6 left-15 z-10'>
          <Link href='/'><h2 className='font-poppins font-semibold text-2xl'>TripTailor</h2></Link>
        </nav>
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <h2 className='font-inter font-medium text-2xl'>Create an account</h2>
        <form className='p-3 flex gap-4 flex-col' action="">
            <div className="border border-gray-300 rounded-4xl py-2.5 px-8 w-80">
                <input type="email" placeholder='Email address'  />
            </div>
            <div className="border border-gray-300 rounded-4xl py-2.5 px-8 w-80">
                <input type="password" placeholder='Password'  />
            </div>
                <Link 
                href='#' 
                className="bg-themeblue text-white text-center font-semibold rounded-4xl py-2.5 px-8 w-80 
                            transition-colors duration-300 hover:bg-blue-600"
                >
                Sign up
                </Link>
        </form>
        <p className='text-sm font-inter'>Already have an account? <Link href='/log-in' className='text-themeblue font-semibold'>Log in</Link></p>
        </div>
    </div>
  )
}

export default SignUp
