import React, { useState } from 'react';

const PasswordScreen = ({ onAuthenticated }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    // Note: This is a basic client-side password check.
    // It's suitable for a private tool but not for high-security applications.
    if (password === process.env.REACT_APP_PASSWORD) {
      onAuthenticated();
    } else {
      setError('Incorrect password. Please try again.');
      setPassword('');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 text-gray-200">
      <div className="w-full max-w-sm p-8 space-y-8 bg-gray-800 rounded-2xl shadow-2xl border border-gray-700">
        <div>
          <h2 className="text-3xl font-bold text-center text-cyan-400">
            Weather Dashboard
          </h2>
          <p className="mt-2 text-center text-sm text-gray-400">
            Authentication Required
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="password" className="sr-only">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 text-white bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-shadow"
              placeholder="Enter Password"
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-center text-red-500">{error}</p>}
          <div>
            <button
              type="submit"
              className="w-full px-4 py-3 text-lg font-semibold text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-cyan-500 transition-colors"
            >
              Access Dashboard
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PasswordScreen;
