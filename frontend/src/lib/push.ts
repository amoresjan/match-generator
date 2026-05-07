import { api } from './api'

export type PushSupport = 'unsupported' | 'ios-needs-pwa' | 'supported'

function getIOSVersion(): number | null {
  const match = navigator.userAgent.match(/OS (\d+)[._]/)
  return match ? parseInt(match[1]) : null
}

export function detectDevice() {
  const ua = navigator.userAgent
  // iPadOS 13+ reports as Macintosh — detect via maxTouchPoints
  const isIPhone = /iPhone|iPod/.test(ua)
  const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  const isIOS = isIPhone || isIPad
  const isAndroid = /Android/.test(ua)
  const isStandalone =
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua)
  // iPadOS 13+ desktop UA won't have "OS NN_N" — iosVersion may be null for those
  const iosVersion = isIOS ? getIOSVersion() : null

  return { isIOS, isIPad, isIPhone, isAndroid, isStandalone, isSafari, iosVersion }
}

export function getPushSupport(): PushSupport {
  const { isIOS, isStandalone, iosVersion } = detectDevice()

  // Must check iOS BEFORE the PushManager check — on iOS Safari (non-standalone)
  // PushManager is not exposed at all, so the API check would incorrectly return 'unsupported'
  // instead of the actionable 'ios-needs-pwa'.
  if (isIOS) {
    if (iosVersion !== null && iosVersion < 16) return 'unsupported'
    if (!isStandalone) return 'ios-needs-pwa'
    // Standalone iOS 16.4+ — fall through to API check below
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported'
  }

  return 'supported'
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return new Uint8Array([...raw].map((c) => c.charCodeAt(0)))
}

export async function subscribeToPush(sessionId: string): Promise<boolean> {
  const support = getPushSupport()
  if (support !== 'supported') return false

  const reg = await navigator.serviceWorker.ready
  const { public_key } = await api.getVapidPublicKey()
  const applicationServerKey = urlBase64ToUint8Array(public_key) as BufferSource

  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
  const json = sub.toJSON()
  const keys = json.keys ?? {}

  await api.pushSubscribe(sessionId, {
    endpoint: sub.endpoint,
    p256dh: keys.p256dh ?? '',
    auth: keys.auth ?? '',
  })
  return true
}

export async function unsubscribeFromPush(sessionId: string): Promise<boolean> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return false
  await api.pushUnsubscribe(sessionId, sub.endpoint)
  await sub.unsubscribe()
  return true
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}
