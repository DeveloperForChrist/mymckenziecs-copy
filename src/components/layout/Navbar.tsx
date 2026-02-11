'use client'

import Link from 'next/link'
import { useState } from 'react'

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <header
      style={{ background: 'transparent' }}
      className="relative overflow-visible"
    >
      <nav className="navbar px-4 py-6">
        <div className="flex items-center justify-between w-full">

          {/* Mobile menu toggle */}
          <button
            className="menu-toggle md:hidden flex flex-col gap-1"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
          >
            <span className="block w-6 h-0.5 bg-gray-200"></span>
            <span className="block w-6 h-0.5 bg-gray-200"></span>
            <span className="block w-6 h-0.5 bg-gray-200"></span>
          </button>

          {/* Desktop menu */}
          <ul className="nav-menu hidden md:flex items-center gap-6 ml-auto">
            <li className="nav-item">
              <Link
                href="/auth/signup"
                className="nav-link px-[18px] py-[10px] text-3xl text-white font-bold rounded-[30px] transition-all duration-200 hover:underline hover:underline-offset-[6px] decoration-[3px]"
                style={{ backgroundColor: '#270427' }}
              >
                Sign up
              </Link>
            </li>
            <li className="nav-item">
              <Link
                href="/auth/signin"
                className="nav-link px-[18px] py-[10px] text-white text-3xl font-bold rounded-[30px] transition-all duration-200 hover:underline hover:underline-offset-[6px] decoration-[3px]"
                style={{ backgroundColor: '#270427' }}
              >
                Sign in
              </Link>
            </li>
          </ul>
        </div>

        {/* Mobile menu */}
        {isMenuOpen && (
          <ul className="nav-menu-mobile md:hidden mt-4 flex flex-col gap-4">
            <li className="nav-item">
              <Link
                href="/auth/signup"
                className="nav-link block px-[18px] py-[10px] text-white font-bold rounded-[30px] transition-all duration-200 hover:underline hover:underline-offset-[6px] decoration-[3px]"
                style={{ backgroundColor: '#270427' }}
                onClick={() => setIsMenuOpen(false)}
              >
                Sign up
              </Link>
            </li>
            <li className="nav-item">
              <Link
                href="/auth/signin"
                className="nav-link block px-[18px] py-[10px] text-white font-bold rounded-[30px] transition-all duration-200 hover:underline hover:underline-offset-[6px] decoration-[3px]"
                style={{ backgroundColor: '#270427' }}
                onClick={() => setIsMenuOpen(false)}
              >
                Sign in
              </Link>
            </li>
          </ul>
        )}
      </nav>
    </header>
  )
}
