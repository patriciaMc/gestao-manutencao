ALTER TABLE "contrato" ADD COLUMN "processo_sei" TEXT;
ALTER TABLE "ata" ADD COLUMN "processo_sei" TEXT, ADD COLUMN "prestador_id" TEXT;
CREATE INDEX "ata_prestador_id_idx" ON "ata"("prestador_id");
ALTER TABLE "ata" ADD CONSTRAINT "ata_prestador_id_fkey"
  FOREIGN KEY ("prestador_id") REFERENCES "prestador_servico"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
