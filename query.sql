UPDATE tul_clan_members SET role = 'leader' WHERE user_id = (SELECT user_id FROM users WHERE email = 'cm8175@gmail.com');
