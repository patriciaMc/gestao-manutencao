CREATE TYPE "PrioridadeCivil" AS ENUM ('BAIXA', 'MEDIA', 'CRITICA');
ALTER TABLE "manutencao"
  ADD COLUMN "prioridade_civil" "PrioridadeCivil",
  ADD COLUMN "sla_civil_iniciado_em" TIMESTAMP(3),
  ADD COLUMN "sla_civil_vence_em" TIMESTAMP(3);
