package generator

import (
	"crypto/md5"
	"encoding/binary"
	"fmt"
	"math/rand"

	"github.com/google/uuid"
)

// newSeededRNG creates a deterministic RNG from sessionID + roundNumber.
// Same inputs always produce the same shuffle and matchups, so previews
// remain stable across requests.
func newSeededRNG(sessionID uuid.UUID, roundNumber int) *rand.Rand {
	key := fmt.Sprintf("%s:%d", sessionID, roundNumber)
	h := md5.Sum([]byte(key))
	seed := binary.BigEndian.Uint64(h[:8])
	//nolint:gosec // intentionally weak RNG — fairness, not security
	return rand.New(rand.NewSource(int64(seed)))
}
