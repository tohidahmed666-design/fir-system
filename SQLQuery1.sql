CREATE DATABASE FIR_System;
GO

USE FIR_System;


CREATE TABLE users (
    id INT PRIMARY KEY IDENTITY(1,1),
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(10) CHECK (role IN ('admin','subuser')) NOT NULL
);


CREATE TABLE fir_records (
    id INT IDENTITY(1,1) PRIMARY KEY,

    police_station VARCHAR(100) ,
    fir_number VARCHAR(50) NOT NULL,
    fir_date DATE NOT NULL,
    crime_type VARCHAR(20),
    created_at DATETIME DEFAULT GETDATE()
);

ALTER TABLE fir_records
ADD duration VARCHAR(100);

-- ADMIN
INSERT INTO users (username, password, role)
VALUES ('DCRB DPO Gadag', 'default@123', 'admin');


ALTER TABLE fir_records
ADD chargesheet_filed BIT DEFAULT 0;

select * from users
select * from fir_records

drop table fir_records
