package api

import (
	"net/http"
	"net/netip"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// ---- rate limiting ----------------------------------------------------------

// ipLimiter holds a per-IP rate limiter and tracks the last time it was seen.
type ipLimiter struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// rateLimiterStore is the global per-IP limiter map.
type rateLimiterStore struct {
	mu       sync.Mutex
	limiters map[netip.Addr]*ipLimiter
}

var globalLimiters = &rateLimiterStore{
	limiters: make(map[netip.Addr]*ipLimiter),
}

// get returns the limiter for addr, creating one if it doesn't exist.
func (s *rateLimiterStore) get(addr netip.Addr, rps rate.Limit, burst int) *rate.Limiter {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, ok := s.limiters[addr]
	if !ok {
		entry = &ipLimiter{limiter: rate.NewLimiter(rps, burst)}
		s.limiters[addr] = entry
	}
	entry.lastSeen = time.Now()
	return entry.limiter
}

// cleanup removes limiters that haven't been seen for more than ttl.
func (s *rateLimiterStore) cleanup(ttl time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()
	cutoff := time.Now().Add(-ttl)
	for addr, entry := range s.limiters {
		if entry.lastSeen.Before(cutoff) {
			delete(s.limiters, addr)
		}
	}
}

// StartLimiterCleanup launches a background goroutine that purges stale limiters.
// Call once from main after the store is created.
func StartLimiterCleanup(ctx interface{ Done() <-chan struct{} }) {
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				globalLimiters.cleanup(10 * time.Minute)
			case <-ctx.Done():
				return
			}
		}
	}()
}

// remoteIP extracts the client IP, preferring X-Forwarded-For (set by Railway's proxy).
func remoteIP(r *http.Request) netip.Addr {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// X-Forwarded-For can be a comma-separated list; leftmost is the real client.
		if idx := strings.IndexByte(xff, ','); idx != -1 {
			xff = strings.TrimSpace(xff[:idx])
		}
		if addr, err := netip.ParseAddr(xff); err == nil {
			return addr
		}
	}
	// Fall back to RemoteAddr (host:port).
	addrPort, err := netip.ParseAddrPort(r.RemoteAddr)
	if err != nil {
		return netip.Addr{} // zero — bucket is shared but better than crashing
	}
	return addrPort.Addr()
}

// rateLimitMiddleware enforces a per-IP token bucket (rps requests/s, burst max).
func rateLimitMiddleware(rps float64, burst int) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := remoteIP(r)
			limiter := globalLimiters.get(ip, rate.Limit(rps), burst)
			if !limiter.Allow() {
				writeError(w, http.StatusTooManyRequests, "too many requests")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// maxBodyBytes is the maximum request body size accepted by any endpoint.
// 64 KB is generous for this app — the largest payload (tournament setup with
// many teams) is well under 10 KB.
const maxBodyBytes = 64 * 1024

// bodyLimitMiddleware rejects request bodies larger than maxBodyBytes.
func bodyLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
		}
		next.ServeHTTP(w, r)
	})
}

// securityHeadersMiddleware adds defensive HTTP response headers.
func securityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		// Prevent MIME-type sniffing.
		h.Set("X-Content-Type-Options", "nosniff")
		// Disallow this API from being framed (not a browser UI, but cheap defense).
		h.Set("X-Frame-Options", "DENY")
		// Don't include the full URL in Referer headers to third-party origins.
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		// Disable browser features the API server has no reason to expose.
		h.Set("Permissions-Policy", "geolocation=(), camera=(), microphone=()")
		next.ServeHTTP(w, r)
	})
}

// corsMiddleware applies CORS headers. allowedOrigins is a comma-separated list.
func corsMiddleware(allowedOrigins string) func(http.Handler) http.Handler {
	origins := make(map[string]bool)
	for _, o := range strings.Split(allowedOrigins, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			origins[o] = true
		}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origins[origin] {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Admin-Token")
			w.Header().Set("Access-Control-Max-Age", "86400")

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
