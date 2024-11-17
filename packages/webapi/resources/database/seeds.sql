TRUNCATE TABLE sys_role CASCADE;
INSERT INTO sys_role (role, description, is_active, is_system, id) VALUES
('Administrator', 'System Administratiove Role', true, true, '7b7bc2512ee1fedcd76bdc68926d4f7b'::uuid)