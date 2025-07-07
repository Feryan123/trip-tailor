import React from "react";
import { Navigate } from "react-router-dom";
import { UserAuth } from "../context/AuthContext";

const PrivateRoute = ({children}) => {
    const {session} = UserAuth()
    if(session === undefined) {
        return <p>Loading...</p>
    }
    return session ? <>{children}</> : <Navigate to='/signup'/>
}

export default PrivateRoute