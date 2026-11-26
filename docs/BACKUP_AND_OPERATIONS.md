# Backup, Restore & Custom-Domain Operations

## 1. PostgreSQL Backup & Restore
- **Create logical backup:**
  ```bash
  docker compose exec -T postgres pg_dump -U doria -Fc doria > doria-$(date +%F).dump
  ```
- **Restore backup:**
  ```bash
  docker compose exec -T postgres pg_restore -U doria -d doria --clean --if-exists < doria-YYYY-MM-DD.dump
  ```

## 2. MinIO / S3 Object Storage Backup
- Mirror the `doria-media` bucket using MinIO Client (`mc`):
  ```bash
  mc alias set doria-s3 http://localhost:9000 "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY"
  mc mirror doria-s3/doria-media ./backups/doria-media-$(date +%F)/
  ```

## 3. Data Migration from Legacy Export
1. Export collections from the legacy environment into a JSON bundle (excluding plaintext secrets).
2. Run the Phase 6 importer and count verifier:
   ```bash
   npx tsx scripts/migrate-data/import-doria-export.ts ./export.json
   npx tsx scripts/migrate-data/verify-counts.ts ./export.json
   ```

## 4. Custom Domain HTTPS Cutover
1. Point your domain's DNS `A`/`AAAA` records to your server.
2. In `.env`, set `DORIA_DOMAIN=doria.yourdomain.com`, `PUBLIC_APP_URL=https://doria.yourdomain.com`, `BETTER_AUTH_URL=https://doria.yourdomain.com`, `CORS_ORIGIN=https://doria.yourdomain.com`, and `VITE_APP_PUBLIC_URL=https://doria.yourdomain.com`.
3. Expose ports `80:80` and `443:443` on the `caddy` service in `docker-compose.yml` and run `docker compose up --build -d`.
