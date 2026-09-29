# E-POCH Medical System

E-POCH is a local-network clinic system: one web application with an Administration, Clinical,
Reception and Pharmacy workspace, backed by one Express API and PostgreSQL database.

## Address

| | Address on the clinic network |
|---|---|
| The application | `http://<server-ip>:5173` |
| API health | `http://<server-ip>:3000/health` |

Everyone opens the same address and signs in. The workspace that loads follows the account's role,
and staff who hold two roles (front desk covers reception and pharmacy) switch between them without
signing out.

The usual two-computer setup runs Docker and PostgreSQL on the front-desk computer. The doctor
computer only needs a browser.

## Fastest production deployment

Build the offline bundle on an internet-connected development machine with Docker:

```sh
./deploy/build-clinic-image.sh deploy/releases/epoch-clinic
```

The output directory must be empty. Copy `deploy/releases/epoch-clinic` to the clinic server, then:

```sh
cd epoch-clinic
cp clinic.env.example clinic.env
# Edit clinic.env: SITE_HOST, the database password in all three locations, and JWT_SECRET.
./start-clinic.sh admin
```

Use a fixed LAN IP for the clinic server. Do not expose ports 3000 or 5173 to the internet.
Configure an encrypted backup to an external device and complete a restore drill before entering
real patient data.

Full installation, updating, backup and recovery instructions are in [deploy/README.md](deploy/README.md).

## Development verification

```sh
cd backend && npm run test:isolated
cd ../frontend && npm run build
cd ../doctor-frontend && npm run build
cd ../receptionist-frontend && npm run build
cd ../pharmacist-frontend && npm run build
```

The isolated backend test command uses a throwaway PostgreSQL 17 container and never targets the
configured clinic database.
