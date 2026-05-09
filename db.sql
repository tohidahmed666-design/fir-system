CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(10) CHECK (role IN ('admin','subuser')) NOT NULL
);

CREATE TABLE fir_records (
    id SERIAL PRIMARY KEY,
    police_station VARCHAR(100),
    fir_number VARCHAR(50) NOT NULL,
    fir_date DATE NOT NULL,
    crime_type VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration VARCHAR(100),
    chargesheet_filed BOOLEAN DEFAULT false
);

-- ADMIN
INSERT INTO users (username, password, role)
VALUES ('DCRB DPO Gadag', 'default@123', 'admin');
