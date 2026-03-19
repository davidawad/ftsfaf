/**
 * Main App component
 */

import React, { useState } from 'react';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';

type Page = 'dashboard' | 'settings';

export function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');

  return (
    <div>
      {/* Simple navigation */}
      <nav className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-8 py-3">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setCurrentPage('dashboard')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                currentPage === 'dashboard'
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setCurrentPage('settings')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                currentPage === 'settings'
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              Settings
            </button>
          </div>
        </div>
      </nav>

      {/* Page content */}
      {currentPage === 'dashboard' && <Dashboard />}
      {currentPage === 'settings' && <Settings />}
    </div>
  );
}
