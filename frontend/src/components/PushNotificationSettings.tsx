import { Bell, BellOff, BellRing } from 'lucide-react'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { Button } from '@/components/ui/button'

export function PushNotificationSettings({ sessionId, claimedPlayerId }: { sessionId: string; claimedPlayerId?: string | null }) {
  const { status, loading, subscribe, unsubscribe, device } = usePushNotifications(sessionId, claimedPlayerId)

  if (status === 'checking') return null

  if (status === 'unsupported') {
    return (
      <div className="flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm text-muted-foreground">
        <BellOff className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Push notifications aren't supported on this browser
          {device.isIOS && device.iosVersion !== null && device.iosVersion < 16
            ? ' — update to iOS 16.4 or later to enable them'
            : ''}
          .
        </span>
      </div>
    )
  }

  if (status === 'ios-needs-pwa') {
    return (
      <div className="flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm text-muted-foreground">
        <Bell className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          To enable notifications on iOS, tap{' '}
          <span className="font-medium text-foreground">Share → Add to Home Screen</span>, then open
          the app from your Home Screen and come back here.
        </span>
      </div>
    )
  }

  if (status === 'permission-denied') {
    return (
      <div className="flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm text-muted-foreground">
        <BellOff className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Notifications are blocked. Allow them in your{' '}
          {device.isIOS ? 'iOS Settings → Safari → Notifications' : 'browser site settings'}, then
          reload.
        </span>
      </div>
    )
  }

  if (status === 'subscribed') {
    return (
      <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <BellRing className="h-4 w-4 text-green-500" />
          <span className="text-sm">Notifications on</span>
        </div>
        <Button size="sm" variant="ghost" onClick={unsubscribe} disabled={loading}>
          Turn off
        </Button>
      </div>
    )
  }

  // unsubscribed
  return (
    <div className="space-y-2">
      <Button className="w-full" variant="outline" onClick={subscribe} disabled={loading}>
        <Bell className="h-4 w-4 mr-2" />
        {loading ? 'Enabling…' : 'Turn on notifications'}
      </Button>
      <p className="text-xs text-muted-foreground">
        Get notified when a new round is generated or the session closes.
      </p>
    </div>
  )
}
