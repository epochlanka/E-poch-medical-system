import React, { useState } from 'react';
import axios from 'axios';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!username || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    
    try {
      // Assuming backend is running on port 3000
      const response = await axios.post('http://localhost:3000/api/v1/auth/login', {
        username,
        password
      });
      
      const { token, user } = response.data;
      
      // Save token (usually in memory or secure storage, but localStorage is common for testing)
      localStorage.setItem('epoch_token', token);
      localStorage.setItem('epoch_user', JSON.stringify(user));
      
      setSuccess(true);
      // Here you would typically redirect to a Dashboard
      
    } catch (err: any) {
      if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError('An unexpected error occurred. Is the backend running?');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-layout">
        <div className="auth-card glass-surface text-center">
          <div className="logo-container">
            <div className="logo-icon" style={{ background: 'var(--success)', boxShadow: '0 4px 12px rgba(46, 204, 113, 0.3)' }}>✓</div>
          </div>
          <h2>Welcome Back!</h2>
          <p className="text-muted mb-4">You have successfully logged in.</p>
          <button className="btn btn-primary" onClick={() => setSuccess(false)}>Log Out (Test)</button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-layout">
      <div className="auth-card glass-surface">
        <div className="logo-container">
          <div className="logo-icon">EP</div>
        </div>
        
        <h2 className="text-center">Sign In</h2>
        <p className="text-center text-muted mb-4">Access the E-Poch Medical System</p>
        
        <form onSubmit={handleLogin}>
          <div className="input-group">
            <label htmlFor="username">Username</label>
            <input 
              id="username"
              type="text" 
              className="input-field" 
              placeholder="e.g., admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
            />
          </div>
          
          <div className="input-group">
            <label htmlFor="password">Password</label>
            <input 
              id="password"
              type="password" 
              className="input-field" 
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>
          
          {error && <div className="text-error text-center mb-4">{error}</div>}
          
          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ width: '100%' }}
            disabled={loading}
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
