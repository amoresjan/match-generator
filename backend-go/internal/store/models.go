package store

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Session struct {
	ID              uuid.UUID
	AdminToken      uuid.UUID
	Name            string
	MatchType       string
	NumCourts       int
	GenerationMode  string
	SportType       string
	SessionMode     string
	TournamentData  json.RawMessage // nil when NULL
	CreatedAt       time.Time
	IsActive        bool
	AutoDeactivated bool
	LastRoundAt     *time.Time
	RemovedPlayers  json.RawMessage // always set; default {}
}

type Player struct {
	ID                 uuid.UUID
	SessionID          uuid.UUID
	Name               string
	PermanentPartnerID *uuid.UUID
	TotalWaitRounds    int
	SitOut             bool
	CreatedAt          time.Time
}

// PlayerWithPartner extends Player with denormalised partner fields for API responses.
type PlayerWithPartner struct {
	Player
	PartnerName *string
}

type Round struct {
	ID        uuid.UUID
	SessionID uuid.UUID
	Number    int
	CreatedAt time.Time
}

type Match struct {
	ID           uuid.UUID
	RoundID      uuid.UUID
	CourtNumber  int
	Team1Players []string
	Team2Players []string
	Winner       *string
}

type RoundWithMatches struct {
	Round
	Matches []Match
}

type PushSubscription struct {
	ID        int64
	SessionID uuid.UUID
	Endpoint  string
	P256DH    string
	Auth      string
	PlayerID  *uuid.UUID
	CreatedAt time.Time
}

type PlayerRoundHistory struct {
	ID          int64
	PlayerID    uuid.UUID
	RoundID     uuid.UUID
	PartnerIDs  []string
	OpponentIDs []string
	SatOut      bool
}

// HistoryRow is the flat projection returned by the history query for the generator.
type HistoryRow struct {
	PlayerID    uuid.UUID
	PartnerIDs  []string
	OpponentIDs []string
	SatOut      bool
	RoundNumber int
}
