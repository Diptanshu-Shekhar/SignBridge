import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

// Read the expiry time (in ms) from a JWT without verifying it
function getTokenExpiry(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(payload));
    return decoded.exp ? decoded.exp * 1000 : null;
  } catch (e) {
    return null;
  }
}

function isTokenValid(token) {
  const expiry = getTokenExpiry(token);
  return expiry !== null && expiry > Date.now();
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('signbridge_token');
    localStorage.removeItem('signbridge_user');
  };

  useEffect(() => {
    // Check if user is already logged in with a token that has not expired
    const savedToken = localStorage.getItem('signbridge_token');
    const savedUser = localStorage.getItem('signbridge_user');

    if (savedToken && savedUser && isTokenValid(savedToken)) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    } else {
      logout();
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // If the server rejects the token (expired or invalid), log out
    // so the user is sent back to the login page for a fresh token
    const interceptor = axios.interceptors.response.use(
      response => response,
      error => {
        const status = error.response?.status;
        const url = error.config?.url || '';
        if (status === 401 && !url.includes('/auth/')) {
          logout();
        }
        return Promise.reject(error);
      }
    );

    // Also log out at the moment the current token expires
    let expiryTimer = null;
    if (token) {
      const expiry = getTokenExpiry(token);
      if (expiry) {
        // setTimeout cannot handle delays above ~24.8 days
        const delay = Math.min(expiry - Date.now(), 2147483647);
        expiryTimer = setTimeout(logout, Math.max(delay, 0));
      }
    }

    return () => {
      axios.interceptors.response.eject(interceptor);
      if (expiryTimer) clearTimeout(expiryTimer);
    };
  }, [token]);

  const login = (userData, userToken) => {
    setUser(userData);
    setToken(userToken);
    localStorage.setItem('signbridge_token', userToken);
    localStorage.setItem('signbridge_user', JSON.stringify(userData));
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
