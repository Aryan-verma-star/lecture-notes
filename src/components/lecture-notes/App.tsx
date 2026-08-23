'use client'

import { useEffect } from 'react'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { ToastProvider } from '@/context/ToastContext'
import { Layout } from '@/components/lecture-notes/Layout'
import { LoginView } from '@/components/lecture-notes/views/LoginView'
import { RegisterView } from '@/components/lecture-notes/views/RegisterView'
import { SubjectsView } from '@/components/lecture-notes/views/SubjectsView'
import { SubjectDetailView } from '@/components/lecture-notes/views/SubjectDetailView'
import { RecordView } from '@/components/lecture-notes/views/RecordView'
import { LectureDetailView } from '@/components/lecture-notes/views/LectureDetailView'
import { SettingsView } from '@/components/lecture-notes/views/SettingsView'
import { navigate, useHashRoute } from '@/lib/router'

function LoadingScreen() {
  return (
    <div className="app-loading">
      <div className="loading-logo">
        <span className="loading-mark" aria-hidden="true" />
        <span className="subheading">Lecture Notes</span>
      </div>
    </div>
  )
}

function AuthScreen({ path }: { path: string }) {
  return path === '/register' ? <RegisterView /> : <LoginView />
}

function AppRoutes() {
  const { user, loading, logout } = useAuth()
  const route = useHashRoute()

  // Auth redirects
  useEffect(() => {
    if (loading) return
    if (user && (route.path === '/login' || route.path === '/register')) {
      navigate('/subjects')
    }
  }, [user, loading, route.path])

  if (loading) return <LoadingScreen />
  if (!user) return <AuthScreen path={route.path} />

  const [root, arg] = route.segments

  let content: React.ReactNode
  let wide = false

  switch (root) {
    case 'record':
      content = <RecordView preselectSubjectId={route.query.get('subject')} />
      break
    case 'subjects':
      content = arg ? <SubjectDetailView key={arg} subjectId={arg} /> : <SubjectsView />
      break
    case 'lectures':
      wide = true
      content = arg ? <LectureDetailView key={arg} lectureId={arg} /> : <SubjectsView />
      break
    case 'settings':
      content = <SettingsView />
      break
    default:
      content = <SubjectsView />
  }

  return (
    <Layout path={route.path} email={user.email} wide={wide} onSignOut={logout}>
      {content}
    </Layout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  )
}
