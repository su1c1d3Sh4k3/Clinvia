-- Fix: task_boards e tasks precisam usar get_owner_id() para isolamento multi-tenant
-- O padrão anterior usava auth.uid() diretamente, bloqueando supervisores de ver/criar
-- quadros do seu tenant (admin).

-- ─── task_boards ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view their own boards or boards they are allowed in" ON task_boards;
DROP POLICY IF EXISTS "Users can insert their own boards" ON task_boards;
DROP POLICY IF EXISTS "Users can update their own boards" ON task_boards;
DROP POLICY IF EXISTS "Users can delete their own boards" ON task_boards;

CREATE POLICY "Team can view boards"
    ON task_boards FOR SELECT
    USING (user_id = get_owner_id() OR auth.uid() = ANY(allowed_agents));

CREATE POLICY "Team can insert boards"
    ON task_boards FOR INSERT
    WITH CHECK (user_id = get_owner_id());

CREATE POLICY "Team can update boards"
    ON task_boards FOR UPDATE
    USING (user_id = get_owner_id());

CREATE POLICY "Team can delete boards"
    ON task_boards FOR DELETE
    USING (user_id = get_owner_id());

-- ─── tasks ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view tasks on boards they have access to" ON tasks;
DROP POLICY IF EXISTS "Users can insert tasks on boards they have access to" ON tasks;
DROP POLICY IF EXISTS "Users can update tasks on boards they have access to" ON tasks;
DROP POLICY IF EXISTS "Users can delete tasks on boards they have access to" ON tasks;

CREATE POLICY "Team can view tasks"
    ON tasks FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM task_boards
            WHERE task_boards.id = tasks.board_id
            AND (task_boards.user_id = get_owner_id() OR auth.uid() = ANY(task_boards.allowed_agents))
        )
    );

CREATE POLICY "Team can insert tasks"
    ON tasks FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM task_boards
            WHERE task_boards.id = board_id
            AND (task_boards.user_id = get_owner_id() OR auth.uid() = ANY(task_boards.allowed_agents))
        )
    );

CREATE POLICY "Team can update tasks"
    ON tasks FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM task_boards
            WHERE task_boards.id = tasks.board_id
            AND (task_boards.user_id = get_owner_id() OR auth.uid() = ANY(task_boards.allowed_agents))
        )
    );

CREATE POLICY "Team can delete tasks"
    ON tasks FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM task_boards
            WHERE task_boards.id = tasks.board_id
            AND (task_boards.user_id = get_owner_id() OR auth.uid() = ANY(task_boards.allowed_agents))
        )
    );
