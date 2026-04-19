-- ============================================================
-- SCHEMA.SQL — Test Portal
-- Run this in Supabase SQL Editor
-- ============================================================

-- TEAMS
CREATE TABLE IF NOT EXISTS teams (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_name text NOT NULL,
  student1 text,
  student2 text,
  student3 text,
  team_id text UNIQUE NOT NULL,
  password text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- QUESTIONS
CREATE TABLE IF NOT EXISTS questions (
  id serial PRIMARY KEY,
  question text NOT NULL,
  type text NOT NULL CHECK (type IN ('mcq', 'short')),
  options jsonb,
  correct_answer text NOT NULL
);

-- SUBMISSIONS
CREATE TABLE IF NOT EXISTS submissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id text NOT NULL REFERENCES teams(team_id),
  answers jsonb DEFAULT '{}',
  start_time timestamptz DEFAULT now(),
  submitted boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- VIOLATIONS
CREATE TABLE IF NOT EXISTS violations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id text NOT NULL,
  type text NOT NULL,
  timestamp timestamptz DEFAULT now()
);

-- GRADES
CREATE TABLE IF NOT EXISTS grades (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id text NOT NULL REFERENCES teams(team_id),
  score numeric DEFAULT 0,
  graded_at timestamptz DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;

-- Helper: is admin (check by email — replace with your admin email)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT coalesce(
    (SELECT email FROM auth.users WHERE id = auth.uid()) LIKE '%@admin.com',
    false
  );
$$;

-- Helper: current team_id from auth email
CREATE OR REPLACE FUNCTION current_team_id()
RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT split_part(
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    '@', 1
  );
$$;

-- TEAMS POLICIES
CREATE POLICY "Admin full access on teams" ON teams
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Students read own team" ON teams
  FOR SELECT TO authenticated
  USING (team_id = current_team_id());

-- QUESTIONS POLICIES (never expose correct_answer via RLS — use column security)
CREATE POLICY "Authenticated users can read questions" ON questions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can manage questions" ON questions
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Revoke correct_answer column from non-admin (column-level privilege)
-- Run as superuser:
REVOKE SELECT (correct_answer) ON questions FROM authenticated;
GRANT SELECT (correct_answer) ON questions TO service_role;

-- SUBMISSIONS POLICIES
CREATE POLICY "Students manage own submission" ON submissions
  FOR ALL TO authenticated
  USING (team_id = current_team_id())
  WITH CHECK (team_id = current_team_id());

CREATE POLICY "Admin full access on submissions" ON submissions
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- VIOLATIONS POLICIES
CREATE POLICY "Students insert violations" ON violations
  FOR INSERT TO authenticated WITH CHECK (team_id = current_team_id());

CREATE POLICY "Admin reads violations" ON violations
  FOR SELECT TO authenticated USING (is_admin());

-- GRADES POLICIES
CREATE POLICY "Admin full access on grades" ON grades
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Students read own grade" ON grades
  FOR SELECT TO authenticated USING (team_id = current_team_id());

-- ============================================================
-- SEED: 12 QUESTIONS (8 MCQ + 4 Short)
-- ============================================================

INSERT INTO questions (question, type, options, correct_answer) VALUES
-- MCQ 1
('What does HTML stand for?',
 'mcq',
 '["HyperText Markup Language", "HyperText Machine Language", "HighText Markup Language", "HyperTool Markup Language"]',
 'HyperText Markup Language'),

-- MCQ 2
('Which planet is known as the Red Planet?',
 'mcq',
 '["Venus", "Jupiter", "Mars", "Saturn"]',
 'Mars'),

-- MCQ 3
('What is the value of π (pi) to two decimal places?',
 'mcq',
 '["3.14", "3.16", "3.12", "3.18"]',
 '3.14'),

-- MCQ 4
('Which data structure uses LIFO order?',
 'mcq',
 '["Queue", "Stack", "Heap", "Tree"]',
 'Stack'),

-- MCQ 5
('What is the chemical symbol for Gold?',
 'mcq',
 '["Gd", "Go", "Au", "Ag"]',
 'Au'),

-- MCQ 6
('Which of these is NOT a programming language?',
 'mcq',
 '["Python", "Cobra", "HTML", "Ruby"]',
 'HTML'),

-- MCQ 7
('What does CPU stand for?',
 'mcq',
 '["Central Process Unit", "Central Processing Unit", "Computer Personal Unit", "Core Processing Unit"]',
 'Central Processing Unit'),

-- MCQ 8
('Which sorting algorithm has the best average-case time complexity?',
 'mcq',
 '["Bubble Sort", "Selection Sort", "Merge Sort", "Insertion Sort"]',
 'Merge Sort'),

-- Short 1
('Explain the difference between RAM and ROM in your own words.',
 'short',
 NULL,
 'RAM is volatile temporary memory used during runtime; ROM is non-volatile permanent storage that retains data without power.'),

-- Short 2
('What is recursion? Give a real-world analogy.',
 'short',
 NULL,
 'Recursion is a function calling itself to solve smaller sub-problems. Analogy: Russian nesting dolls or mirrors facing each other.'),

-- Short 3
('Describe what an IP address is and why it is needed.',
 'short',
 NULL,
 'An IP address is a unique numerical label assigned to each device on a network, used to identify and communicate between devices.'),

-- Short 4
('What is the difference between a compiler and an interpreter?',
 'short',
 NULL,
 'A compiler translates entire source code to machine code before execution; an interpreter translates and executes line by line.');
