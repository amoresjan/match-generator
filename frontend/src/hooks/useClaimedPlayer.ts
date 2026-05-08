import { useState } from 'react'

function storageKey(sessionId: string) {
  return `claimed_player:${sessionId}`
}

export function useClaimedPlayer(sessionId: string) {
  const [claimedPlayerId, setClaimedPlayerId] = useState<string | null>(
    () => localStorage.getItem(storageKey(sessionId)),
  )

  function claimPlayer(playerId: string) {
    localStorage.setItem(storageKey(sessionId), playerId)
    setClaimedPlayerId(playerId)
  }

  function clearClaim() {
    localStorage.removeItem(storageKey(sessionId))
    setClaimedPlayerId(null)
  }

  return { claimedPlayerId, claimPlayer, clearClaim }
}
