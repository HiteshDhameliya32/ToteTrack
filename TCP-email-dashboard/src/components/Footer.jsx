import React from 'react';

export default function Footer() {
  return (
    <footer className="mt-8 border-t border-slate-200 bg-white py-6 px-4 md:px-8 shadow-sm rounded-t-xl mx-4 lg:mx-8">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="font-bold text-lg text-slate-800 tracking-tight">Pixcels<span className="text-indigo-600">Themes</span></span>
            <span className="text-xs text-slate-500">Innovative IT & Automation Solutions for Your Business</span>
          </div>
        </div>
        <div>
          <a
            href="https://www.pixcelsthemes.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-slate-50 hover:bg-slate-100 text-indigo-600 font-medium text-sm px-4 py-2 rounded-lg transition-colors border border-slate-200 shadow-sm hover:shadow"
          >
            Visit Website
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
