-- D1 database schema for GDX travel itinerary
CREATE TABLE IF NOT EXISTS trip_segments (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  from_st   TEXT NOT NULL,
  to_st     TEXT NOT NULL,
  date      TEXT,
  dep_time  TEXT,
  train_no  TEXT,
  price     REAL,
  note      TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
