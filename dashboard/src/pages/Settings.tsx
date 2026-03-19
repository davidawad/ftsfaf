/**
 * Settings page (placeholder)
 */

import React from 'react';

export function Settings() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-8">
        <div className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
          <h2 className="text-xl font-semibold mb-4">Coming Soon</h2>
          <p className="text-gray-600">
            Settings page is under development. Future features will include:
          </p>
          <ul className="mt-4 space-y-2 text-gray-600">
            <li>• Upload workflow files</li>
            <li>• Create and edit agents</li>
            <li>• Configure system settings</li>
            <li>• Manage API keys</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
