"use client";
import { useState, useEffect, ReactNode } from "react";

import { createContext, useContext } from "react";

interface AuthContextType {
    isAuthorized: boolean;
    signIn: () => void;
}

interface Props {
    children: ReactNode;
}

const AuthContextDefaultValues: AuthContextType =  {
    isAuthorized: false,
    signIn: () => {}
}

const AuthContext = createContext<AuthContextType>(AuthContextDefaultValues);

export function useAuth() {
    return useContext(AuthContext);    
}

export function AuthProvider({ children }: Props) {
    const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
    const signIn = () => {

    }

    const value = {
        isAuthorized,
        signIn
    }

    return (
        <>
            <AuthContext.Provider value={value}>
                {children}
            </AuthContext.Provider>
        </>
    )
}


