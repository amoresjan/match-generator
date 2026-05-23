CREATE TABLE IF NOT EXISTS sessions_app_session (
    id               UUID         PRIMARY KEY,
    admin_token      UUID         NOT NULL UNIQUE,
    name             VARCHAR(120) NOT NULL,
    match_type       VARCHAR(3)   NOT NULL DEFAULT '2v2',
    num_courts       SMALLINT     NOT NULL DEFAULT 1,
    generation_mode  VARCHAR(11)  NOT NULL DEFAULT 'fair',
    sport_type       VARCHAR(10)  NOT NULL DEFAULT 'pickleball',
    session_mode     VARCHAR(10)  NOT NULL DEFAULT 'rotation',
    tournament_data  JSONB,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    auto_deactivated BOOLEAN      NOT NULL DEFAULT FALSE,
    last_round_at    TIMESTAMPTZ,
    removed_players  JSONB        NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS sessions_app_player (
    id                   UUID        PRIMARY KEY,
    session_id           UUID        NOT NULL REFERENCES sessions_app_session(id) ON DELETE CASCADE,
    name                 VARCHAR(80) NOT NULL,
    permanent_partner_id UUID        UNIQUE REFERENCES sessions_app_player(id) ON DELETE SET NULL,
    total_wait_rounds    INTEGER     NOT NULL DEFAULT 0,
    sit_out              BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, name)
);

CREATE INDEX IF NOT EXISTS idx_player_sit_out ON sessions_app_player(sit_out);

CREATE TABLE IF NOT EXISTS sessions_app_round (
    id         UUID        PRIMARY KEY,
    session_id UUID        NOT NULL REFERENCES sessions_app_session(id) ON DELETE CASCADE,
    number     INTEGER     NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, number)
);

CREATE TABLE IF NOT EXISTS sessions_app_match (
    id            UUID     PRIMARY KEY,
    round_id      UUID     NOT NULL REFERENCES sessions_app_round(id) ON DELETE CASCADE,
    court_number  SMALLINT NOT NULL,
    team1_players JSONB    NOT NULL DEFAULT '[]',
    team2_players JSONB    NOT NULL DEFAULT '[]',
    winner        VARCHAR(5),
    UNIQUE(round_id, court_number)
);

CREATE INDEX IF NOT EXISTS idx_match_round_winner ON sessions_app_match(round_id, winner);

CREATE TABLE IF NOT EXISTS sessions_app_pushsubscription (
    id         BIGSERIAL   PRIMARY KEY,
    session_id UUID        NOT NULL REFERENCES sessions_app_session(id) ON DELETE CASCADE,
    endpoint   TEXT        NOT NULL UNIQUE,
    p256dh     TEXT        NOT NULL,
    auth       TEXT        NOT NULL,
    player_id  UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions_app_playerroundhistory (
    id           BIGSERIAL PRIMARY KEY,
    player_id    UUID      NOT NULL REFERENCES sessions_app_player(id) ON DELETE CASCADE,
    round_id     UUID      NOT NULL REFERENCES sessions_app_round(id) ON DELETE CASCADE,
    partner_ids  JSONB     NOT NULL DEFAULT '[]',
    opponent_ids JSONB     NOT NULL DEFAULT '[]',
    sat_out      BOOLEAN   NOT NULL DEFAULT FALSE,
    UNIQUE(player_id, round_id)
);
