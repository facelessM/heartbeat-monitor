import { useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { SessionRecap } from './useSessionRecap'

const STORAGE_KEY = 'heartbeat.sessionHistory'
// Cap stored history so the list (and AsyncStorage payload) stays bounded.
const MAX_SESSIONS = 50

// Persists finished sessions so they can be reviewed later in the Sessions tab.
// Newest first.
export function useSessionHistory() {
  const [sessions, setSessions] = useState<SessionRecap[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (cancelled || !raw) return
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setSessions(parsed)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const persist = useCallback((next: SessionRecap[]) => {
    setSessions(next)
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {})
  }, [])

  const add = useCallback(
    (recap: SessionRecap) => {
      setSessions(prev => {
        // Guard against double-adds of the same finished session.
        if (prev.some(s => s.endedAt === recap.endedAt)) return prev
        const next = [recap, ...prev].slice(0, MAX_SESSIONS)
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {})
        return next
      })
    },
    [],
  )

  const remove = useCallback(
    (endedAt: number) => persist(sessions.filter(s => s.endedAt !== endedAt)),
    [persist, sessions],
  )

  const clear = useCallback(() => persist([]), [persist])

  return { sessions, loaded, add, remove, clear }
}
