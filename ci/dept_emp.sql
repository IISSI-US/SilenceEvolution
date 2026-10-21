-- SilenceEvolution
-- Copyright (C) 2026 DEAL research group, Universidad de Sevilla

-- Departments–Employees schema used by the integration test suite (ci/run_tests.sh).
--
-- Ported from the CI project of the old (Python) Silence
-- (https://github.com/DEAL-US/Silence-CI-Project, sql/*.sql): same tables, view and
-- seed data. Differences:
--   * `employees.password` was dropped: the new Silence keeps users in its own internal
--     database (`silence_users`), so the employees table is no longer the auth table.
--   * `startDate` (DATE) and `fee` (DOUBLE, CHECK 0..1) were added to cover more types.
--   * The self-referencing `bossId` FK uses ON DELETE SET NULL.
--
-- The database itself is created by the runner; this script is idempotent.

SET FOREIGN_KEY_CHECKS = 0;
DROP VIEW IF EXISTS topemployees;
DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS departments;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE departments (
    departmentId INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) DEFAULT NULL,
    city VARCHAR(64) DEFAULT NULL,
    UNIQUE (name, city)
);

CREATE TABLE employees (
    employeeId INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(256) UNIQUE NOT NULL,
    departmentId INT DEFAULT NULL,
    bossId INT DEFAULT NULL,
    firstName VARCHAR(256) NOT NULL,
    lastName VARCHAR(256) NOT NULL,
    startDate DATE DEFAULT NULL,
    salary DOUBLE DEFAULT 2000,
    fee DOUBLE DEFAULT NULL,
    position VARCHAR(256),
    isActive BOOLEAN NOT NULL,
    FOREIGN KEY (departmentId) REFERENCES departments (departmentId) ON DELETE SET NULL,
    FOREIGN KEY (bossId) REFERENCES employees (employeeId) ON DELETE SET NULL,
    CONSTRAINT validSalary CHECK (salary > 0),
    CONSTRAINT validFee CHECK (fee >= 0 AND fee <= 1)
);

CREATE VIEW topemployees AS
    SELECT * FROM employees WHERE salary > 2000;

INSERT INTO departments (departmentId, name, city) VALUES
    (1, 'Arte', 'Cádiz'),
    (2, 'Historia', NULL),
    (3, 'Informática', 'Sevilla');

INSERT INTO employees (employeeId, email, departmentId, bossId, firstName, lastName, startDate, salary, fee, position, isActive) VALUES
    (1, 'perianez@company.com', 1, NULL, 'Pedro', 'Periáñez', '2015-09-01', 2300, NULL, 'Manager', TRUE),
    (2, 'jimenez@company.com', 1, 1, 'José', 'Jiménez', '2012-03-12', 2500, NULL, 'CEO', TRUE),
    (3, 'lacalle@company.com', 2, 2, 'Lola', 'Lacalle', '2018-02-15', 2300, 0.2, 'Manager', TRUE),
    (4, 'linares@company.com', 1, 2, 'Luis', 'Linares', '2020-10-01', 1300, 0.15, 'Programmer', TRUE),
    (5, 'alvarez@company.com', 1, 3, 'Ana', 'Álvarez', '2022-01-17', 1300, 0.1, NULL, TRUE);
