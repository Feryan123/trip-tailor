import React, { useState } from 'react'
import {Link, useNavigate} from "react-router-dom"
import { UserAuth } from '../context/AuthContext'

const Signup = () => {
  const[email, setEmail] = useState('')
  const[password, setPassword] = useState('')
  const[error, setError] = useState('')
  const[loading, setLoading] = useState(false)

  const{session, signUpNewUser} = UserAuth();
  const navigate = useNavigate()
  console.log(session)

  const handleSignup =async (e) => {
    e.preventDefault()
    setLoading(true)
    try{
      const result = await signUpNewUser(email, password)

      if(result.success){
        navigate('/dashboard')
      }
    } catch(err){
      setError("an error occured")
    } finally{
      setLoading(false)
    }
  }

  return (
    <div>
      <form onSubmit={handleSignup} className='max-w-md m-auto pt-24'>
        <h2 className='font-bold pb-2'>Sign up today!</h2>
        <p>
          Already have an account? <Link to='/signin'>Sign in!</Link>
        </p>
        <div className='flex flex-col py-4'>
          <input 
            value={email}
            onChange={(e) => setEmail(e.target.value)} 
            placeholder='Email' 
            className='p-3 mt-6' 
            type='email'
          />
          <input 
            value={password}
            onChange={(e) => setPassword(e.target.value)} 
            placeholder='Password' 
            className='p-3 mt-2' 
            type='password'
          />
          <button type='submit' disabled={loading} className='mt-4'>
            Sign up
          </button>
          {error && <p className='text-red600 text-center pt-4'>{error}</p>}
        </div>
      </form>
    </div>
  )
}

export default Signup
