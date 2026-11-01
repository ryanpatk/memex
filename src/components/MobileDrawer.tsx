import type { AuthUser } from '@memex/core'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { repository } from '../data/repository'
import DarkModeToggle from './DarkModeToggle'

interface MobileDrawerProps {
  user: AuthUser | null
  isOpen: boolean
  onClose: () => void
}

const MobileDrawer = ({ user, isOpen, onClose }: MobileDrawerProps) => {
  const navigate = useNavigate()

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

  // Close drawer when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const drawer = document.getElementById('mobile-drawer')
      const hamburger = document.getElementById('mobile-hamburger')
      
      if (isOpen && drawer && !drawer.contains(event.target as Node) && 
          hamburger && !hamburger.contains(event.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  return (
    <>
      {isOpen && (
        <div
          className="mobile-drawer-backdrop"
          onClick={onClose}
        />
      )}

      <div
        id="mobile-drawer"
        className={`mobile-drawer ${isOpen ? 'is-open' : ''}`}
      >
        <div className="mobile-drawer-header">
          <div>
            <p className="mobile-drawer-eyebrow">Navigation</p>
            <h2 className="mobile-drawer-title">Console</h2>
          </div>
          <button
            onClick={onClose}
            className="mobile-drawer-close"
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        <div className="mobile-drawer-user">
          <img
            src={getAvatarUrl()}
            alt="User avatar"
            className="mobile-drawer-avatar"
          />
          <div className="mobile-drawer-user-copy">
            <p className="mobile-drawer-user-name">{getUserName()}</p>
            <p className="mobile-drawer-user-email">{user?.email}</p>
          </div>
        </div>

        <div className="mobile-drawer-body">
          <DarkModeToggle className="mobile-drawer-action" />
          <button
            onClick={handleLogout}
            className="mobile-drawer-logout"
          >
            Logout
          </button>
        </div>
      </div>
    </>
  )
}

export default MobileDrawer
