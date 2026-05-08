import { useCallback, useEffect, useState } from 'react'
import {
  detectDevice,
  getExistingSubscription,
  getPushSupport,
  resubscribeToSession,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/push'

export type PushStatus =
  | 'checking'
  | 'unsupported'
  | 'ios-needs-pwa'
  | 'permission-denied'
  | 'subscribed'
  | 'unsubscribed'

export function usePushNotifications(sessionId: string, claimedPlayerId?: string | null) {
  const [status, setStatus] = useState<PushStatus>('checking')
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    const support = getPushSupport()
    if (support === 'unsupported') { setStatus('unsupported'); return }
    if (support === 'ios-needs-pwa') { setStatus('ios-needs-pwa'); return }

    if (Notification.permission === 'denied') { setStatus('permission-denied'); return }

    const sub = await getExistingSubscription()
    if (sub) {
      try {
        await resubscribeToSession(sessionId, claimedPlayerId ?? undefined)
      } catch {
        // Server error during re-subscribe; subscription already exists locally,
        // so treat as still subscribed rather than surfacing an uncaught rejection.
      }
      setStatus('subscribed')
    } else {
      setStatus('unsubscribed')
    }
  }, [sessionId, claimedPlayerId])

  useEffect(() => { refresh() }, [refresh])

  const subscribe = useCallback(async () => {
    setLoading(true)
    try {
      const ok = await subscribeToPush(sessionId, claimedPlayerId ?? undefined)
      if (ok) setStatus('subscribed')
      else await refresh()
    } catch {
      // Permission denied by user
      await refresh()
    } finally {
      setLoading(false)
    }
  }, [sessionId, claimedPlayerId, refresh])

  const unsubscribe = useCallback(async () => {
    setLoading(true)
    try {
      await unsubscribeFromPush(sessionId)
      setStatus('unsubscribed')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  return { status, loading, subscribe, unsubscribe, device: detectDevice() }
}
