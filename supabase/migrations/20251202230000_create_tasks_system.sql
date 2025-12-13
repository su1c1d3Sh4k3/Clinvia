-- Create task_boards table
CREATE TABLE task_boards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_hour INTEGER NOT NULL DEFAULT 8,
    end_hour INTEGER NOT NULL DEFAULT 18,
    interval_minutes INTEGER NOT NULL DEFAULT 30,
    allowed_agents UUID[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create tasks table
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    board_id UUID NOT NULL REFERENCES task_boards(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    urgency TEXT CHECK (urgency IN ('low', 'medium', 'high')),
    due_date TIMESTAMPTZ,
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    type TEXT CHECK (type IN ('activity', 'schedule', 'absence', 'busy', 'reminder')),
    recurrence TEXT CHECK (recurrence IN ('daily', 'once')) DEFAULT 'once',
    crm_deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    status TEXT CHECK (status IN ('pending', 'open', 'finished')) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE task_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Policies for task_boards
CREATE POLICY "Users can view their own boards or boards they are allowed in"
    ON task_boards FOR SELECT
    USING (auth.uid() = user_id OR auth.uid() = ANY(allowed_agents));

CREATE POLICY "Users can insert their own boards"
    ON task_boards FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own boards"
    ON task_boards FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own boards"
    ON task_boards FOR DELETE
    USING (auth.uid() = user_id);

-- Policies for tasks
CREATE POLICY "Users can view tasks on boards they have access to"
    ON tasks FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM task_boards
            WHERE task_boards.id = tasks.board_id
            AND (task_boards.user_id = auth.uid() OR auth.uid() = ANY(task_boards.allowed_agents))
        )
    );

CREATE POLICY "Users can insert tasks on boards they have access to"
    ON tasks FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM task_boards
            WHERE task_boards.id = board_id
            AND (task_boards.user_id = auth.uid() OR auth.uid() = ANY(task_boards.allowed_agents))
        )
    );

CREATE POLICY "Users can update tasks on boards they have access to"
    ON tasks FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM task_boards
            WHERE task_boards.id = tasks.board_id
            AND (task_boards.user_id = auth.uid() OR auth.uid() = ANY(task_boards.allowed_agents))
        )
    );

CREATE POLICY "Users can delete tasks on boards they have access to"
    ON tasks FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM task_boards
            WHERE task_boards.id = tasks.board_id
            AND (task_boards.user_id = auth.uid() OR auth.uid() = ANY(task_boards.allowed_agents))
        )
    );
