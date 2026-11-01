import type { AuthUser } from '@memex/core'
import { useState, useEffect, useRef } from 'react'
import { repository } from '../data/repository'
import { useNavigate } from 'react-router-dom'
import DarkModeToggle from './DarkModeToggle'

interface UserProfileProps {
  user: AuthUser | null
  isMobile?: boolean
}

const UserProfile = ({ user, isMobile = false }: UserProfileProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [avatarLoaded, setAvatarLoaded] = useState(false)
  const navigate = useNavigate()
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleLogout = async () => {
    try {
      await repository.auth.signOut()
      navigate('/')
    } catch (error) {
      console.error('Error logging out:', error)
    }
  }

  const getAvatarUrl = () => {
    if (user?.user_metadata?.avatar_url) {
      return user.user_metadata.avatar_url
    }
    // Generate a fallback avatar using the user's email initial
    const initial = user?.email?.charAt(0).toUpperCase() || 'U'
    return `https://ui-avatars.com/api/?name=${initial}&background=0328F1&color=F7FAFF&size=40&format=png&bold=true&font-size=0.6`
  }

  const getUserName = () => {
    return user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'User'
  }

  if (isMobile) {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="app-icon-button"
          aria-label="Open user menu"
        >
          ☰
        </button>

        {isOpen && (
          <div className="user-menu">
            <div className="user-menu-section">
              <div className="flex items-center gap-3">
                <div className="header-user-avatar">
                  <img
                    src={getAvatarUrl()}
                    alt="User avatar"
                    className="header-user-image is-visible"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="user-menu-label">Signed in</p>
                  <p className="user-menu-email">{getUserName()}</p>
                  <p className="user-menu-email">{user?.email}</p>
                </div>
              </div>
            </div>
            <div className="user-menu-actions">
              <DarkModeToggle className="user-menu-action" />
              <button
                onClick={handleLogout}
                className="user-menu-action user-menu-logout"
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Desktop version
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="header-user-button"
      >
        <div className="header-user-avatar">
          <img
            src={getAvatarUrl()}
            alt="User avatar"
            className={`header-user-image ${avatarLoaded ? 'is-visible' : ''}`}
            onLoad={() => setAvatarLoaded(true)}
            onError={() => setAvatarLoaded(true)}
          />
          {!avatarLoaded && (
            <div className="header-user-skeleton" />
          )}
        </div>
        <span className="header-user-name">{getUserName()}</span>
      </button>

      {isOpen && (
        <div className="user-menu">
          <div className="user-menu-section">
            <p className="user-menu-label">Signed in</p>
            <p className="user-menu-email">{user?.email}</p>
          </div>
          <div className="user-menu-actions">
            <DarkModeToggle className="user-menu-action" />
            <button
              onClick={handleLogout}
              className="user-menu-action user-menu-logout"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default UserProfile
